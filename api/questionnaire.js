// api/questionnaire.js
//
// POST /api/questionnaire
//
// Receives the new-client questionnaire (/questionnaire, an unlisted page
// sent to clients once they've chosen J Eleven Media) and emails the answers
// to CONTACT_TO_EMAIL. Same protections as /api/contact: CSRF token,
// honeypot, rate limit, Zod validation, and HTML-escaping.

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { z } = require('zod');
const validator = require('validator');
const { Resend } = require('resend');
const crypto = require('crypto');
const { renderContactEmail } = require('../lib/contact-email');

// --- Email display labels ---------------------------------------------
// The tap-to-select options store short slugs; these map each slug back to
// the text a person reads. Keep them in sync with questionnaire.html.
const LABELS = {
  goals: {
    calls: 'Get more calls and inquiries',
    bookings: 'Get bookings or appointments',
    sell: 'Sell products online',
    showcase: 'Show off their work',
    inform: 'Share information (hours, menu, services)',
    credibility: 'Look more professional and trustworthy',
  },
  first_action: { call: 'Call them', form: 'Fill out a contact form', book: 'Book an appointment', buy: 'Buy something', visit: 'Visit in person' },
  style: {
    warm: 'Warm', modern: 'Modern', classic: 'Classic', bold: 'Bold', playful: 'Playful',
    elegant: 'Elegant', minimal: 'Clean and minimal', rustic: 'Rustic', professional: 'Professional', friendly: 'Friendly',
  },
  logo: { yes: 'Yes', no: 'No', 'need-help': 'Needs help with one' },
  pages: {
    home: 'Home', about: 'About', services: 'Services', gallery: 'Gallery / portfolio', testimonials: 'Testimonials',
    faq: 'FAQ', contact: 'Contact', blog: 'Blog / news', team: 'Team', pricing: 'Pricing',
  },
  features: {
    'contact-form': 'Contact form', booking: 'Online booking', store: 'Online store', reviews: 'Reviews',
    map: 'Map / directions', newsletter: 'Email newsletter signup', social: 'Social media links',
  },
  content_ready: { yes: 'Yes, ready to send', some: 'Some of it', 'need-help': 'Needs help writing it' },
  photos: { professional: 'Professional photos', phone: 'Phone photos', 'need-stock': 'Needs stock photos' },
  domain: { have: 'Already has one', need: 'Needs one', 'not-sure': 'Not sure' },
};
// Allowed values for single-choice fields, with '' meaning "not answered".
const choice = (field) => z.enum(['', ...Object.keys(LABELS[field])]).optional().default('');
// Allowed values for pick-several fields.
const list = (field) => z.array(z.enum(Object.keys(LABELS[field]))).max(Object.keys(LABELS[field]).length).optional().default([]);
const optionalText = (max) => z.string().trim().max(max, `Must be under ${max} characters.`).optional().default('');
const label = (field, value) => (value ? LABELS[field][value] : 'Not provided');
const labels = (field, values) => (values.length ? values.map((v) => LABELS[field][v]).join(', ') : 'Not provided');
const orNotProvided = (value) => value || 'Not provided';

const app = express();

// Vercel sits in front of this function as a proxy; trust it so rate
// limiting keys on the real client IP.
app.set('trust proxy', 1);

// Content-Security-Policy is already set at the edge via vercel.json.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cookieParser());
app.use(express.json({ limit: '40kb' }));

const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://www.jelevenmedia.com';
app.use(cors({ origin: allowedOrigin, credentials: true, methods: ['POST'] }));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a moment and try again.' },
  })
);

// Reject CR/LF in fields used in email headers (name and business go in the
// subject line) — the classic email header injection vector.
const noHeaderInjection = (val) => !/[\r\n]/.test(val);

const QuestionnaireSchema = z.object({
  // About you and your business
  name: z.string().trim().min(1, 'Name is required.').max(100, 'Name must be under 100 characters.')
    .refine(noHeaderInjection, 'Name contains invalid characters.'),
  email: z.string().trim().min(1, 'Email is required.').max(254, 'Email is too long.')
    .email('Enter a valid email address.').refine(noHeaderInjection, 'Email contains invalid characters.'),
  phone: optionalText(30),
  business: z.string().trim().min(1, 'Business name is required.').max(150, 'Must be under 150 characters.')
    .refine(noHeaderInjection, 'Business name contains invalid characters.'),
  website: optionalText(200),
  about: z.string().trim().min(1, 'Please tell us a little about your business.').max(1500, 'Must be under 1500 characters.'),
  customers: optionalText(1000),
  // Goals
  goals: list('goals'),
  first_action: choice('first_action'),
  // Look and feel
  style: list('style'),
  colors: optionalText(300),
  logo: choice('logo'),
  sites_you_like: optionalText(1000),
  avoid: optionalText(1000),
  // What to include
  pages: list('pages'),
  features: list('features'),
  content_ready: choice('content_ready'),
  photos: choice('photos'),
  // Logistics
  domain: choice('domain'),
  domain_name: optionalText(200),
  launch: optionalText(150),
  decision: optionalText(150),
  notes: optionalText(2000),
  // Honeypot: legitimate users never see or fill this field.
  hp_field: z.string().optional().default(''),
  csrf_token: z.string().optional().default(''),
});

