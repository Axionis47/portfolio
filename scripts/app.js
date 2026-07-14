/* ═══════════════════════════════════════════════════════════════
   app.js — the infrastructure entry point.
   Owns: the section manifest, Lenis smooth scrolling, nav wiring +
   scroll-spy, and the boot sequence. Loads modular section files,
   then hands choreography to Story and the sim to Cosmos.

   To add a section: drop a file in /sections and add ONE line to
   SECTIONS. Mounts are generated here — the shell never changes.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  document.documentElement.classList.add('js');

  /* ── The section manifest. Order = render order. ── */
  const SECTIONS = [
    'sections/hero.html',
    'sections/turn.html',
    'sections/flagship.html',
    'sections/work.html',
    'sections/notes.html',
    'sections/experience.html',
    'sections/education.html',
    'sections/close.html'
  ];

  /* Which on-page section id lights which sidenav dot. */
  const NAV_FOR = {
    top: null, turn: 'flagship', flagship: 'flagship', work: 'work',
    notes: 'notes', experience: 'experience', education: 'experience', contact: 'contact'
  };

  async function loadSections() {
    const app = document.getElementById('app');
    if (!app) return;
    // Create mounts in order first so render order is deterministic,
    // then fill them in parallel.
    const mounts = SECTIONS.map(() => {
      const d = document.createElement('div');
      d.className = 'section-mount';
      app.appendChild(d);
      return d;
    });
    await Promise.all(SECTIONS.map(async (path, i) => {
      try {
        const res = await fetch(path);
        mounts[i].innerHTML = res.ok ? await res.text() : '';
      } catch (e) {
        mounts[i].innerHTML = '';
      }
    }));
  }

  function initLenis() {
    if (!window.Lenis) return null;
    const lenis = new window.Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.6
    });
    window.__lenis = lenis;

    if (window.gsap && window.ScrollTrigger) {
      lenis.on('scroll', window.ScrollTrigger.update);
      window.gsap.ticker.add((t) => lenis.raf(t * 1000));
      window.gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
    return lenis;
  }

  function initNav() {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      if (window.__lenis) window.__lenis.scrollTo(target, { offset: -20, duration: 1.2 });
      else target.scrollIntoView({ behavior: 'smooth' });
    });
  }

  function initScrollSpy() {
    const dots = document.querySelectorAll('.sidenav a');
    if (!dots.length) return;
    const setActive = (navId) => {
      dots.forEach((a) => a.classList.toggle('active', a.dataset.target === navId));
    };
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && e.target.id in NAV_FOR) setActive(NAV_FOR[e.target.id]);
      });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    document.querySelectorAll('main section[id]').forEach((s) => spy.observe(s));
  }

  async function boot() {
    await loadSections();
    initLenis();
    if (window.Cosmos) window.Cosmos.init('#cosmos');
    if (window.Story) window.Story.init();
    initNav();
    initScrollSpy();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
