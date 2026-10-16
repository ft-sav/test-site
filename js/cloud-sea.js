(() => {
  /* ---- shared runtime: WebGL2 context, resize, visibility, pointer spring, CSS-variable props ---- */
  const VS = (root, spec) => {
    const P = spec.prefix, canvas = root.querySelector('canvas');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const S = { root, canvas, gl: null, w: 1, h: 1, cssW: 1, cssH: 1, dpr: 1, t: spec.t0 || 0, rt: 0, speed: 1, frame: 0, visible: false, lost: false, raf: 0, reduced: reduce.matches, css: {},
      ptr: { x: .5, y: .5, tx: .5, ty: .5, vx: 0, vy: 0, px: .5, py: .5, down: false, inside: false, active: 0, seen: false } };
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl) { root.classList.add(P + '-fallback'); return null; }
    S.gl = gl;
    /* colours: any CSS colour string -> linear rgb */
    const cc = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const toLin = (v) => (v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4));
    const color = (str) => { cc.clearRect(0, 0, 1, 1); cc.fillStyle = '#000'; cc.fillStyle = str; cc.fillRect(0, 0, 1, 1); const d = cc.getImageData(0, 0, 1, 1).data; return [toLin(d[0] / 255), toLin(d[1] / 255), toLin(d[2] / 255)]; };
    const readVars = () => {
      const cs = getComputedStyle(root);
      for (const [k, def] of Object.entries(spec.vars || {})) {
        const raw = cs.getPropertyValue(`--${P}-${k}`).trim() || String(def);
        S.css[k] = typeof def === 'number' ? (parseFloat(raw) || 0) : color(raw);
      }
      S.speed = S.css.speed != null ? S.css.speed : 1;
      spec.vars && spec.onVars && spec.onVars(S);
    };
    /* GL helpers */
    const VERT = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2. - 1., 0., 1.); }`;
    S.program = (frag, vert) => {
      const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) console.warn(P, gl.getShaderInfoLog(s)); return s; };
      const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vert || VERT)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float;\nprecision highp int;\n' + frag)); gl.linkProgram(p);
      const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) || 0;
      for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, a.name); }
      return { p, u };
    };
    S.target = (w, h, o = {}) => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      const half = o.half !== false && S.hf;
      gl.texImage2D(gl.TEXTURE_2D, 0, half ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, half ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      const f = o.nearest ? gl.NEAREST : gl.LINEAR;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, o.mip ? gl.LINEAR_MIPMAP_LINEAR : f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
      const wrap = o.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE; gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { t, fb, w, h, mip: !!o.mip };
    };
    S.pair = (w, h, o) => { const a = S.target(w, h, o), b = S.target(w, h, o); return { a, b, w, h, swap() { const x = this.a; this.a = this.b; this.b = x; } }; };
    S.free = (...ts) => ts.forEach((x) => { if (!x) return; if (x.a) { S.free(x.a, x.b); return; } gl.deleteTexture(x.t); gl.deleteFramebuffer(x.fb); });
    /* draw a program into a target (null = screen); tex = {name: target|texture} bound to units in order */
    S.draw = (pr, out, uni = {}, tex = {}) => {
      gl.useProgram(pr.p);
      if (out) { gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb); gl.viewport(0, 0, out.w, out.h); } else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, S.w, S.h); }
      let unit = 0;
      for (const [k, v] of Object.entries(tex)) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v && v.t !== undefined ? v.t : v); if (pr.u[k]) gl.uniform1i(pr.u[k], unit); unit++; }
      for (const [k, v] of Object.entries(uni)) {
        const l = pr.u[k]; if (!l) continue;
        if (typeof v === 'number') gl.uniform1f(l, v); else if (v.length === 2) gl.uniform2fv(l, v); else if (v.length === 3) gl.uniform3fv(l, v); else if (v.length === 4) gl.uniform4fv(l, v); else gl.uniform3fv(l, v);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (out && out.mip) { gl.bindTexture(gl.TEXTURE_2D, out.t); gl.generateMipmap(gl.TEXTURE_2D); }
    };
    const setup = () => {
      S.hf = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
      gl.getExtension('OES_texture_float_linear');
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      spec.init(S); S.sized = false; readVars(); resize();
    };
    const resize = () => {
      const r = root.getBoundingClientRect(); const scale = (spec.scale ? spec.scale(S) : 1);
      S.cssW = Math.max(1, r.width); S.cssH = Math.max(1, r.height);
      S.dpr = Math.min(window.devicePixelRatio || 1, 2) * scale;
      const w = Math.max(1, Math.round(S.cssW * S.dpr)), h = Math.max(1, Math.round(S.cssH * S.dpr));
      if (w === S.w && h === S.h && S.sized) return;
      S.w = canvas.width = w; S.h = canvas.height = h; S.aspect = w / h; S.sized = true;
      spec.resize && spec.resize(S);
      if (S.reduced) still();
    };
    /* pointer: a spring toward the finger/mouse, in root-normalised coords (0..1, y up) */
    const P_ = S.ptr;
    const at = (cx, cy) => { const r = root.getBoundingClientRect(); P_.tx = (cx - r.left) / Math.max(1, r.width); P_.ty = 1 - (cy - r.top) / Math.max(1, r.height); P_.inside = P_.tx >= 0 && P_.tx <= 1 && P_.ty >= 0 && P_.ty <= 1; if (!P_.seen) { P_.x = P_.px = P_.tx; P_.y = P_.py = P_.ty; P_.seen = true; } P_.active = 1; P_.last = performance.now(); };
    addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') at(e.clientX, e.clientY); }, { passive: true });
    addEventListener('pointerdown', (e) => { at(e.clientX, e.clientY); if (P_.inside) { P_.down = true; spec.press && spec.press(S, true); } }, { passive: true });
    addEventListener('pointerup', () => { if (P_.down) { P_.down = false; spec.press && spec.press(S, false); } }, { passive: true });
    addEventListener('pointercancel', () => { if (P_.down) { P_.down = false; spec.press && spec.press(S, false); } }, { passive: true });
    addEventListener('touchstart', (e) => { const t = e.touches[0]; if (t) { P_.seen = false; at(t.clientX, t.clientY); } }, { passive: true });
    addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) at(t.clientX, t.clientY); }, { passive: true });
    const stepPtr = (dt) => {
      P_.px = P_.x; P_.py = P_.y;
      const k = spec.ptrSpring || [170, 26]; const n = Math.ceil(dt / (1 / 120));
      for (let i = 0; i < n; i++) { const h = dt / n; P_.vx += ((P_.tx - P_.x) * k[0] - P_.vx * k[1]) * h; P_.vy += ((P_.ty - P_.y) * k[0] - P_.vy * k[1]) * h; P_.x += P_.vx * h; P_.y += P_.vy * h; }
      P_.active = Math.max(0, P_.active - dt * .6);
    };
    /* loop: only while on screen, tab visible and context alive */
    let last = 0;
    const loop = (now) => {
      S.raf = 0; if (!canRun()) return;
      const dt = last ? Math.min(.05, (now - last) / 1000) : 1 / 60; last = now;
      stepPtr(dt); S.t += dt * S.speed; S.rt += dt; S.frame++;
      spec.frame(S, dt);
      schedule();
    };
    const canRun = () => S.visible && !document.hidden && !S.lost && !S.reduced;
    const schedule = () => { if (!S.raf && canRun()) { S.raf = requestAnimationFrame(loop); } else if (!canRun()) last = 0; };
    const still = () => { if (S.lost) return; (spec.still || ((s) => spec.frame(s, 1 / 60)))(S); };
    new ResizeObserver(resize).observe(root);
    new IntersectionObserver((es) => { S.visible = es[es.length - 1].isIntersecting; schedule(); }, { rootMargin: '64px' }).observe(root);
    document.addEventListener('visibilitychange', schedule);
    reduce.addEventListener('change', () => { S.reduced = reduce.matches; S.reduced ? still() : schedule(); });
    new MutationObserver(() => { readVars(); if (S.reduced) still(); }).observe(root, { attributes: true, attributeFilter: ['style', 'class'] });
    root.addEventListener(P + ':refresh', () => { readVars(); if (S.reduced) still(); });
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); S.lost = true; if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0; });
    canvas.addEventListener('webglcontextrestored', () => { S.lost = false; setup(); schedule(); });
    S.api = { press: (on) => spec.press && spec.press(S, on) };
    setup();
    if (S.reduced) still();
    root.classList.add(P + '-ready');
    return S;
  };

  const NOISE = `
