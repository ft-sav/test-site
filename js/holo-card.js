const VERT = 'attribute vec2 p; varying vec2 vUv; void main(){ vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';
const FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec2 uRes, uTilt, uPtr; uniform float uTime, uFoil, uCov, uInt, uHover, uBack; uniform vec3 uAccent;
const float AR = 63.0 / 88.0;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float pw(float x, float e){ return pow(max(x, 0.0), e); }
float box(vec2 p, vec2 a, vec2 b, float aa){ vec2 d = max(a - p, p - b); return 1.0 - smoothstep(-aa, aa, max(d.x, d.y)); }
vec3 spectrum(float h){ return 0.5 + 0.5 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67))); }
float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 screen(vec3 a, vec3 b){ return 1.0 - (1.0 - a) * (1.0 - b); }

// the art: a ringed moon rising over salt dunes at dusk
vec3 drawArt(vec2 a, float aa){
  vec3 sky = mix(vec3(0.94, 0.66, 0.40), vec3(0.16, 0.36, 0.42), smoothstep(0.78, 0.18, a.y));
  sky = mix(sky, vec3(0.05, 0.13, 0.19), smoothstep(0.35, 0.0, a.y));
  vec2 c = vec2(0.56, 0.5); vec2 d = (a - c) * vec2(1.415, 1.0);
  // stars
  vec2 g = floor(a * vec2(70.0, 52.0)); vec2 f = fract(a * vec2(70.0, 52.0)) - 0.5;
  float st = step(0.93, hash(g)) * smoothstep(0.12, 0.0, length(f)) * smoothstep(0.62, 0.1, a.y);
  sky += st * 0.8;
  // moon body with soft terminator and bands
  float r = length(d); float R = 0.3;
  float body = 1.0 - smoothstep(R - aa, R + aa, r);
  vec3 moon = mix(vec3(0.99, 0.86, 0.62), vec3(0.93, 0.52, 0.36), smoothstep(-0.2, 0.25, d.y + d.x * 0.4));
  moon *= 0.9 + 0.1 * sin(d.y * 38.0 + sin(d.x * 7.0) * 1.2);
  moon *= 0.6 + 0.4 * smoothstep(0.3, -0.2, d.x + d.y * 0.3);
  vec3 col = mix(sky + vec3(0.9, 0.55, 0.3) * 0.35 * exp(-r * r * 9.0), moon, body);
  // the ring: an ellipse that passes in front below, behind above
  vec2 rd = d * mat2(0.95, -0.31, 0.31, 0.95); float re = length(rd * vec2(1.0, 4.2));
  float ring = smoothstep(0.022, 0.0, abs(re - 0.45)) * 0.9 + smoothstep(0.012, 0.0, abs(re - 0.51)) * 0.6;
  float front = step(0.0, rd.y) + (1.0 - body);
  col = mix(col, vec3(1.0, 0.9, 0.72), clamp(ring * min(front, 1.0), 0.0, 1.0));
  // dunes, three ridges
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float h = 0.66 + fi * 0.09 + 0.035 * sin(a.x * (5.0 + fi * 3.0) + fi * 2.0) + 0.02 * sin(a.x * 13.0 + fi);
    float m = smoothstep(h - aa, h + aa, a.y);
    vec3 dc = mix(vec3(0.72, 0.44, 0.30), vec3(0.18, 0.2, 0.22), fi / 2.0);
    dc *= 0.8 + 0.25 * smoothstep(h + 0.12, h, a.y);
    col = mix(col, dc, m);
  }
  return col;
}

