// api/contact.js
//
// POST /api/contact
//
// Validates and processes the project form on the Contact page (/contact). Every layer here assumes the
// client-side checks have already been bypassed by the time a request
// reaches this function — this is the layer that actually enforces security
// and data integrity.

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
// The tap-to-select options and dropdowns store short slugs; these map each
// slug back to the text a person actually reads. Keep them in sync with the
// option values in contact.html.
const LABELS = {
  contact_method: { email: 'Email', phone: 'Phone call', text: 'Text' },
  needs: {
    'new-website': 'New website',
    redesign: 'Redesign current site',
    'online-store': 'Online store',
    'care-plan': 'Care plan / hosting',
    'google-business-profile': 'Google Business Profile',
    'social-media': 'Social media',
    'not-sure': 'Not sure yet',
  },
  package: {
    starter: 'Starter ($500)',
    essentials: 'Essentials ($1,000)',
    studio: 'Studio ($2,000)',
    signature: 'Signature (from $3,500)',
    'simple-online-sales': 'Simple Online Sales ($500)',
    'shop-essentials': 'Shop Essentials ($2,000)',
    'shop-studio': 'Shop Studio ($4,000)',
    'shop-signature': 'Shop Signature (from $6,000)',
    care: 'Care ($50/month)',
    'care-plus': 'Care Plus ($100/month)',
    'not-sure': 'Not sure yet',
  },
  budget: {
    'under-1000': 'Under $1,000',
    '1000-2000': '$1,000 - $2,000',
    '2000-4000': '$2,000 - $4,000',
    '4000-plus': '$4,000+',
    'not-sure': 'Not sure yet',
  },
  pages: { 1: '1 page', '2-3': '2-3 pages', 'up-to-10': 'Up to 10', '10-plus': '10+', 'not-sure': 'Not sure' },
  timeline: { asap: 'As soon as possible', '1-2-months': 'In 1-2 months', '3-plus-months': '3+ months', flexible: 'Flexible' },
  logo: { yes: 'Yes', no: 'No', 'need-help': 'Needs help with one' },
  content_ready: { yes: 'Yes', some: 'Some of it', 'not-yet': 'Not yet' },
  referral: { google: 'Google search', facebook: 'Facebook', instagram: 'Instagram', referral: 'A friend or client', other: 'Other' },
};
// Allowed values for a field, with '' meaning "not answered".
const choice = (field) => z.enum(['', ...Object.keys(LABELS[field])]).optional().default('');
const label = (field, value) => (value ? LABELS[field][value] : 'Not provided');
const orNotProvided = (value) => value || 'Not provided';

const app = express();

// Vercel sits in front of this function as a proxy. Without this, req.ip is
// the proxy's address, so every visitor would share a single rate-limit bucket.
app.set('trust proxy', 1);

// Content-Security-Policy is already set at the edge via vercel.json;
// disabling it here avoids sending two CSP headers that could conflict.
// Helmet's other headers (X-Content-Type-Options, X-Frame-Options, etc.)
// still apply as defense in depth.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cookieParser());
app.use(express.json({ limit: '20kb' })); // small limit: this is a short contact form, not a file upload

const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://www.jelevenmedia.com';
app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
    methods: ['POST'],
  })
);

// Strict rate limit: a contact form has no legitimate reason to be submitted
// more than a handful of times per IP in a 15-minute window. This is the
// primary defense against automated spam and brute-force abuse.
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment and try again.' },
});
app.use(contactLimiter);

// --- Validation schema -----------------------------------------------------
// Reject carriage-return/line-feed characters in fields that could end up in
// email headers (name is used in the subject line) — the classic email
// header injection vector.
const noHeaderInjection = (val) => !/[\r\n]/.test(val);

const optionalText = (max) => z.string().trim().max(max, `Must be under ${max} characters.`).optional().default('');