uniform sampler2D uNoise;
float noise3(vec3 x){ vec3 p = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  vec2 uv = (p.xy + vec2(37., 17.) * p.z) + f.xy; vec2 rg = textureLod(uNoise, (uv + .5) / 256., 0.).yx; return mix(rg.x, rg.y, f.z); }
float h12(vec2 p){ vec3 a = fract(p.xyx * .1031); a += dot(a, a.yzx + 33.33); return fract((a.x + a.y) * a.z); }`;
  const CAM = `
uniform vec2 uRes; uniform vec3 uCam; // yaw, pitch, fov scale
vec3 rayDir(vec2 uv){
  float asp = uRes.x / uRes.y;
  vec2 q = (uv - .5) * vec2(asp, 1.) * uCam.z;
  vec3 d = normalize(vec3(q, -1.));
  float cp = cos(uCam.y), sp = sin(uCam.y); d.yz = mat2(cp, sp, -sp, cp) * d.yz;
  float cy = cos(uCam.x), sy = sin(uCam.x); d.xz = mat2(cy, -sy, sy, cy) * d.xz;
  return d;
}`;
  /* the cloud slab, marched at half resolution; the history is reprojected through the camera's turn and accumulated */
  const MARCH = `${NOISE}${CAM}
uniform sampler2D uHist, uPart; uniform float uTime, uFrame, uBlend, uPartK; uniform vec3 uPrevCam;
uniform vec3 uSunDir, uSun, uZen, uHor, uShade; out vec4 o;
float crest(vec2 xz){
  float big = noise3(vec3(xz * .17 + 11.3, 2.1));
  float b1 = smoothstep(.22, .78, noise3(vec3(xz * .8, .5))), b2 = smoothstep(.2, .8, noise3(vec3(xz * 1.9 + 5.1, 1.5))), b3 = noise3(vec3(xz * 4.3 + 2.7, 3.5));
  return -1. + (big - .5) * .9 + (b1 - .5) * .62 + (b2 - .5) * .3 + (b3 - .5) * .2;
}
float den(vec3 p, int oct, float part, float top, out float h){
  vec2 xz = p.xz + vec2(uTime * .03, uTime * .011);
  // the pointer's trough: frayed by noise, with the crest heaped a little along its lip
  float pe = part * (.65 + .7 * noise3(vec3(xz * 3.1, uTime * .12)));
  top += -pe * 1.65 + .2 * smoothstep(.04, .3, part) * (1. - smoothstep(.3, .75, part));
  h = top - p.y;
  if (h < -.22) return 0.;
  vec3 q = vec3(xz * 4.4, p.y * 4.4 - uTime * .04);
  float f = 0., a = .5;
  for (int i = 0; i < 5; i++){ if (i >= oct) break; f += a * noise3(q); q = q * 2.13 + vec3(1.7, 9.2, 3.1); a *= .5; }
  float d = h * 6.8 + (f - .47) * 2.5 - pe * (1.3 - f) * 3.;
  d *= smoothstep(-2.45, -2.05, p.y);
  return clamp(d, 0., 1.);
}
float denAt(vec3 p, int oct, float part){ float h; return den(p, oct, part, crest(p.xz + vec2(uTime * .03, uTime * .011)), h); }
vec2 prevUv(vec3 d){
  float cy = cos(uPrevCam.x), sy = sin(uPrevCam.x); d.xz = mat2(cy, sy, -sy, cy) * d.xz;
  float cp = cos(uPrevCam.y), sp = sin(uPrevCam.y); d.yz = mat2(cp, -sp, sp, cp) * d.yz;
  vec2 q = d.xy / max(-d.z, 1e-4);
  return q / (vec2(uRes.x / uRes.y, 1.) * uPrevCam.z) + .5;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 d = rayDir(uv);
  vec4 res = vec4(0., 0., 0., 1.);
  if (d.y < -.0005){
    float tTop = -.42 / d.y, tBot = -2.45 / d.y, tMax = min(tBot, 70.);
    float nearK = smoothstep(.02, .14, -d.y);
    vec2 px = 1. / vec2(textureSize(uPart, 0));
    float pv = texture(uPart, uv).r * .4 + (texture(uPart, uv + vec2(px.x * 2., 0.)).r + texture(uPart, uv - vec2(px.x * 2., 0.)).r + texture(uPart, uv + vec2(0., px.y * 2.)).r + texture(uPart, uv - vec2(0., px.y * 2.)).r) * .15;
    float part = smoothstep(0., 1.2, pv) * uPartK * nearK;
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy + mod(uFrame, 64.) * 5.588238, vec2(.06711056, .00583715))));
    float t = tTop; float dt = .01 + t * .009; t += dt * ign;
    vec3 L = uSunDir; float mu = dot(d, L);
    float fw = pow(max(mu, 0.), 8.);
    vec3 sunL = uSun * 5.;
    vec3 col = vec3(0.); float T = 1.;
    for (int i = 0; i < 84; i++){
      if (t > tMax || T < .02) break;
      vec3 p = d * t;
      int oct = t > 24. ? 2 : (t > 9. ? 3 : (t > 3. ? 4 : 5));
      float top = crest(p.xz + vec2(uTime * .03, uTime * .011));
      float h; float s = den(p, oct, part, top, h);
      if (s > .002){
        float hh_;
        // the two short light taps reuse this column's crest; the long ones look it up
        float od = den(p + L * .08, 2, part, top, hh_) * .9 + den(p + L * .24, 2, part, top, hh_) * 1.4 + denAt(p + L * .6, 1, part) * 2.2 + (t < 12. ? denAt(p + L * 1.3, 1, part) * 2.4 : .8);
        float Ts = exp(-od * 2.1) + .12 * exp(-od * .35);
        float powder = 1. - exp(-s * 3.2);
        float hh = clamp((-1. - p.y) * 1.1 + .35, 0., 1.);
        vec3 amb = mix(uShade * .9 + uZen * .25, uShade * .32, hh);
        float ph = .38 + 3.8 * fw * (1. - s * .5);
        float wall = exp(-max(0., top - p.y) * 2.2 * min(1., part * 2.));
        vec3 S = sunL * Ts * ph * mix(.4, 1., powder) * wall + amb + uShade * .22 * (1. - wall);
        float Tst = exp(-s * 10. * dt);
        col += T * S * (1. - Tst);
        T *= Tst;
        dt = .01 + t * .009;
      } else {
        // empty air: skip toward the crest
        dt = max(.01 + t * .009, min((-h - .2) * .25 / max(-d.y, .08), 1.));
      }
      t += dt;
    }
    if (T > .02 && tBot < 90.){
      // the valley, seven units down, through the gap
      vec3 g = d * (-7. / d.y);
      float gn = noise3(vec3(g.xz * .09, 4.2)) * .6 + noise3(vec3(g.xz * .35, 7.7)) * .4;
      float rv = smoothstep(.022, .0, abs(noise3(vec3(g.xz * .11, 9.1)) - .5)) * smoothstep(.45, .7, noise3(vec3(g.xz * .05, 2.3)));
      vec3 v = mix(uShade * .1 + vec3(0., .01, .012), uShade * .3 + vec3(.01, .035, .02), gn) + (uHor * .05 + uSun * .03) * rv;
      v = mix(v, uShade * .3 + uZen * .3 + uHor * .06, smoothstep(25., 90., length(g.xz)));
      col += T * v; T = 0.;
    }
    float fog = 1. - exp(-min(tTop, tMax) * .03);
    col = mix(col, mix(uHor, uShade, .45) * (1. - T), fog * fog);
    res = vec4(col, T);
  }
  vec2 pu = prevUv(d);
  float k = uBlend; if (pu.x < 0. || pu.y < 0. || pu.x > 1. || pu.y > 1.) k = 1.;
  vec4 hst = texture(uHist, pu);
  vec4 r = mix(hst, res, k);
  o = (any(isnan(r)) || any(isinf(r))) ? res : r;
}`;
  /* the pointer's trail: a decaying, slowly spreading wake */
  const TRAIL = `
