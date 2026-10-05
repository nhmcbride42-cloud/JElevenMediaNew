// The nav, footer and service links are stamped into every page at build time
// by scripts/includes.js, so this file only adds behavior on top of them.

const yearEl = document.getElementById('footer-year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Highlight links to the current page (service dropdown, mobile menu, ticker).
const here = window.location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
document.querySelectorAll('nav a[href^="/"]').forEach((link) => {
  if (link.getAttribute('href') === here) link.setAttribute('aria-current', 'page');
});

// ── Mobile menu ──
const menuButton = document.getElementById('menu-button');
const mobileMenu = document.getElementById('mobile-menu');

function setMenuOpen(open) {
  if (!menuButton || !mobileMenu) return;
  mobileMenu.classList.toggle('max-h-0', !open);
  mobileMenu.classList.toggle('opacity-0', !open);
  mobileMenu.classList.toggle('max-h-[70vh]', open);
  mobileMenu.classList.toggle('overflow-y-auto', open);
  menuButton.setAttribute('aria-expanded', String(open));
  // inert removes the menu from the accessibility tree and blocks keyboard
  // focus when collapsed, so screen reader users can't tab into hidden items.
  mobileMenu.toggleAttribute('inert', !open);

  const bar1 = document.getElementById('bar1');
  const bar2 = document.getElementById('bar2');
  const bar3 = document.getElementById('bar3');
  if (bar1) bar1.classList.toggle('translate-y-[7px]', open);
  if (bar1) bar1.classList.toggle('rotate-45', open);
  if (bar2) bar2.classList.toggle('opacity-0', open);
  if (bar3) bar3.classList.toggle('-translate-y-[7px]', open);
  if (bar3) bar3.classList.toggle('-rotate-45', open);
}

if (menuButton && mobileMenu) {
  menuButton.addEventListener('click', () => {
    setMenuOpen(menuButton.getAttribute('aria-expanded') !== 'true');
  });
  // Close after following a link (matters for /#section links on the homepage).
  mobileMenu.addEventListener('click', (e) => {
    if (e.target.closest('a')) setMenuOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
      setMenuOpen(false);
      menuButton.focus();
    }
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) setMenuOpen(false);
  });
}

// "Our Services" sub-list inside the mobile menu.
const mobileServicesButton = document.getElementById('mobile-services-button');
const mobileServices = document.getElementById('mobile-services');
if (mobileServicesButton && mobileServices) {
  mobileServicesButton.addEventListener('click', () => {
    const open = mobileServicesButton.getAttribute('aria-expanded') !== 'true';
    mobileServicesButton.setAttribute('aria-expanded', String(open));
    mobileServices.classList.toggle('hidden', !open);
    mobileServices.classList.toggle('flex', open);
  });
}

// Desktop "Our Services" dropdown: opens on hover (CSS) or on click/Enter/
// Space (here). Escape or moving focus/clicking elsewhere closes it.
document.querySelectorAll('[data-dropdown]').forEach((item) => {
  const button = item.querySelector('button');
  const setOpen = (open) => {
    item.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
  };
  button.addEventListener('click', () => setOpen(!item.classList.contains('is-open')));
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && item.classList.contains('is-open')) {
      setOpen(false);
      button.focus();
    }
  });
  item.addEventListener('focusout', (e) => {
    if (!item.contains(e.relatedTarget)) setOpen(false);
  });
  document.addEventListener('click', (e) => {
    if (!item.contains(e.target)) setOpen(false);
  });
});
