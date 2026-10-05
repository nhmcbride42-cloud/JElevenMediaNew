// Homepage behavior: remembering the scroll position, the staggered reveal
// animations and the Our Services tabs. Without JavaScript every section
// still shows and scrolls normally.

document.documentElement.classList.add('js');

const scroller = document.getElementById('main');

// ── Remember scroll position (e.g. after visiting a service page and coming back) ──
if (scroller && !window.location.hash) {
  try {
    const saved = sessionStorage.getItem('homeScrollTop');
    if (saved !== null) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        scroller.scrollTop = parseInt(saved, 10);
      }));
    }
    scroller.addEventListener('scroll', () => {
      sessionStorage.setItem('homeScrollTop', String(scroller.scrollTop));
    }, { passive: true });
  } catch (err) {
    // Storage blocked (private mode); scroll position simply isn't restored.
  }
}

// ── Staggered reveals ──
// A [data-reveal-group] reveals its [data-reveal] children one by one when it
// scrolls into view, each after its data-delay (ms). Groups marked
// data-reveal-group="repeat" hide again when scrolled out, so they replay.
document.querySelectorAll('[data-reveal-group]').forEach((group) => {
  const items = group.querySelectorAll('[data-reveal]');
  const repeat = group.dataset.revealGroup === 'repeat';
  let timers = [];

  const io = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      items.forEach((item) => {
        const delay = parseInt(item.dataset.delay || '200', 10);
        timers.push(setTimeout(() => item.classList.add('is-revealed'), delay));
      });
      if (!repeat) io.disconnect();
    } else if (repeat) {
      timers.forEach(clearTimeout);
      timers = [];
      items.forEach((item) => item.classList.remove('is-revealed'));
    }
  }, { threshold: repeat ? 0.3 : 0.05 });

  io.observe(group);
});

// ── Service tabs ──
// One panel shows at a time. Arrow keys move between tabs (WAI-ARIA tabs
// pattern). Without JavaScript every panel shows, one after another.
document.querySelectorAll('[data-tabs]').forEach((wrap) => {
  const tabs = Array.from(wrap.querySelectorAll('[role="tab"]'));
  const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));

  const select = (i, focus) => {
    tabs.forEach((t, n) => {
      t.setAttribute('aria-selected', String(n === i));
      t.tabIndex = n === i ? 0 : -1;
      panels[n].hidden = n !== i;
    });
    if (focus) tabs[i].focus();
  };

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(i, false));
    t.addEventListener('keydown', (e) => {
      const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      if (e.key in keys) {
        e.preventDefault();
        select((i + keys[e.key] + tabs.length) % tabs.length, true);
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        select(e.key === 'Home' ? 0 : tabs.length - 1, true);
      }
    });
  });

  select(0, false);
});