vec3 drawBack(vec2 p, float aa){
  vec2 q = (p - 0.5) * vec2(AR, 1.0);
  float r = length(q), an = atan(q.y, q.x);
  vec3 base = mix(uAccent * 0.26, uAccent * 0.1, r * 1.4);
  float guil = 0.5 + 0.5 * sin(r * 150.0 + 2.2 * sin(an * 10.0 + r * 24.0));
  base += uAccent * 0.1 * smoothstep(0.7, 1.0, guil);
  float em = smoothstep(0.012, 0.0, abs(r - 0.2)) + smoothstep(0.006, 0.0, abs(r - 0.225)) + (1.0 - smoothstep(-0.004, 0.004, sqrt(abs(q.x) + 1e-5) + sqrt(abs(q.y) + 1e-5) - 0.36));
  base = mix(base, uAccent * 1.15, clamp(em, 0.0, 1.0));
  float frame = 1.0 - box(p, vec2(0.05, 0.05 * AR), vec2(0.95, 1.0 - 0.05 * AR), aa);
  return mix(base, uAccent * 0.8, frame);
}

void main(){
  vec2 p = vec2(vUv.x, 1.0 - vUv.y);
  if (uBack > 0.5) p.x = 1.0 - p.x; // the canvas is seen from behind: un-mirror it
  float aa = 1.5 / uRes.y;
  vec2 ptr = uPtr; if (uBack > 0.5) ptr.x = 1.0 - ptr.x;
  float bx = 0.035, by = 0.035 * AR;
  // regions
  float art = box(p, vec2(0.07, 0.115), vec2(0.93, 0.55), aa);
  float tbox = box(p, vec2(0.07, 0.605), vec2(0.93, 0.905), aa);
  // the metal frame: brushed accent with a soft vertical falloff
  float brush = hash(vec2(floor(p.y * 900.0), 3.0)) * 0.06;
  vec3 metal = uAccent * (0.62 + 0.3 * smoothstep(1.0, 0.0, p.y) + brush);
  metal = mix(metal * 0.55, metal, box(p, vec2(bx, by), vec2(1.0 - bx, 1.0 - by), aa) * 0.6 + 0.4);
  vec3 col = metal;
  // name bar and type strip, darker inlays
  float bar = box(p, vec2(0.05, 0.04), vec2(0.95, 0.104), aa) + box(p, vec2(0.05, 0.553), vec2(0.95, 0.597), aa);
  col = mix(col, mix(uAccent * 0.22, vec3(0.07), 0.5), clamp(bar, 0.0, 1.0) * 0.85);
  // bevel line around the art
  float bev = box(p, vec2(0.065, 0.111), vec2(0.935, 0.554), aa) - art;
  col = mix(col, vec3(1.0, 0.96, 0.88), bev * 0.7);
  vec2 ap = (p - vec2(0.07, 0.115)) / vec2(0.86, 0.435);
  col = mix(col, drawArt(ap, aa * 2.2), art);
  vec3 paper = vec3(0.95, 0.93, 0.88) * (0.96 + 0.04 * hash(floor(p * 400.0)));
  col = mix(col, paper, tbox);
  if (uBack > 0.5) col = drawBack(p, aa);

  // ---- the foil
  float tl = length(uTilt);
  float amt = uInt * (0.3 + 0.7 * smoothstep(0.0, 0.7, tl));
  float mask = uBack > 0.5 ? 0.55 : (uCov < 0.5 ? art : uCov < 1.5 ? (1.0 - art) * (1.0 - tbox * 0.65) : 1.0 - tbox * 0.5);
  float hue = p.x * 0.55 + p.y * 0.9 + uTilt.x * 0.8 - uTilt.y * 0.6;
  vec3 rb = spectrum(hue);
  float pat;
  if (uFoil < 0.5) {            // prism: fine diagonal lines under a sweeping band
    float lines = 0.72 + 0.28 * sin((p.x - p.y * AR) * 520.0);
    float band = exp(-pw(abs(fract(p.x * 0.6 + p.y * 0.8 - uTilt.x * 0.9 + uTilt.y * 0.7) - 0.5) * 4.0, 2.0));
    pat = lines * (0.25 + 0.85 * band);
  } else if (uFoil < 1.5) {     // galaxy: star cells that catch the light at their own angle
    vec2 cell = p * vec2(46.0, 46.0 / AR); vec2 id = floor(cell), fc = fract(cell) - 0.5;
    float h = hash(id); vec2 dir = vec2(cos(h * 6.283), sin(h * 6.283));
    float catchL = pw(max(dot(normalize(uTilt + 1e-4), dir), 0.0), 6.0) * smoothstep(0.05, 0.4, tl);
    float star = smoothstep(0.24, 0.0, length(fc)) + smoothstep(0.05, 0.0, abs(fc.x)) * smoothstep(0.4, 0.0, abs(fc.y)) * 0.5 + smoothstep(0.05, 0.0, abs(fc.y)) * smoothstep(0.4, 0.0, abs(fc.x)) * 0.5;
    float sz = mix(0.6, 1.3, fract(h * 7.1));
    pat = 0.3 + step(0.55, h) * star * sz * (0.7 + 3.2 * catchL);
    rb = mix(spectrum(h * 3.0 + uTilt.x * 0.5), vec3(1.0), 0.25) * mix(0.8, 1.0, step(0.55, h));
  } else {                      // etched: rings spreading from the light
    float rr = length((p - (0.5 + uTilt * vec2(-0.6, 0.6))) * vec2(AR, 1.0));
    pat = 0.35 + 0.65 * smoothstep(0.3, 1.0, sin(rr * 170.0));
    hue = rr * 2.2 + uTilt.x * 0.6; rb = spectrum(hue);
  }
  vec3 foil = rb * pat;
  vec3 holo = screen(col * mix(1.0, 0.72, mask * amt), foil * (0.45 + lum(col) * 0.55));
  col = mix(col, holo, clamp(mask * amt, 0.0, 1.0));
  // glare: a soft specular that follows the light, plus a wide sheen
  float gd = length((p - ptr) * vec2(AR, 1.0));
  col += vec3(1.0, 0.98, 0.94) * (exp(-gd * gd * 16.0) * 0.28 + exp(-gd * gd * 2.0) * 0.06) * (0.35 + 0.65 * uHover) * (0.5 + 0.5 * uInt);
  // a hairline of light on the edge nearest the light
  float edge = 1.0 - box(p, vec2(0.006, 0.006 * AR), vec2(0.994, 1.0 - 0.006 * AR), aa);
  col += edge * 0.25 * smoothstep(0.5, 0.0, gd);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

class Spring {
  constructor(x, k = 170, c = 16) { this.x = x; this.v = 0; this.t = x; this.k = k; this.c = c; }
  step(dt) { const n = Math.ceil(dt / (1 / 240)); const h = dt / n; for (let i = 0; i < n; i++) { this.v += (-this.k * (this.x - this.t) - this.c * this.v) * h; this.x += this.v * h; } return this.x; }
}
const FOILS = { prism: 0, galaxy: 1, etched: 2 }, COVS = { art: 0, reverse: 1, full: 2 };
const hex = (h) => { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(h.trim()); return m ? [1, 2, 3].map((i) => parseInt(m[i], 16) / 255) : [0.85, 0.7, 0.36]; };

function mount(el) {
  const tilt = el.querySelector('.vs-holo-card-tilt'), canvas = el.querySelector('.vs-holo-card-gl'), shadow = el.querySelector('.vs-holo-card-shadow');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cs = () => getComputedStyle(el);
  const S = { vis: true, raf: 0, last: 0, t: 0, hover: false, drag: null, back: false, maxT: parseFloat(cs().getPropertyValue('--vs-holo-card-tilt')) || 16,
    int: parseFloat(cs().getPropertyValue('--vs-holo-card-intensity')) || 1, accent: hex(cs().getPropertyValue('--vs-holo-card-accent') || '#d8b25c'), accentTo: null };
  S.accentTo = S.accent.slice();
  const rx = new Spring(0, 170, 14), ry = new Spring(0, 170, 14), sc = new Spring(1, 300, 20), flip = new Spring(0, 90, 13), hov = new Spring(0, 120, 18);
  const px = new Spring(0.5, 200, 24), py = new Spring(0.3, 200, 24);

  // ---- GL
  let gl = null, prog = null, U = {};
  function initGL() {
    gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) return false;
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; } return s; };
    const v = sh(gl.VERTEX_SHADER, VERT), f = sh(gl.FRAGMENT_SHADER, FRAG); if (!v || !f) return false;
    prog = gl.createProgram(); gl.attachShader(prog, v); gl.attachShader(prog, f); gl.linkProgram(prog); gl.useProgram(prog);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    U = {}; ['uRes', 'uTilt', 'uPtr', 'uTime', 'uFoil', 'uCov', 'uInt', 'uHover', 'uBack', 'uAccent'].forEach((n) => U[n] = gl.getUniformLocation(prog, n));
    return true;
  }
  if (!initGL()) { el.dataset.vsState = 'nogl'; }

  function resize() {
    const r = tilt.getBoundingClientRect(), w = tilt.offsetWidth, h = tilt.offsetHeight; if (!w) return;
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    S.w = w; S.h = h;
  }

  // ---- pointer
  const local = (e) => { const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; return { x: (e.clientX - cx) / (S.w / 2), y: (e.clientY - cy) / (S.h / 2) }; };
  const aim = (e) => { const l = local(e); const nx = Math.max(-1, Math.min(1, l.x)), ny = Math.max(-1, Math.min(1, l.y)); ry.t = nx * S.maxT; rx.t = -ny * S.maxT; px.t = 0.5 + nx * 0.5; py.t = 0.5 + ny * 0.5; };
  const onEnter = (e) => { if (e.pointerType === 'mouse') { S.hover = true; hov.t = 1; } };
  const onMove = (e) => { if (e.pointerType === 'mouse' || S.drag) { S.hover = true; hov.t = 1; aim(e); } };
  const onLeave = (e) => { if (e.pointerType === 'mouse' && !S.drag) { S.hover = false; hov.t = 0; rx.t = ry.t = 0; } };
  const onDown = (e) => { S.drag = { x: e.clientX, y: e.clientY, m: 0 }; sc.t = 0.965; try { tilt.setPointerCapture(e.pointerId); } catch (_) {} if (e.pointerType !== 'mouse') { S.hover = true; hov.t = 1; aim(e); } };
  const onDrag = (e) => { if (!S.drag) return; S.drag.m += Math.abs(e.clientX - S.drag.x) + Math.abs(e.clientY - S.drag.y); S.drag.x = e.clientX; S.drag.y = e.clientY; aim(e); };
  const onUp = (e) => {
    if (!S.drag) return; const tap = S.drag.m < 8; S.drag = null; sc.t = 1;
    if (tap) doFlip();
    if (e.pointerType !== 'mouse') { S.hover = false; hov.t = 0; rx.t = ry.t = 0; }
  };
  const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sc.v -= 3; doFlip(); } };
  function doFlip() { S.back = !S.back; flip.t = S.back ? 180 : 0; ry.v += (S.back ? 1 : -1) * 60; tilt.setAttribute('aria-pressed', S.back); }
  el.addEventListener('pointerenter', onEnter); el.addEventListener('pointermove', onMove); el.addEventListener('pointerleave', onLeave);
  tilt.addEventListener('pointerdown', onDown); tilt.addEventListener('pointermove', onDrag); tilt.addEventListener('pointerup', onUp); tilt.addEventListener('pointercancel', onUp);
  tilt.addEventListener('keydown', onKey);

  function frame(now) {
    S.raf = 0; if (!S.vis) return;
    const dt = Math.min(0.05, S.last ? (now - S.last) / 1000 : 0.016); S.last = now; S.t += dt;
    // idle: a slow sway so the foil is never still
    if (!S.hover && !S.drag && !reduced) { ry.t = Math.sin(S.t * 0.7) * S.maxT * 0.45; rx.t = Math.sin(S.t * 0.53 + 1) * S.maxT * 0.3; px.t = 0.5 + Math.sin(S.t * 0.7) * 0.35; py.t = 0.35 - Math.sin(S.t * 0.53 + 1) * 0.25; }
    const X = rx.step(dt), Y = ry.step(dt), F = flip.step(dt), K = sc.step(dt), H = hov.step(dt);
    const PX = px.step(dt), PY = py.step(dt);
    const lift = 1 + H * 0.03;
    tilt.style.transform = `rotateX(${X.toFixed(2)}deg) rotateY(${(Y + F).toFixed(2)}deg) scale(${(K * lift).toFixed(4)})`;
    shadow.style.transform = `translate(${(-Y * 1.6).toFixed(1)}px, calc(-50% + ${(22 + X * 1.4 + H * 14).toFixed(1)}px)) scale(${(0.9 - H * 0.02).toFixed(3)})`;
    shadow.style.opacity = (0.62 - H * 0.12).toFixed(3);
    const yy = ((Y + F) % 360 + 360) % 360, isBack = yy > 90 && yy < 270;
    el.classList.toggle('is-back', isBack);
    for (let i = 0; i < 3; i++) S.accent[i] += (S.accentTo[i] - S.accent[i]) * (1 - Math.exp(-dt * 8));
    if (gl && !gl.isContextLost()) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform2f(U.uTilt, Y / S.maxT, X / S.maxT);
      gl.uniform2f(U.uPtr, PX, PY);
      gl.uniform1f(U.uTime, S.t); gl.uniform1f(U.uFoil, FOILS[el.dataset.foil] ?? 0); gl.uniform1f(U.uCov, COVS[el.dataset.coverage] ?? 0);
      gl.uniform1f(U.uInt, S.int); gl.uniform1f(U.uHover, H); gl.uniform1f(U.uBack, isBack ? 1 : 0); gl.uniform3fv(U.uAccent, S.accent);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    loop();
  }
  const loop = () => { if (!S.raf && S.vis) S.raf = requestAnimationFrame(frame); };
  const ro = new ResizeObserver(resize); ro.observe(tilt); resize();
  const io = new IntersectionObserver(([e]) => { S.vis = e.isIntersecting; if (S.vis) { S.last = 0; loop(); } }); io.observe(el);
  const onVis = () => { S.vis = !document.hidden; if (S.vis) { S.last = 0; loop(); } };
  document.addEventListener('visibilitychange', onVis);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); });
  canvas.addEventListener('webglcontextrestored', () => { initGL(); });
  el.dataset.vsState = gl ? 'ready' : 'nogl';
  loop();

  function set(o = {}) {
    if (o.foil in FOILS) el.dataset.foil = o.foil;
    if (o.coverage in COVS) el.dataset.coverage = o.coverage;
    if (o.accent) { el.style.setProperty('--vs-holo-card-accent', o.accent); S.accentTo = hex(o.accent); }
    if (o.intensity != null) { S.int = +o.intensity; el.style.setProperty('--vs-holo-card-intensity', o.intensity); }
    if (o.tilt != null) { S.maxT = +o.tilt; el.style.setProperty('--vs-holo-card-tilt', o.tilt); }
    sc.v -= 1.5; // a small breath on change
  }
  function destroy() {
    cancelAnimationFrame(S.raf); S.vis = false; ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', onVis);
    el.removeEventListener('pointerenter', onEnter); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerleave', onLeave);
    tilt.removeEventListener('pointerdown', onDown); tilt.removeEventListener('pointermove', onDrag); tilt.removeEventListener('pointerup', onUp); tilt.removeEventListener('pointercancel', onUp); tilt.removeEventListener('keydown', onKey);
    if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext(); delete el.vsHoloCard;
  }
  return { set, flip: doFlip, destroy };
}

document.querySelectorAll('.vs-holo-card').forEach((el) => { if (!el.vsHoloCard) el.vsHoloCard = mount(el); });
