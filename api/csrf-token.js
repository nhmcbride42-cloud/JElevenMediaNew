// api/csrf-token.js
//
// GET /api/csrf-token
//
// Issues a random CSRF token using the "double-submit cookie" pattern, which
// works without server-side session storage — a good fit for stateless
// serverless functions. The same token is:
//   1. Set as an HttpOnly, Secure, SameSite=Strict cookie (server can read it
//      back on the next request; client-side JS/XSS cannot read the cookie).
//   2. Returned in the JSON response body, so the legitimate page's own JS
//      can echo it back as a header on the actual form submission.
// A cross-site attacker can trigger a request to /api/contact from another
// origin, but same-origin policy prevents them from reading this response
// body to learn the token — so they cannot make the two values match.

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');

const app = express();

// Trust Vercel's proxy so rate limiting keys on the real client IP.
app.set('trust proxy', 1);

// Defense in depth: vercel.json already sets these at the edge, but setting
// them here too means the API behaves correctly even if invoked in an
// environment where that config doesn't apply (e.g. local `vercel dev`).
// Content-Security-Policy is already set at the edge via vercel.json;
// disabling it here avoids sending two CSP headers that could conflict.
// Helmet's other headers (X-Content-Type-Options, X-Frame-Options, etc.)
// still apply as defense in depth.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cookieParser());

// Restrict which origins may call this endpoint with credentials. Must be an
// explicit origin (not "*") because we use credentials: true for cookies.
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://www.jelevenmedia.com';
app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
    methods: ['GET'],
  })
);

// Token minting is cheap but should still be rate-limited so it can't be
// used to exhaust resources or as a side channel for probing.
const tokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again shortly.' },
});
app.use(tokenLimiter);

app.get('/api/csrf-token', async (req, res) => {
  try {
    const token = crypto.randomBytes(32).toString('hex');

    res.cookie('csrf_token', token, {
      httpOnly: true,
      secure: true, // site is HTTPS-only; never sent over plain HTTP
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 1000, // 1 hour
    });

    res.status(200).json({ csrfToken: token });
  } catch (err) {
    // Log full detail server-side only; never leak internals to the client.
    console.error('csrf-token error:', err);
    res.status(500).json({ error: 'Unable to issue token. Please try again.' });
  }
});

module.exports = app;
