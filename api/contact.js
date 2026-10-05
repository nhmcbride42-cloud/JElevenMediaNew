// api/contact.js
//
// POST /api/contact
//
// Validates and processes both contact forms (homepage section and the
// "Get Started" pop-up on service pages). Every layer here assumes the
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
// The pop-up's checkboxes store short slugs; these map each slug back to the
// text a person actually reads.
const SERVICE_LABELS = {
  website: 'Website',
  'online-store': 'Online Store',
  'care-plan': 'Care Plan',
  'add-ons': 'Add-Ons',
  'social-media': 'Social Media',
};

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

const ContactSchema = z.object({
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
  phone: z.string().trim().max(30, 'Phone number is too long.').optional().default(''),
  services: z
    .array(z.enum(['website', 'online-store', 'care-plan', 'add-ons', 'social-media']))
    .max(5)
    .optional()
    .default([]),
  message: z
    .string()
    .trim()
    .min(1, 'Message is required.')
    .max(2000, 'Message must be under 2000 characters.'),
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

    const { name, email, phone, services, message, hp_field } = parsed.data;

    // --- 3. Honeypot check ---------------------------------------------------
    // If the hidden field is filled in, this is almost certainly a bot.
    // Respond with a normal-looking success so automated scripts don't learn
    // the submission was detected, but skip sending anything.
    if (hp_field && hp_field.trim() !== '') {
      return res.status(200).json({ success: true });
    }

    // --- 4. Build the email rows ---------------------------------------------
    const rows = [
      ['Name', name],
      ['Email', email],
      ['Phone', phone || 'Not provided'],
    ];
    if (services.length > 0) {
      rows.push(['Interested In', services.map((s) => SERVICE_LABELS[s]).join(', ')]);
    }
    // Escape HTML-significant characters so nothing in the submission can
    // inject markup into the HTML email.
    const safeMessage = validator.escape(message).replace(/\n/g, '<br>');

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
      replyTo: email, // safe: validated by Zod's .email(), and CR/LF-checked above
      subject: `New inquiry from ${name}`,
      html: renderContactEmail(
        rows.map(([label, value]) => [label, validator.escape(value)]),
        safeMessage,
        { name: validator.escape(name), email: validator.escape(email) }
      ),
      text: `${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\nMessage:\n${message}`,
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
