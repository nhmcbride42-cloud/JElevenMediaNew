// scripts/dev-server.js
//
// Local preview with a WORKING contact form, no Vercel login needed.
// Serves the site the way Vercel does (clean URLs, redirects, security
// headers from vercel.json) and runs the /api functions, reading settings
// from the .env file in the project root.
//
// Run: npm run local   (then open http://localhost:3000)

const fs = require('fs');
const path = require('path');
const express = require('express');

const root = path.join(__dirname, '..');

// ── Load .env (KEY=value lines; # comments and blank lines ignored) ──
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    let value = m[2].trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
} else {
  console.warn('No .env file found. Copy .env.example to .env and fill it in, or the form cannot send.');
}

const port = Number(process.env.PORT) || 3000;

// The browser must call the API from the address ALLOWED_ORIGIN names. Locally
// that's this server, unless .env says otherwise (e.g. a Codespaces URL).
if (!process.env.ALLOWED_ORIGIN || process.env.ALLOWED_ORIGIN.includes('jelevenmedia.com')) {
  process.env.ALLOWED_ORIGIN = `http://localhost:${port}`;
}

const missing = ['RESEND_API_KEY', 'CONTACT_FROM_EMAIL', 'CONTACT_TO_EMAIL'].filter((k) => !process.env[k]);
if (missing.length) console.warn(`Missing in .env: ${missing.join(', ')}. The form will show an error until they are set.`);

const vercel = require(path.join(root, 'vercel.json'));
const app = express();

// Same security headers as production.
const headers = vercel.headers.find((h) => h.source === '/(.*)').headers;
app.use((req, res, next) => {
  headers.forEach((h) => {
    // Plain-HTTP localhost can't use these two.
    if (h.key === 'Strict-Transport-Security') return;
    res.set(h.key, h.key === 'Content-Security-Policy' ? h.value.replace('; upgrade-insecure-requests', '') : h.value);
  });
  next();
});

// Redirects from vercel.json
vercel.redirects.forEach((r) => app.get(r.source, (req, res) => res.redirect(301, r.destination)));

// API functions, each on its own path (they share nothing with the pages).
const csrfApp = require(path.join(root, 'api/csrf-token.js'));
const contactApp = require(path.join(root, 'api/contact.js'));
app.all('/api/csrf-token', (req, res) => csrfApp(req, res));
app.all('/api/contact', (req, res) => contactApp(req, res));

// Vercel Analytics script only exists on Vercel.
app.get('/_vercel/*', (req, res) => res.type('js').send(''));

// Clean URLs: /about serves about.html; /about.html redirects to /about.
app.use((req, res, next) => {
  if (req.path.endsWith('.html')) return res.redirect(301, req.path.replace(/\.html$/, '') || '/');
  const file = path.join(root, req.path === '/' ? 'index.html' : `${req.path}.html`);
  if (!path.extname(req.path) && fs.existsSync(file)) return res.sendFile(file);
  next();
});
app.use(express.static(root, { dotfiles: 'ignore' }));
app.use((req, res) => res.status(404).sendFile(path.join(root, '404.html')));

app.listen(port, () => {
  console.log(`Site running at http://localhost:${port}`);
  console.log(`Form emails go to: ${process.env.CONTACT_TO_EMAIL || '(not set)'}, from: ${process.env.CONTACT_FROM_EMAIL || '(not set)'}`);
});
