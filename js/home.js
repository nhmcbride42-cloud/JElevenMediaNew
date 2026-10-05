// Homepage behavior: full-screen section snapping on desktop and the
// staggered reveal animations. Without JavaScript every section still shows
// and scrolls normally.

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

// ── Mouse wheel jumps one section at a time ──
// Trackpads produce many small fractional-pixel events; mouse wheels produce
// a single large discrete event. Only mouse-wheel scrolls (large |deltaY| or
// line/page deltaMode) are turned into section jumps; CSS snap handles the rest.
if (scroller) {
  let locked = false;
  scroller.addEventListener('wheel', (e) => {
    if (window.innerWidth < 768) return;
    const isMouseWheel =
      e.deltaMode !== 0 || (Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40);
    if (!isMouseWheel) return;

    e.preventDefault();
    if (locked) return;
    locked = true;
    setTimeout(() => { locked = false; }, 900);

    const sections = Array.from(scroller.querySelectorAll('[data-snap-section], footer'));
    if (sections.length === 0) return;

    // Current section = the one whose top is closest to the scroll position.
    const scrollTop = scroller.scrollTop;
    let currentIndex = 0;
    let closestDist = Infinity;
    sections.forEach((s, i) => {
      const dist = Math.abs(s.offsetTop - scrollTop);
      if (dist < closestDist) {
        closestDist = dist;
        currentIndex = i;
      }
    });

    const direction = e.deltaY > 0 ? 1 : -1;
    const targetIndex = Math.max(0, Math.min(sections.length - 1, currentIndex + direction));
    sections[targetIndex].scrollIntoView({ behavior: 'smooth' });
  }, { passive: false });
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