app.post('/api/questionnaire', async (req, res) => {
  try {
    // --- 1. CSRF verification (double-submit cookie) -----------------------
    const cookieToken = req.cookies.csrf_token;
    const submittedToken = req.get('X-CSRF-Token') || (req.body && req.body.csrf_token);
    const cookieBuf = Buffer.from(cookieToken || '', 'utf8');
    const submittedBuf = Buffer.from(submittedToken || '', 'utf8');
    const csrfValid =
      cookieToken &&
      submittedToken &&
      cookieBuf.length === submittedBuf.length &&
      crypto.timingSafeEqual(cookieBuf, submittedBuf);
    if (!csrfValid) {
      return res.status(403).json({ error: 'Invalid or expired form session. Please refresh and try again.' });
    }

    // --- 2. Schema validation ------------------------------------------------
    const parsed = QuestionnaireSchema.safeParse(req.body);
    if (!parsed.success) {
      const fieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
      }
      return res.status(400).json({ error: 'Validation failed.', fieldErrors });
    }
    const d = parsed.data;

    // --- 3. Honeypot check ---------------------------------------------------
    if (d.hp_field && d.hp_field.trim() !== '') {
      return res.status(200).json({ success: true });
    }

    // --- 4. Build the email rows (a null label is a section heading) --------
    const rows = [
      [null, 'About them'],
      ['Name', d.name],
      ['Email', d.email],
      ['Phone', orNotProvided(d.phone)],
      ['Business', d.business],
      ['Current website', orNotProvided(d.website)],
      ['What they do', d.about],
      ['Ideal customers', orNotProvided(d.customers)],
      [null, 'Goals'],
      ['Website should help them', labels('goals', d.goals)],
      ['Visitors should first', label('first_action', d.first_action)],
      [null, 'Look and feel'],
      ['Style words', labels('style', d.style)],
      ['Brand colors', orNotProvided(d.colors)],
      ['Has a logo', label('logo', d.logo)],
      ['Websites they like', orNotProvided(d.sites_you_like)],
      ['Wants to avoid', orNotProvided(d.avoid)],
      [null, 'What to include'],
      ['Pages', labels('pages', d.pages)],
      ['Features', labels('features', d.features)],
      ['Text ready', label('content_ready', d.content_ready)],
      ['Photos', label('photos', d.photos)],
      [null, 'Logistics'],
      ['Domain', label('domain', d.domain) + (d.domain_name ? ` (${d.domain_name})` : '')],
      ['Launch date / deadline', orNotProvided(d.launch)],
      ['Who approves the site', orNotProvided(d.decision)],
    ];
    const safeNotes = d.notes ? validator.escape(d.notes).replace(/\n/g, '<br>') : 'Nothing else added.';

    // --- 5. Send email via Resend -------------------------------------------
    if (!process.env.RESEND_API_KEY || !process.env.CONTACT_FROM_EMAIL || !process.env.CONTACT_TO_EMAIL) {
      console.error('questionnaire error: RESEND_API_KEY, CONTACT_FROM_EMAIL or CONTACT_TO_EMAIL is not set');
      return res.status(500).json({ error: 'Something went wrong sending your answers. Please try again.' });
    }
    const resend = new Resend(process.env.RESEND_API_KEY);

    const { error } = await resend.emails.send({
      from: process.env.CONTACT_FROM_EMAIL,
      to: process.env.CONTACT_TO_EMAIL,
      replyTo: d.email, // safe: validated by Zod's .email(), and CR/LF-checked above
      subject: `Website questionnaire: ${d.business} (${d.name})`,
      html: renderContactEmail(
        rows.map(([l, value]) => [l, validator.escape(value).replace(/\n/g, '<br>')]),
        safeNotes,
        { title: `Website questionnaire: ${validator.escape(d.business)}`, source: 'Client questionnaire', messageLabel: 'Anything else' }
      ),
      text: `${rows.map(([l, value]) => (l ? `${l}: ${value}` : `\n${value.toUpperCase()}`)).join('\n')}\n\nAnything else:\n${d.notes || 'Nothing else added.'}`,
    });

    if (error) {
      console.error('questionnaire error:', error);
      return res.status(500).json({ error: 'Something went wrong sending your answers. Please try again.' });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('questionnaire error:', err);
    return res.status(500).json({ error: 'Something went wrong sending your answers. Please try again.' });
  }
});

module.exports = app;
