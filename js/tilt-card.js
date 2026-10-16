(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const spring = (k, c, x = 0) => ({ x, v: 0, t: x, k, c });

  function init(card) {
    if (card.dataset.vsReady) return; card.dataset.vsReady = '1';
    const q = s => card.querySelector(s), qa = s => card.querySelectorAll(s);
    const body = q('.vs-tilt-card-body'), shadow = q('.vs-tilt-card-shadow');
    const imgs = qa('.vs-tilt-card-img'), contents = qa('.vs-tilt-card-content');
    const glares = qa('.vs-tilt-card-glare'), foils = qa('.vs-tilt-card-foil');
    const back = q('.vs-tilt-card-back'), front = q('.vs-tilt-card-front');
    const max = () => parseFloat(getComputedStyle(card).getPropertyValue('--vs-tilt-card-max')) || 11;
    const glareK = () => parseFloat(getComputedStyle(card).getPropertyValue('--vs-tilt-card-glare')) || 0;
    const foilK = () => parseFloat(getComputedStyle(card).getPropertyValue('--vs-tilt-card-foil')) || 0;
    // tension/friction pairs: 170/26 is critically damped (no overshoot) for the tilt; the flip overshoots a touch
    const nx = spring(170, 26), ny = spring(170, 26), hov = spring(140, 24), sc = spring(320, 24, 1), fl = spring(95, 14);
    const all = [nx, ny, hov, sc, fl];
    let raf = 0, last = 0, flipped = false, gK = glareK(), fK = foilK(), M = max();

    const render = () => {
      const rx = -ny.x * M, ry = nx.x * M;
      body.style.transform = `rotateX(${rx.toFixed(3)}deg) rotateY(${(ry + fl.x * 180).toFixed(3)}deg) scale(${(sc.x * (1 + hov.x * .025)).toFixed(4)})`;
      shadow.style.transform = `translate3d(${(-nx.x * 14).toFixed(2)}px, ${(18 - ny.x * 10 + hov.x * 8).toFixed(2)}px, 0) scale(${(1 - (1 - sc.x) * 2).toFixed(4)})`;
      shadow.style.opacity = (0.7 + hov.x * 0.3).toFixed(3);
      imgs.forEach(el => el.style.transform = `translate3d(${(-nx.x * 9).toFixed(2)}px, ${(-ny.x * 9).toFixed(2)}px, 0)`);
      contents.forEach(el => el.style.transform = `translate3d(${(nx.x * 5).toFixed(2)}px, ${(ny.x * 5).toFixed(2)}px, 0)`);
      const d = Math.min(1, Math.hypot(nx.x, ny.x));
      glares.forEach(el => {
        el.style.opacity = (hov.x * gK * (0.45 + 0.55 * d)).toFixed(3);
        el.firstElementChild.style.transform = `translate3d(${(nx.x * 50).toFixed(2)}%, ${(ny.x * 50).toFixed(2)}%, 0)`;
      });
      foils.forEach(el => {
        el.style.opacity = (hov.x * fK * (0.35 + 0.65 * d)).toFixed(3);
        el.firstElementChild.style.transform = `translate3d(${(nx.x * 18 + ny.x * 8).toFixed(2)}%, 0, 0)`;
      });
    };
    const tick = now => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
      for (let i = 0; i < n; i++) for (const s of all) { s.v += (-s.k * (s.x - s.t) - s.c * s.v) * h; s.x += s.v * h; }
      render();
      if (all.every(s => Math.abs(s.x - s.t) < 1e-4 && Math.abs(s.v) < 1e-3)) {
        all.forEach(s => { s.x = s.t; s.v = 0; }); render(); raf = 0;
      } else raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };
    const aim = (x, y, h) => {
      if (reduce.matches) return;
      nx.t = Math.max(-1, Math.min(1, x)); ny.t = Math.max(-1, Math.min(1, y)); hov.t = h; kick();
    };
    const fromEvent = e => {
      const r = card.getBoundingClientRect();
      aim(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1, 1);
    };
    const rest = () => { nx.t = 0; ny.t = 0; hov.t = 0; sc.t = 1; kick(); };
    const flip = () => {
      flipped = !flipped; fl.t = flipped ? 1 : 0;
      card.setAttribute('aria-pressed', String(flipped));
      front && front.setAttribute('aria-hidden', String(flipped));
      back && back.setAttribute('aria-hidden', String(!flipped));
      if (reduce.matches) { fl.x = fl.t; fl.v = 0; render(); } else kick();
    };

    card.addEventListener('pointerenter', e => { gK = glareK(); fK = foilK(); M = max(); if (e.pointerType !== 'touch') fromEvent(e); });
    card.addEventListener('pointermove', e => { if (e.pointerType !== 'touch' || e.pressure > 0) fromEvent(e); });
    card.addEventListener('pointerleave', rest);
    card.addEventListener('pointercancel', rest);
    card.addEventListener('pointerdown', e => { sc.t = 0.965; if (e.pointerType === 'touch') { gK = glareK(); fK = foilK(); M = max(); fromEvent(e); } kick(); });
    card.addEventListener('pointerup', e => { sc.t = 1; if (e.pointerType === 'touch') setTimeout(rest, 260); kick(); });
    card.addEventListener('click', flip);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); return; }
      const k = { ArrowLeft: [-.8, 0], ArrowRight: [.8, 0], ArrowUp: [0, -.8], ArrowDown: [0, .8] }[e.key];
      if (k) { e.preventDefault(); gK = glareK(); fK = foilK(); M = max(); aim(k[0], k[1], 1); }
    });
    card.addEventListener('focus', () => { if (card.matches(':focus-visible')) { gK = glareK(); fK = foilK(); M = max(); aim(-.35, -.45, .8); } });
    card.addEventListener('blur', rest);
    render();
  }
  const boot = () => document.querySelectorAll('.vs-tilt-card').forEach(init);
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
