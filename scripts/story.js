/* ═══════════════════════════════════════════════════════════════
   story.js — the choreography.
   Owns content reveals and the scroll → cosmos coupling.

   Reveals are CSS transitions toggled by an IntersectionObserver adding
   an `.in` class. This deliberately does NOT depend on the GSAP/rAF
   ticker, so content is never stranded invisible if the ticker is paused
   (backgrounded tab, etc.). The hero animates itself via pure CSS.

   GSAP is used ONLY for the cosmos scroll coupling (a nice-to-have); if
   it's missing we fall back to a plain scroll listener. A visibility/
   pageshow safety net re-reveals anything in view that slipped through.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const Story = {};
  const SEL = '[data-reveal],[data-reveal-line]';

  Story.init = function () {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const els = Array.from(document.querySelectorAll(SEL));

    if (reduce) {
      els.forEach((el) => el.classList.add('in'));
    } else if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries, obs) => {
        entries.filter((e) => e.isIntersecting).forEach((e, i) => {
          e.target.style.transitionDelay = (i * 60) + 'ms';
          e.target.classList.add('in');
          obs.unobserve(e.target);
        });
      }, { rootMargin: '0px 0px -10% 0px', threshold: 0.01 });
      els.forEach((el) => io.observe(el));

      // Safety net: if the tab was hidden/frozen during a jump, reveal
      // whatever is in view when it comes back. Never leaves content dark.
      const revealInView = () => {
        document.querySelectorAll(SEL + ':not(.in)').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.top < window.innerHeight * 0.95 && r.bottom > 0) el.classList.add('in');
        });
      };
      window.addEventListener('pageshow', revealInView);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) revealInView(); });
    } else {
      els.forEach((el) => el.classList.add('in'));
    }

    /* Couple page scroll → cosmos: chaos at the top, order at the bottom. */
    if (window.Cosmos && window.gsap && window.ScrollTrigger) {
      window.gsap.registerPlugin(window.ScrollTrigger);
      window.ScrollTrigger.create({
        trigger: document.body, start: 'top top', end: 'bottom bottom',
        onUpdate: (self) => window.Cosmos.setProgress(self.progress)
      });
      window.ScrollTrigger.refresh();
    } else if (window.Cosmos) {
      const onScroll = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.Cosmos.setProgress(max > 0 ? window.scrollY / max : 0);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  };

  window.Story = Story;
})();
