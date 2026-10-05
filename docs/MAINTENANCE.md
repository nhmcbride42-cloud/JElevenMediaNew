# J Eleven Media Website — Maintenance Manual

Everything needed to run, edit, troubleshoot and extend jelevenmedia.com.

---

## Contents

1. [Quick reference](#1-quick-reference)
2. [How the site works](#2-how-the-site-works)
3. [Day-to-day workflow](#3-day-to-day-workflow)
4. [Project map](#4-project-map)
5. [Pages](#5-pages)
6. [Shared pieces (partials)](#6-shared-pieces-partials)
7. [Changing prices and packages](#7-changing-prices-and-packages)
8. [Styling (Tailwind CSS)](#8-styling-tailwind-css)
9. [Homepage behavior](#9-homepage-behavior)
10. [Images and fonts](#10-images-and-fonts)
11. [SEO](#11-seo)
12. [Security settings](#12-security-settings)
13. [Contact forms and email](#13-contact-forms-and-email)
14. [Environment variables](#14-environment-variables)
15. [Launch checklist](#15-launch-checklist)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Quick reference

| I want to… | Do this |
|---|---|
| Preview the site locally | `npm run dev` in one terminal, `npx serve . -l 3000` in another, open port 3000 |
| Preview with working forms | `npx vercel dev` (needs a `.env` file; see §14) |
| Rebuild CSS and shared pieces before committing | `npm run build` |
| Publish a change | Commit → push to `main` → Vercel deploys automatically |
| Change a price or package | Edit the matching service page's `.html` file (§7) |
| Change the nav, footer or service links | Edit the file in `partials/`, then `npm run build` |
| Change a color or font | `src/input.css` → `@theme` block, then `npm run build` |
| Change who gets form emails | Vercel → Settings → Environment Variables → `CONTACT_TO_EMAIL` → redeploy |

**Golden rules**
- Always run `npm run build` before committing, and commit the rebuilt `dist/output.css`.
- Never put inline `style="…"` or inline `<script>` code in a page: the security policy blocks them (§12). Use Tailwind classes and files in `/js`.
- Never commit `.env` or API keys.
- Edit the nav, footer and service links in `partials/`, never inside individual pages.

---

## 2. How the site works

The site is **plain HTML pages** styled with **Tailwind CSS**, hosted on **Vercel**. There is no framework. Two small **serverless functions** in `/api` handle the contact forms and send email through **Resend**.

```
Visitor ──► Vercel (static HTML/CSS/JS/images)
              │
              ├─ /api/csrf-token  → issues a security token for forms
              └─ /api/contact     → validates the form, emails it ──► Resend ──► inbox
```

- **Clean URLs.** `web-design.html` is served at `/web-design` (`cleanUrls` in `vercel.json`).
- **Build step runs on your machine, not on Vercel.** `npm run build` stamps the shared pieces into every page and compiles the CSS. The results are committed and Vercel just serves the files (`"buildCommand": ""`).
- **Nothing is stored.** Form submissions go straight into an email. There is no database.

---

## 3. Day-to-day workflow

```bash
git pull origin main
npm install            # only needed when package.json changed
npm run dev            # terminal 1: rebuilds CSS on every save
npx serve . -l 3000    # terminal 2: serves the site
```

Forms don't work in this mode because `/api` isn't running. For working forms use `npx vercel dev` with a `.env` file (copy `.env.example`).

To publish:

```bash
npm run build
git add -A
git commit -m "Describe the change"
git push origin main
```

If `git pull` complains about `dist/output.css`, run `git checkout -- dist/output.css` first (`npm run dev` rewrites it on every save).

**Roll back:** Vercel → Deployments → last good deployment → **⋯** → **Promote to Production**.

---

## 4. Project map

```
/
├── index.html                  Homepage (hero, story, services, work, contact)
├── web-design.html             Website packages
├── online-stores.html          Shopify / online store packages
├── care-plans.html             Hosting + maintenance care plans
├── add-ons.html                Google Business Profile, extra pages/products, integrations
├── social-media.html           Social media packages
├── contact.html                Contact page (three-step project form)
├── 404.html                    "Page not found"
├── partials/
│   ├── nav.html                Navigation (source of truth)
│   ├── footer.html             Footer (source of truth)
│   └── services.html           Row of service links under each service page's title
├── src/input.css               Tailwind source: theme, fonts, component classes
├── dist/output.css             Compiled CSS (generated; commit it, don't edit)
├── js/
│   ├── includes.js             Mobile menu, services dropdown, current-page highlight, footer year
│   ├── home.js                 Homepage section snapping, reveal animations
│   └── contact.js              Contact page form: steps, checks, submit
├── api/                        Serverless functions (run on Vercel)
│   ├── csrf-token.js           Issues form security tokens
│   └── contact.js              Contact form handler
├── lib/contact-email.js        Branded email layout (not an endpoint)
├── scripts/includes.js         Build script that stamps partials into pages
├── images/                     All images (WebP where possible)
├── fonts/                      Self-hosted Playfair Display, Cormorant Garamond, Hanken Grotesk
├── sitemap.xml, robots.txt     Search engine files
├── favicon.ico
├── vercel.json                 Clean URLs, redirects, security headers
└── .env.example                Template for environment variables
```

---

## 5. Pages

| URL | File | In sitemap |
|---|---|---|
| `/` | `index.html` | ✓ |
| `/web-design` | `web-design.html` | ✓ |
| `/online-stores` | `online-stores.html` | ✓ |
| `/care-plans` | `care-plans.html` | ✓ |
| `/add-ons` | `add-ons.html` | ✓ |
| `/social-media` | `social-media.html` | ✓ |
| `/contact` | `contact.html` | ✓ |
| any unknown URL | `404.html` | — |

**Redirects from the old site** (`vercel.json` → `redirects`) keep old links and search results working:

| Old URL | Goes to |
|---|---|
| `/services/web-development` | `/web-design` |
| `/services/maintenance`, `/services/hosting` | `/care-plans` |
| `/services/seo` | `/add-ons` |
| `/services/social-media` | `/social-media` |

### Service page anatomy

```html
<head>…title, description, canonical, social tags, structured data (Service + prices)…</head>
<body>
  <header id="nav-placeholder"><!-- include:nav --> … <!-- /include:nav --></header>
  <main id="main">
    hero (title + motto)
    <!-- include:services --> … <!-- /include:services -->   (service links row)
    What We Do / Why It Matters
    package groups (includes box, package cards, notes)
    "Get Started Today →" (links to /contact)
  </main>
  <!-- include:footer --> … <!-- /include:footer -->
</body>
```

### Add a new page

1. Copy a similar page (e.g. `add-ons.html` → `new-page.html`).
2. In `<head>`, update `<title>`, `<meta name="description">`, `<link rel="canonical">`, the `og:` tags and the structured data.
3. Replace the content inside `<main>`. Keep the `<!-- include:… -->` markers.
4. Add links in `partials/nav.html` (desktop dropdown **and** mobile menu), `partials/footer.html` and `partials/services.html`.
5. Add the URL to `sitemap.xml`.
6. `npm run build`, preview, commit, push.

---

## 6. Shared pieces (partials)

`npm run build` runs `scripts/includes.js`, which copies each file in `partials/` into every page between its `<!-- include:name -->` and `<!-- /include:name -->` markers. Pages without a marker are skipped (for example, only service pages have the service links row).

- Edit the partial → `npm run build` → commit. Every page updates.
- **Don't** edit these pieces inside a page; your change is overwritten on the next build.
- The current page is highlighted automatically in the services dropdown, mobile menu and service links row (`js/includes.js` sets `aria-current="page"`).

---

## 7. Changing prices and packages

Prices follow the **J Eleven Media Pricing Guide**. Each page shows **at most four packages**; larger offerings (e.g. custom web apps) are quoted in conversation, not listed. Each package is a card on its service page:

```html
<article class="package-card row-span-4">
    <h3 class="package-name">Signature</h3>
    <div>
        <p class="package-price-label">Starting at</p>      <!-- or an empty &nbsp; line to keep cards aligned -->
        <p class="package-price">$3,500</p>
        <p class="package-price-note">or $500 / year</p>     <!-- only on pages that use notes -->
    </div>
    <p class="package-tagline">A larger, fully custom website…</p>
    <ul class="check-list">
        <li class="check-item"><span aria-hidden="true" class="check-mark">&#10003;</span>Content sections…</li>
    </ul>
</article>
```

Cards line up row by row: each card is a subgrid with one row per part (name, price, tagline, features), and `row-span-4` says how many parts it has (`row-span-2` on Social Media, which has no prices or taglines). Every card in a group must have the same parts; use an empty `<div></div>` for a missing tagline or feature list. The grid's column classes follow the number of cards: `sm:grid-cols-2 lg:grid-cols-4` for four, `md:grid-cols-3` for three, `md:grid-cols-2` plus `max-w-[820px] mx-auto` for two.

When a price changes, update **every** place it appears:

| Price | Also appears in |
|---|---|
| Lowest website price ("Sites starting at $500") | Homepage "Our Services" list, homepage `<meta name="description">`, `web-design.html` meta description |
| Care plan monthly price ("From $50/month") | Homepage "Our Services" list, `care-plans.html` meta description |
| Any package price | That page's structured data (`"price"` / `"minPrice"` in the `application/ld+json` block in `<head>`) |
| Extra products ($5–$15) | Note under the store packages on `online-stores.html` |

Search the project for the old amount (e.g. `$1,000` and `"1000"`) to catch them all. Price text needs no rebuild; new classes do.

---

## 8. Styling (Tailwind CSS)

Tailwind CSS v4. `src/input.css` is compiled into `dist/output.css`.

### Brand settings (`src/input.css` → `@theme`)

| Token | Value | Use |
|---|---|---|
| `--color-paper` | `#e7e4dd` | Page background |
| `--color-ink` | `#1b1814` | Main text, footer background |
| `--color-ink-soft` | `#544d44` | Body copy |
| `--color-ink-faint` | `#938b7e` | Small print |
| `--color-clay` | `#9c6b4e` | Accent: prices, links, buttons |
| `--color-cocoa` | `#5d473d` | Headings, hero bands, contact section |
| `--font-playfair` | Playfair Display | Headings, nav |
| `--font-cormorant` | Cormorant Garamond | Italic copy |
| `--font-hanken` | Hanken Grotesk | Fallback body font |

### Component classes

Repeated styles are defined once as `@utility` blocks in `src/input.css`:

| Group | Classes |
|---|---|
| Nav / footer | `nav-link`, `dropdown-link`, `mobile-nav-link`, `mobile-subnav-link`, `menu-bar`, `footer-link` |
| Text | `section-title`, `cta-link`, `body-heading`, `body-copy`, `group-heading`, `group-intro`, `fine-print`, `inline-link` |
| Service pages | `page-hero`, `page-title`, `page-motto`, `ticker-link`, `includes-title`, `include-chip`, `package-grid`, `package-card`, `package-name`, `package-price-label`, `package-price`, `package-price-note`, `package-tagline`, `check-list`, `check-item`, `check-mark` |
| Forms | `form-label`, `form-input`, `form-error`, `form-status`, `form-submit` |
| Accessibility | `focus-ring`, `focus-ring-light` |

`npm run dev` rebuilds on every save; `npm run build` makes the final minified CSS **and** stamps partials. Tailwind only includes classes it finds in the files, so a brand-new class only works after a rebuild.

---

## 9. Homepage behavior

- **Full-screen sections (desktop).** `<main>` is the scroll container; each section has `data-full-section` and fills the screen on desktop. Scrolling is normal (no snapping). Below 768px wide, sections take only the height they need.
- **Section order:** Hero, Our Services, Our Work, Our Story, Get started (the "Getting started is simple" panel with the Start your project and Call buttons). To reorder, move the whole `<section>` block in `index.html` and match the link order in `partials/nav.html` (desktop and mobile menus).
- **Alternating panels.** Our Services and Our Story sit on white rounded panels (`bg-white` plus margin and `rounded-[40px]` on the `<section>`); the hero, Our Work and Get started stay on the beige background. Inside the white Services panel the detail box is tinted (`bg-paper/60`) so it stays visible.
- **Our Services tabs.** Each service is a tab (`role="tab"`) with a matching panel (`role="tabpanel"`) holding its description, what's included and prices. `js/home.js` shows one panel at a time and handles the arrow keys. Prices in the panels must match the service pages (§7).
- **Reveal animations.** Sections with `data-reveal-group` reveal their `data-reveal` children one by one; `data-delay` is the wait in milliseconds. `data-reveal-group="repeat"` (Our Work) replays each time it scrolls into view. The hidden/visible states are the `js:` and `revealed:` classes, so without JavaScript everything simply shows.
- **Scroll position** is remembered when you leave the homepage and come back.
- People who turn on "reduce motion" in their device settings skip the animations.

---

## 10. Images and fonts

- **Format:** WebP for photos; PNG only for icons. Lowercase hyphenated names.
- **Size:** about 1600px wide for full-width images, 800–900px for photos in columns. Aim for under ~200 KB. [squoosh.app](https://squoosh.app) converts and resizes.
- Always set the real `width` and `height` on `<img>` so the page doesn't jump while loading.

| File | Used for |
|---|---|
| `logo-480.webp` | Nav logo |
| `logo-1000.webp`, `logo-2000.webp` | Homepage hero logo |
| `family-photo.webp` | Our Story |
| `work-<project>-desktop.webp` (1200×750), `work-<project>-mobile.webp` (360×779) | Our Work cards: a desktop and a phone screenshot per project |
| `og-image.jpg` (1200×630) | Preview when the site is shared |
| `favicon.ico`, `icon-192.png`, `apple-touch-icon.png` | Browser tab and phone home-screen icons |

Fonts are self-hosted in `/fonts` (Latin subsets, SIL Open Font License) because the security policy blocks Google Fonts. To add a weight, download its `.woff2` (e.g. from the `@fontsource` npm packages), put it in `/fonts` and add an `@font-face` block in `src/input.css`.

---

## 11. SEO

Every public page has a `<title>` (under ~60 characters, ending `| J Eleven Media`), a `<meta name="description">` (under ~160 characters), a `<link rel="canonical">` matching its clean URL, `og:` tags and structured data:

- Home: `ProfessionalService` (`@id` `https://www.jelevenmedia.com/#business`) with address, area served, founders, social profiles and the service list.
- Service pages: `Service` with an `OfferCatalog` of the packages and prices, plus `BreadcrumbList`.

`sitemap.xml` lists the public pages; `robots.txt` blocks `/api/` and `/src/`. Test structured data with Google's [Rich Results Test](https://search.google.com/test/rich-results). After launch, submit `https://www.jelevenmedia.com/sitemap.xml` in Google Search Console.

---

## 12. Security settings

Set in `vercel.json` → `headers`:

| Header | Effect |
|---|---|
| `Content-Security-Policy` | Only allows scripts, styles, fonts, images and connections from the site itself |
| `Strict-Transport-Security` | Forces HTTPS |
| `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` | Standard hardening |

What that means in practice:
- ❌ `style="…"` attributes are ignored. Use Tailwind classes.
- ❌ `<script>…code…</script>` inside a page won't run. Put code in `/js` and load it with `<script src="/js/file.js" defer>`. (`application/ld+json` blocks are fine.)
- ❌ Anything from another website (Google Fonts, Google Analytics, embeds, chat widgets) is blocked until its domains are added to the policy in `vercel.json`. The browser console's `Refused to load…` message names the missing domain.

Vercel Web Analytics (`/_vercel/insights/script.js`) is same-origin and works as-is once enabled in the Vercel project.

---

## 13. Contact form and email

The only form is on the **Contact page** (`/contact`). Every "Start your project", "Get Started Today" and "Contact Us" link goes there.

**Files:** `contact.html` (form), `js/contact.js` (steps, checks, submit), `api/contact.js` (server), `lib/contact-email.js` (email layout).

**Steps.** The form has three `<fieldset data-step>` blocks: About you, Your project, The details. `js/contact.js` shows one at a time with a progress bar; **Next** checks that step's required fields first. Without JavaScript all three show and the form still works. Only **name**, **email** and **"Tell us about your business and goals"** are required.

**Tap-to-select options** are real radio buttons/checkboxes styled as tags:

```html
<label class="chip"><input type="radio" name="timeline" value="asap" class="peer sr-only"><span class="chip-face">As soon as possible</span></label>
```

Checkbox groups (like "What do you need?") are sent as lists.

Protections (same as the Rogue K9 site):

| Layer | What it does |
|---|---|
| CSRF token | Page fetches a token from `/api/csrf-token` (also set as a secure cookie); the server rejects mismatches |
| Honeypot | Hidden `hp_field` input; bots fill it and the server pretends success without sending |
| Rate limit | 5 submissions per 15 minutes per connection |
| Server validation | Every field checked with Zod, including that each option is one of the allowed values; errors come back as `fieldErrors`, show under each field, and the form jumps to that step |
| Escaping | All answers are HTML-escaped before going into the email |
| Allowed origin | Only `ALLOWED_ORIGIN` may call the API from a browser |

**Change an option** (e.g. add a budget range): add it in `contact.html`, then add the same `value` and its email wording to `LABELS` in `api/contact.js`. The server rejects any value not listed there.

**Add a field:** add the input (with a `name`) and a `<p data-error="fieldname" class="form-error hidden" role="alert"></p>` to the right step; add it to `ContactSchema` in `api/contact.js` (and `LABELS` if it has fixed options); add a row to `rows` in the same file. `js/contact.js` needs no changes.

**Email:** `lib/contact-email.js` is a plain layout: one row per answer under three headings, then their message. It uses tables and inline styles on purpose; email apps ignore modern CSS. Subject: "New project inquiry from (name)". From = `CONTACT_FROM_EMAIL`, To = `CONTACT_TO_EMAIL`, Reply-To = the visitor, so pressing Reply answers them directly. The From address must be on a domain verified in Resend (Resend → Domains); until then use `onboarding@resend.dev`, which only delivers to the Resend account owner's own email.

---

## 14. Environment variables

Set in Vercel → project → **Settings** → **Environment Variables**, then **redeploy**. For `npx vercel dev`, put the same values in `.env` (template: `.env.example`).

| Variable | Example | Purpose |
|---|---|---|
| `RESEND_API_KEY` | `re_…` | Lets the site send through Resend. Secret |
| `CONTACT_FROM_EMAIL` | `J Eleven Media <contact@jelevenmedia.com>` | Sender; must be on a verified domain |
| `CONTACT_TO_EMAIL` | `jeleven.hayden@gmail.com` | Inbox for form submissions |
| `ALLOWED_ORIGIN` | `https://www.jelevenmedia.com` | The site's exact address (with or without `www`, matching what visitors see). Defaults to `https://www.jelevenmedia.com` |

---

## 15. Launch checklist

1. Vercel project: set **Framework Preset** to *Other* and leave the build command empty (the old site was Next.js).
2. Set the four environment variables (§14) and redeploy.
3. Enable **Web Analytics** in the Vercel project if you want visitor stats.
4. Smoke test on the live domain: every page on phone and desktop; submit the Contact page form; confirm the email arrives and Reply goes to the visitor.
5. Visit an old URL (e.g. `/services/hosting`) and confirm it redirects.
6. Google Search Console → resubmit `https://www.jelevenmedia.com/sitemap.xml`.
7. Paste the URL into a text or social post to check `og-image.jpg` shows.

---

## 16. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Change isn't live | Deploy still running or failed; browser cache | Vercel → Deployments; hard-refresh |
| Page unstyled or new class does nothing | CSS wasn't rebuilt | `npm run build`, commit `dist/output.css` |
| Nav/footer change only on some pages | Edited a page instead of the partial | Edit `partials/…`, then `npm run build` |
| Something from another site doesn't load | Blocked by the CSP | Add the domain in `vercel.json` (§12) |
| "Please refresh the page before submitting" | Security token didn't load | Network tab → `/api/csrf-token`; Vercel logs |
| "Invalid or expired form session" (403) | `ALLOWED_ORIGIN` doesn't match the address in the browser (`www` vs no `www`), or page open too long | Check `ALLOWED_ORIGIN`; refresh |
| "Something went wrong…" (500) | Missing env var or Resend error | Vercel → Logs, filter `/api/contact`; `…is not set` = missing variable |
| Form says sent, no email | Spam folder; Resend domain not verified | Resend → Emails |
