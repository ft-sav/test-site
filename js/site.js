// Site glue: click-to-deal deck, scroll reveal, scroll-transition motion.
// The tilt-card component and its own listeners are untouched: all deck logic
// lives here, and every interception happens on document capture so clicks
// never leak into the card's flip handler while the deck is stacked.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const desktopMQ = matchMedia('(min-width: 861px)');
  const deckEl = document.querySelector('.craft-deck');
  const cards = deckEl ? [...deckEl.querySelectorAll('.craft-card')] : [];

  /* ---- deck: click the stacked pile to deal it; dealt cards flip one by one ---- */
  if (deckEl && cards.length) {
    let open = false, raf = 0, last = 0, lastHeight = -1;
    const s = { x: 0, v: 0 }; // underdamped 0..1 spring: fans out with a small overshoot

    // layout targets are computed here so behavior never depends on cached CSS
    const targets = () => {
      const H = cards[0].offsetHeight || 420;
      if (desktopMQ.matches) {
        // fit-to-screen fan: space shrinks and cards gently scale down so all
        // three stay fully visible at any desktop width (no clipped edges)
        const avail = Math.max(660, innerWidth - 96); // usable row width
        const step = Math.min(360, avail / 3);        // center-to-center spacing
        const fs = Math.min(1, Math.max(0.6, (step - 36) / 300));
        return { mode: 'x', h: Math.max(560, H + 120), fs, pos: [[-step, 10, -6], [0, -10, 0], [step, 10, 6]] };
      }
      const gap = Math.max(28, H * 0.1);
      return { mode: 'y', h: H * 3 + gap * 2 + 40, pos: [[0, -(H + gap), -3], [0, 0, 0], [0, H + gap, 3]] };
    };

    const apply = () => {
      deckEl.style.setProperty('--deck-fan', s.x.toFixed(4));
      const t = targets();
      deckEl.style.setProperty('--fs', (t.fs || 1).toFixed(3));
      const h0 = (cards[0].offsetHeight || 420) + 34; // stacked pile's natural height (margins)
      const h = Math.round(h0 + (t.h - h0) * s.x);
      if (Math.abs(h - lastHeight) > 1) { deckEl.style.height = h + 'px'; lastHeight = h; }
      deckEl.classList.toggle('deck-open', open);
      // per-card fan targets: desktop fans wide, mobile stacks top to bottom
      t.pos.forEach((p, i) => {
        cards[i].style.setProperty('--fx', p[0] + 'px');
        cards[i].style.setProperty('--fy', p[1] + 'px');
        cards[i].style.setProperty('--fr', p[2] + 'deg');
      });
      // while stacked only the pile's top card is interactive; dealt cards each are
      cards.forEach((c, i) => { c.style.pointerEvents = open ? 'auto' : (i === cards.length - 1 ? 'auto' : 'none'); });
      cards.forEach((c) => c.setAttribute('aria-expanded', String(open)));
    };

    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const k = open ? 120 : 150, c = 14;
      const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
      for (let i = 0; i < n; i++) { s.v += (-k * (s.x - (open ? 1 : 0)) - c * s.v) * h; s.x += s.v * h; }
      apply();
      if (Math.abs(s.x - (open ? 1 : 0)) < 1e-4 && Math.abs(s.v) < 1e-3) { s.x = open ? 1 : 0; s.v = 0; apply(); raf = 0; }
      else raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };

    const setOpen = (v) => {
      open = v;
      if (reduce.matches) { s.x = open ? 1 : 0; s.v = 0; apply(); return; }
      // on mobile, glide down after the pile grows so the dealt cards are readable top to bottom
      if (open && !desktopMQ.matches) {
        const top = deckEl.getBoundingClientRect().top + scrollY;
        if (Math.abs(top - scrollY) > 40) scrollTo({ top: Math.max(0, top - 24), behavior: 'smooth' });
      }
      kick();
    };

    // capture at document: runs before the card's own click handler, so the
    // dealing click can never also flip the pile's top card.
    document.addEventListener('click', (e) => {
      if (open) return;
      const t = e.target instanceof Element ? e.target.closest('.craft-card') : null;
      if (t && deckEl.contains(t)) { e.stopImmediatePropagation(); e.stopPropagation(); setOpen(true); }
    }, true);
    // Escape restacks the deck
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { setOpen(false); cards[0].focus({ preventScroll: true }); } });

    apply();
    addEventListener('resize', () => { if (raf) apply(); else apply(); }, { passive: true });
  }

  /* ---- scroll reveal: sections fade and rise as they enter the viewport ---- */
  const reveals = [...document.querySelectorAll('.reveal')];
  reveals.forEach((el, i) => el.style.setProperty('--reveal-delay', `${(i % 3) * 0.12}s`));
  if (reduce.matches || !('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { threshold: 0.15 });
    reveals.forEach((el) => io.observe(el));
  }

  /* ---- scroll transition motion: the hero sinks and fades as the craft slides
         over it, each section's content drifts along its entry, and the holo
         stage eases in. Tied to scroll only, so it reads as a page-wide wash. ---- */
  const hero = document.querySelector('.hero-section');
  const heroContent = document.querySelector('.hero-content');
  const craft = document.querySelector('.craft-section');
  const craftHead = document.querySelector('.craft-head');
  const aboutHead = document.querySelector('.about-head');
  const stage = document.querySelector('.about-section .stage');
  if (!reduce.matches && hero && heroContent) {
    let ticking = false;
    const drift = (el, rect) => { // content rises 40px across the last stretch of its entry
      if (!el) return;
      const vh = innerHeight;
      const p = rect.top < vh ? Math.min(1, Math.max(0, (vh - rect.top) / (vh * 0.35))) : 0;
      el.style.setProperty('--drift', ((1 - p) * 40).toFixed(1) + 'px');
    };
    const update = () => {
      ticking = false;
      const y = scrollY;
      const hgt = hero.offsetHeight || 1;
      const p = Math.min(1, Math.max(0, y / hgt));
      heroContent.style.setProperty('--hero-risepx', (p * 130).toFixed(1));
      heroContent.style.setProperty('--hero-fade', (1 - p * 1.15).toFixed(3));
      hero.style.filter = `brightness(${(1 - p * 0.35).toFixed(3)})`;
      if (craftHead) drift(craftHead, craftHead.getBoundingClientRect());
      if (aboutHead) drift(aboutHead, aboutHead.getBoundingClientRect());
      if (stage) drift(stage, stage.getBoundingClientRect());
      if (deckEl) { // the deck proper floats up a little as it approaches
        const dr = deckEl.getBoundingClientRect();
        deckEl.style.setProperty('--deck-drift', (dr.top < innerHeight ? Math.min(1, Math.max(0, (innerHeight - dr.top) / innerHeight)) * -26 : 0).toFixed(1) + 'px');
      }
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll, { passive: true });
    update();
  }
})();
