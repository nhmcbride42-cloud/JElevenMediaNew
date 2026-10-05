// Homepage behavior: remembering the scroll position and the staggered
// reveal animations. Without JavaScript every section still shows and
// scrolls normally.

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