const ContactSchema = z.object({
  // Step 1: about you
  name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(100, 'Name must be under 100 characters.')
    .refine(noHeaderInjection, 'Name contains invalid characters.'),
  email: z
    .string()
    .trim()
    .min(1, 'Email is required.')
    .max(254, 'Email is too long.')
    .email('Enter a valid email address.')
    .refine(noHeaderInjection, 'Email contains invalid characters.'),
  phone: optionalText(30),
  business: optionalText(150),
  website: optionalText(200),
  contact_method: choice('contact_method'),
  // Step 2: the project
  needs: z.array(z.enum(Object.keys(LABELS.needs))).max(7).optional().default([]),
  package: choice('package'),
  budget: choice('budget'),
  pages: choice('pages'),
  timeline: choice('timeline'),
  // Step 3: details
  logo: choice('logo'),
  content_ready: choice('content_ready'),
  sites_you_like: optionalText(500),
  message: z
    .string()
    .trim()
    .min(1, 'Please tell us a little about your business.')
    .max(2000, 'Message must be under 2000 characters.'),
  referral: choice('referral'),
  // Honeypot: legitimate users never see or fill this field.
  hp_field: z.string().optional().default(''),
  csrf_token: z.string().optional().default(''),
});

app.post('/api/contact', async (req, res) => {
  try {
    // --- 1. CSRF verification (double-submit cookie) -----------------------
    const cookieToken = req.cookies.csrf_token;
    const headerToken = req.get('X-CSRF-Token');
    const bodyToken = req.body && req.body.csrf_token;
    const submittedToken = headerToken || bodyToken;

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
    const parsed = ContactSchema.safeParse(req.body);
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
    // If the hidden field is filled in, this is almost certainly a bot.
    // Respond with a normal-looking success so automated scripts don't learn
    // the submission was detected, but skip sending anything.
    if (d.hp_field && d.hp_field.trim() !== '') {
      return res.status(200).json({ success: true });
    }

    // --- 4. Build the email rows -------------------------------------------
    // A row with a null label is a section heading.
    const rows = [
      [null, 'About them'],
      ['Name', d.name],
      ['Email', d.email],
      ['Phone', orNotProvided(d.phone)],
      ['Business', orNotProvided(d.business)],
      ['Current website', orNotProvided(d.website)],
      ['Best way to reach them', label('contact_method', d.contact_method)],
      [null, 'The project'],
      ['Needs', d.needs.length ? d.needs.map((n) => LABELS.needs[n]).join(', ') : 'Not provided'],
      ['Package', label('package', d.package)],
      ['Budget', label('budget', d.budget)],
      ['Pages', label('pages', d.pages)],
      ['Launch', label('timeline', d.timeline)],
      [null, 'Details'],
      ['Has a logo', label('logo', d.logo)],
      ['Text and photos ready', label('content_ready', d.content_ready)],
      ['Websites they like', orNotProvided(d.sites_you_like)],
      ['Heard about us', label('referral', d.referral)],
    ];
    // Escape HTML-significant characters so nothing in the submission can
    // inject markup into the HTML email.
    const safeMessage = validator.escape(d.message).replace(/\n/g, '<br>');

    // --- 5. Send email via Resend -------------------------------------------
    // Created per request so a missing env var fails with a logged error
    // instead of crashing the whole function at load time.
    if (!process.env.RESEND_API_KEY || !process.env.CONTACT_FROM_EMAIL || !process.env.CONTACT_TO_EMAIL) {
      console.error('contact form error: RESEND_API_KEY, CONTACT_FROM_EMAIL or CONTACT_TO_EMAIL is not set');
      return res.status(500).json({ error: 'Something went wrong sending your message. Please try again.' });
    }
    const resend = new Resend(process.env.RESEND_API_KEY);

    const { error } = await resend.emails.send({
      from: process.env.CONTACT_FROM_EMAIL, // must be on a verified domain (or onboarding@resend.dev)
      to: process.env.CONTACT_TO_EMAIL,
      replyTo: d.email, // safe: validated by Zod's .email(), and CR/LF-checked above
      subject: `New project inquiry from ${d.name}`,
      html: renderContactEmail(
        rows.map(([l, value]) => [l, validator.escape(value)]),
        safeMessage
      ),
      text: `${rows.map(([l, value]) => (l ? `${l}: ${value}` : `\n${value.toUpperCase()}`)).join('\n')}\n\nAbout their business:\n${d.message}`,
    });

    if (error) {
      // Resend returns a structured error object instead of throwing — log it
      // server-side, but never forward its details to the client.
      console.error('contact form error:', error);
      return res.status(500).json({ error: 'Something went wrong sending your message. Please try again.' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    // Log full detail server-side for debugging; the client only ever gets a
    // generic message so no internal details are exposed.
    console.error('contact form error:', err);
    return res.status(500).json({ error: 'Something went wrong sending your message. Please try again.' });
  }
});

module.exports = app;
