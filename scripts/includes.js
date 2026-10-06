// scripts/includes.js
//
// Stamps the shared partials (nav, footer) into
// every page at build time, between <!-- include:name --> and
// <!-- /include:name --> markers. Pages without a marker are left alone. The
// partials stay the single source of truth, while each page ships with its
// nav and footer already in the HTML — so crawlers and no-JS visitors see
// them and nothing shifts when the page loads.
//
// Run: node scripts/includes.js (part of `npm run build`).

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const partials = {
  nav: 'partials/nav.html',
  footer: 'partials/footer.html',
};

const pages = fs.readdirSync(root).filter((f) => f.endsWith('.html'));

for (const page of pages) {
  const file = path.join(root, page);
  let html = fs.readFileSync(file, 'utf8');
  for (const [name, partialPath] of Object.entries(partials)) {
    const partial = fs.readFileSync(path.join(root, partialPath), 'utf8').trim();
    const marker = new RegExp(`(<!-- include:${name} -->)[\\s\\S]*?(<!-- /include:${name} -->)`);
    html = html.replace(marker, (_, open, close) => `${open}\n${partial}\n${close}`);
  }
  fs.writeFileSync(file, html);
}

console.log(`Stamped partials into ${pages.length} pages.`);