uniform sampler2D uPrev; uniform vec2 uRes, uA, uB; uniform float uAsp, uDecay, uAmt, uRad; out vec4 o;
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0., 1.); return length(pa - ba * h); }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes, px = 1. / uRes;
  float c = texture(uPrev, uv).r * .6 + (texture(uPrev, uv + vec2(px.x, 0.)).r + texture(uPrev, uv - vec2(px.x, 0.)).r + texture(uPrev, uv + vec2(0., px.y)).r + texture(uPrev, uv - vec2(0., px.y)).r) * .1;
  vec2 s = vec2(uAsp, 1.);
  float d = seg(uv * s, uA * s, uB * s);
  c = c * uDecay + uAmt * exp(-d * d / (uRad * uRad));
  o = vec4(min(c, 1.6), 0., 0., 1.);
}`;
  /* the world: sky, sun, the accumulated sea; graded */
  const VIEW = `${NOISE}${CAM}
uniform sampler2D uSea; uniform float uTime, uFrame, uExp; uniform vec3 uSunDir, uSun, uZen, uHor, uShade; out vec4 o;
vec3 toSRGB(vec3 c){ c = max(c, 0.); return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
vec3 sky(vec3 d){
  float e = d.y, mu = max(dot(d, uSunDir), 0.);
  vec3 mid = mix(uZen, uShade, .55) * 1.2;
  vec3 c = mix(uHor, mid, smoothstep(.0, .09, e));
  c = mix(c, uZen, smoothstep(.07, .38, e));
  c += uHor * .35 * exp(-abs(e - .004) * 60.);
  // thin strands of high cirrus, lit from below
  vec2 cp = d.xz / max(e + .05, .03);
  float ci = smoothstep(.6, .9, noise3(vec3(cp.x * .5 + uTime * .006, cp.y * 3.2, 1.))) * smoothstep(.03, .1, e) * (1. - smoothstep(.16, .3, e));
  c += (uSun * .6 + uHor * .25) * ci * .25;
  c += uSun * (pow(mu, 6.) * .18 + pow(mu, 50.) * .9 + pow(mu, 400.) * 2.5);
  c += mix(uSun, vec3(1.), .6) * 24. * smoothstep(.99989, .99994, mu);
  return c;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 d = rayDir(uv);
  vec3 col = sky(d);
  if (d.y < .02){
    vec4 s = texture(uSea, uv);
    float mu = max(dot(d, uSunDir), 0.);
    vec3 behind = mix(uHor, uShade, .4);
    col = mix(col, s.rgb + s.a * behind, smoothstep(.02, -.004, d.y));
    col += uSun * pow(mu, 12.) * .35 * smoothstep(-.14, 0., d.y);
  }
  col *= uExp;
  col = aces(col * 1.05);
  // split tone: cool shadows, warm highlights
  float l = dot(col, vec3(.2126, .7152, .0722));
  col = mix(col, col * vec3(.92, .97, 1.08), (1. - l) * .35);
  col = mix(col, col * vec3(1.06, 1., .93), l * .3);
  col = toSRGB(col);
  vec2 v = abs(uv - .5) * 2.; col *= 1. - .22 * smoothstep(.0, 1., length(max(v - .4, 0.)) / .8);
  col += (h12(gl_FragCoord.xy + uFrame * vec2(17.3, 41.9)) + h12(gl_FragCoord.yx + uFrame * 7.7) - 1.) * .02;
  o = vec4(clamp(col, 0., 1.), 1.);
}`;
  const noiseTex = (gl) => {
    let s = 3412; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const N = 256, R = new Uint8Array(N * N); for (let i = 0; i < N * N; i++) R[i] = (rnd() * 256) | 0;
    const d = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = (y * N + x) * 4; d[i] = R[y * N + x]; d[i + 1] = R[((y - 17) & 255) * N + ((x - 37) & 255)]; d[i + 3] = 255; }
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return t;
  };
  document.querySelectorAll('.vs-cloud-sea:not(.vs-cloud-sea-ready)').forEach((root) => {
    let pm, pt, pv, sea, trail, noise, fresh = 0, lastA = null, prevCam = null;
    const cam = (S) => {
      const P = S.ptr, asp = S.aspect || 1.6;
      const fov = .78 * Math.max(1, Math.sqrt(1.15 / asp));
      return [(P.x - .5) * .08, -.1 - (asp < 1 ? .05 : 0) + (P.y - .5) * .04, fov];
    };
    const sunDir = (S) => { const h = .01 + S.css['sun-height'] * .5; const v = [.32, h, -1]; const l = Math.hypot(...v); return v.map((x) => x / l); };
    const step = (S, dt, blend) => {
      const P = S.ptr, c = cam(S), sd = sunDir(S), C = S.css;
      // trail: stamp along the pointer's path since last frame, weighted by how fast it moved
      const b = [P.x, P.y], a = lastA || b; lastA = b;
      const sp = Math.hypot((b[0] - a[0]) * S.aspect, b[1] - a[1]) / Math.max(dt, 1e-3);
      const amt = P.seen ? Math.min(.6, .03 + sp * .3) * Math.min(1, P.active * 3) * Math.min(1, dt * 60) : 0;
      S.draw(pt, trail.b, { uRes: [trail.w, trail.h], uA: a, uB: b, uAsp: S.aspect, uDecay: Math.exp(-dt / 2.6), uAmt: amt, uRad: .062 }, { uPrev: trail.a }); trail.swap();
            S.draw(pm, sea.b, { uRes: [sea.w, sea.h], uCam: c, uTime: S.t, uFrame: S.frame, uBlend: fresh < 2 ? 1 : (blend || .3), uPrevCam: prevCam || c, uPartK: C.part, uSunDir: sd, uSun: C.sun, uZen: C.zenith, uHor: C.horizon, uShade: C.shade }, { uNoise: noise, uHist: sea.a, uPart: trail.a }); sea.swap(); fresh++; prevCam = c;
      S.draw(pv, null, { uRes: [S.w, S.h], uCam: c, uTime: S.t, uFrame: S.frame % 97, uExp: C.exposure, uSunDir: sd, uSun: C.sun, uZen: C.zenith, uHor: C.horizon, uShade: C.shade }, { uNoise: noise, uSea: sea.a });
    };
    VS(root, {
      prefix: 'vs-cloud-sea', t0: 40,
      vars: { zenith: '#1f2656', horizon: '#f0a488', sun: '#ffc58f', shade: '#6b6f9c', 'sun-height': .12, part: 1, speed: 1, exposure: 1 },
      ptrSpring: [60, 16],
      init(S) { pm = S.program(MARCH); pt = S.program(TRAIL); pv = S.program(VIEW); noise = noiseTex(S.gl); },
      resize(S) {
        S.free(sea, trail);
        const w = Math.max(2, Math.round(S.cssW * .5 * Math.min(1.25, S.dpr))), h = Math.max(2, Math.round(S.cssH * .5 * Math.min(1.25, S.dpr)));
        sea = S.pair(w, h); trail = S.pair(160, Math.max(2, Math.round(160 / S.aspect))); fresh = 0;
      },
      frame(S, dt) { step(S, dt); },
      still(S) { fresh = 0; for (let i = 0; i < 12; i++) { S.frame++; step(S, 1 / 60, i ? .12 : 1); } },
    });
  });
})();
