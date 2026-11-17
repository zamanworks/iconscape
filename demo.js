// Iconscape live demo: Lagoon, Cloud Meadow and Metro grown around draggable icons, ported from the app's
// renderer (same distance field, noise, colours, move morph and artwork). Everything is in the app's points
// on a virtual 1470×956 screen; the canvases are scaled to fit.
(() => {
  const root = document.getElementById("demo");
  if (!root) return;
  const VW = 1470, VH = 956, STEP = 3;
  const GX = 104, GY = 112, OX = 20, IW = 96, IH = 100;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Noise (same as the app's Math.swift) ----------
  const imul = Math.imul;
  function hash2(x, y, s) {
    let h = (imul(x, 374761393) + imul(y, 668265263) + imul(s, 1442695041)) | 0;
    h = imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }
  const hashF = (x, y, s) => (hash2(x, y, s) & 0xffffff) / 0xffffff;
  function valueNoise(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = hashF(xi, yi, seed), b = hashF(xi + 1, yi, seed), c = hashF(xi, yi + 1, seed), d = hashF(xi + 1, yi + 1, seed);
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  }
  function fbm(x, y, oct, seed) {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) { sum += amp * valueNoise(x * f, y * f, seed + o * 31); norm += amp; amp *= 0.5; f *= 2.03; }
    return sum / norm;
  }
  const sst = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;
  const hex = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

  // ---------- Scenes (field settings from Themes.swift) ----------
  const SCENES = {
    lagoon: { mode: 0, seed: 11, warp: 16, roundness: 0.8, blend: 34, cell: 18, jitter: true, moon: 0.42,
              clouds: 0.04, birds: "gull" },
    meadow: { mode: 1, seed: 23, warp: 30, roundness: 0.8, blend: 34, moon: 0, bg: "meadow", moveTime: 800,   // the app's cloud move
              moonLit: true, drift: true, birds: "songbird", flutter: true,
              walkers: [{ kind: "kiteKid", minV: 70, step: 55, clearance: 30 }, { kind: "cat", minV: 50, step: 40, clearance: 20 }] },
    metro: { mode: 2, seed: 83, warp: 0, roundness: 0.12, blend: 6, cell: 30, jitter: false, moon: 0, bg: "metro",
             tint: true, clouds: 0.08, birds: "crow", cars: true }
  };
  let sceneId = "lagoon", sc = SCENES.lagoon;

  // ---------- Field grid ----------
  const cols = Math.ceil(VW / STEP) + 2, rows = Math.ceil(VH / STEP) + 2, N = cols * rows;
  const warps = {};
  function warpGrid(s) {
    if (!warps[s.seed]) {
      const g = new Float32Array(N);
      if (s.warp) for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++)
        g[j * cols + i] = fbm(i * STEP / 115, j * STEP / 115, 4, s.seed + 3) * s.warp * 1.6;
      warps[s.seed] = g;
    }
    return warps[s.seed];
  }
  const empty = () => new Float32Array(N).fill(2000);
  // The smooth union of the icons' rounded boxes; `base` continues an earlier union (so a move only adds the
  // icons that moved to the ones that stayed, instead of starting over).
  const boxesOf = (icons, s) => icons.map(r => {
    const hx = r.w / 2 + 6, hy = r.h / 2 + 6;
    return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, hx, hy, r: Math.min(hx, hy) * s.roundness };
  });
  function rawField(icons, base = null, s = sc) {
    const out = base ? base.slice() : new Float32Array(N).fill(2000);
    if (icons.length) rawRows(boxesOf(icons, s), out, 0, rows, s.blend);
    return out;
  }
  function rawRows(boxes, out, j0, j1, k) {   // rows j0..<j1 of the union, continuing from what's in `out`
    for (let j = j0; j < j1; j++) {
      const y = j * STEP;
      for (let i = 0; i < cols; i++) {
        const x = i * STEP;
        const idx = j * cols + i;
        let d = out[idx];
        for (const b of boxes) {
          const qx = Math.abs(x - b.cx) - b.hx + b.r, qy = Math.abs(y - b.cy) - b.hy + b.r;
          const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
          const sd = Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - b.r;
          const hh = Math.max(k - Math.abs(d - sd), 0) / k;
          d = Math.min(d, sd) - hh * hh * k * 0.25;
        }
        out[idx] = d;
      }
    }
  }
  function warped(raw, s = sc, out = new Float32Array(N)) {
    const wg = warpGrid(s);
    for (let i = 0; i < N; i++) {
      const d = raw[i], t = Math.max(0, Math.min(1, (d + 6) / 42));
      out[i] = d + wg[i] * t * t * (3 - 2 * t);
    }
    return out;
  }
  const field = (icons, s = sc) => icons.length ? warped(rawField(icons, null, s), s) : empty();

  // The app's move morph: the old clearings sink, the new ones rise, everything else stays still.
  function morphField(m, t, out) {
    const R = 520, K = 140, u = 1 - t;
    const sink = R * Math.pow(t, 1.4), rise = R * Math.pow(u, 2.3);
    const wa = 1 - sst(0, 0.12, t), wb = sst(0.72, 1, t);
    const { a, b, kept, left, arrived } = m;
    for (let i = 0; i < N; i++) {
      const pa = a[i], pb = b[i];
      const hb = Math.max(K - Math.abs(pa - pb), 0) / K;
      const hi = Math.max(pa, pb) + hb * hb * K * 0.25, lo = Math.min(pa, pb) - hb * hb * K * 0.25;
      const v = Math.max(Math.min(Math.min(kept[i], Math.min(left[i] + sink, arrived[i] + rise)), hi), lo);
      out[i] = v + (pa - v) * wa + (pb - v) * wb;
    }
    return out;
  }

  function sampleV(f, x, y) {
    const gx = Math.max(0, Math.min(cols - 1.001, x / STEP)), gy = Math.max(0, Math.min(rows - 1.001, y / STEP));
    const i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, o = j * cols + i;
    return mix(mix(f[o], f[o + 1], fx), mix(f[o + cols], f[o + cols + 1], fx), fy);
  }

  // ---------- Ground: drawn on the graphics card (WebGL2); without it, a lower-resolution Lagoon ----------
  const stage = root.querySelector(".demo-stage");
  const groundCv = root.querySelector(".demo-ground"), puffCv = root.querySelector(".demo-puffs");
  const shadeCv = root.querySelector(".demo-shade"), lifeCv = root.querySelector(".demo-life"), oldCv = root.querySelector(".demo-old"), skyCv = root.querySelector(".demo-sky");

  // Lagoon colour ramps by distance (the theme's surface function, tabulated). Sand is looked up by its
  // distance nudged by the sand wobble, water by its distance; grain and landscape noise brighten or darken.
  const dry = hex(0xF5EAD6), damp = hex(0xEDDDC2), wet = hex(0xDCC6A2);
  const w0 = hex(0xA6EDE1), w1 = hex(0x45CAD3), w2 = hex(0x1BA0CB), w3 = hex(0x0C70B1);
  const shallow = [0, 1, 2].map(i => mix(wet[i], w0[i], 0.45));
  const moonC = hex(0x8EA6D8);
  const grade = (c, desat, exposure) => {   // MoonGrade.apply
    const l = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
    return c.map((x, i) => mix(x, l * moonC[i], desat) * exposure);
  };
  const LO = -120, HI = 520, RES = 4, LN = (HI - LO) * RES, LP = 62;
  const AURA = 60;   // how broadly neighbouring islands' shallows merge (pt), as the app's auraBlend
  const lutDay = new Float32Array(LN * 3), lutNight = new Float32Array(LN * 3);
  const rampDay = new Float32Array(LN * 3), rampNight = new Float32Array(LN * 3);
  for (let n = 0; n < LN; n++) {
    const v = LO + n / RES, c = [0, 0, 0];
    if (v < LP) {
      const w = sst(-44, -2, v - LP), t1 = sst(0, 0.6, w), t2 = sst(0.45, 1, w);
      for (let i = 0; i < 3; i++) c[i] = mix(mix(dry[i], damp[i], t1), wet[i], t2);
    } else {
      const d = v - LP, a = sst(0, 60, d), b = sst(15, 170, d), e = sst(110, 400, d), s1 = sst(2, 26, d), s0 = sst(0, 5, d);
      for (let i = 0; i < 3; i++) c[i] = mix(wet[i], mix(shallow[i], mix(mix(mix(w0[i], w1[i], a), w2[i], b), w3[i], e), s1), s0);
    }
    const g = grade(c, 0.45, 0.95);
    for (let i = 0; i < 3; i++) { lutDay[n * 3 + i] = c[i]; lutNight[n * 3 + i] = g[i]; }
    // The open-water ramp alone, by depth past the shore (see auraDepth), for the merged shallows.
    const dd = n / RES, a = sst(0, 60, dd), b = sst(15, 170, dd), e = sst(110, 400, dd), r = [0, 0, 0];
    for (let i = 0; i < 3; i++) r[i] = mix(mix(mix(w0[i], w1[i], a), w2[i], b), w3[i], e);
    const rg = grade(r, 0.45, 0.95);
    for (let i = 0; i < 3; i++) { rampDay[n * 3 + i] = r[i]; rampNight[n * 3 + i] = rg[i]; }
  }
  const wetNight = grade(wet, 0.45, 0.95), shallowNight = grade(shallow, 0.45, 0.95);

  // Where the shallows of two islands meet, the water between should read as one shallow sea, not a deeper
  // seam along the line halfway between them (the colour ramp by distance draws one there, and one island's
  // shallows seem to bend around the other's as it moves). A broad blur of the distance dips along that seam
  // while a lone shore only blurs outward, so the smaller of the two keeps every single shore exact. Same as
  // the app's Field.blendAuras (at half the grid's resolution, three box blurs each way).
  const BC = (cols + 1) >> 1, BR = (rows + 1) >> 1;
  const auraG = new Float32Array(BC * BR), auraT = new Float32Array(BC * BR), depthF = new Float32Array(cols * rows);
  function auraPass(a, b, count, lines, along, across, h) {
    const w = 2 * h + 1;
    for (let l = 0; l < lines; l++) {
      const base = l * across, at = k => a[base + (k < 0 ? 0 : k >= count ? count - 1 : k) * along];
      let sum = 0;
      for (let k = -h; k <= h; k++) sum += at(k);
      for (let k = 0; k < count; k++) { b[base + k * along] = sum / w; sum += at(k + h + 1) - at(k - h); }
    }
  }
  function auraDepth(f, sigma) {
    for (let j = 0; j < BR; j++) for (let i = 0; i < BC; i++)
      auraG[j * BC + i] = Math.min(f[Math.min(j * 2, rows - 1) * cols + Math.min(i * 2, cols - 1)], 420);
    const h = Math.max(1, Math.round(sigma / (STEP * 2)));
    for (let k = 0; k < 3; k++) {
      auraPass(auraG, auraT, BC, BR, 1, BC, h);
      auraPass(auraT, auraG, BR, BC, BC, 1, h);
    }
    for (let j = 0; j < rows; j++) {
      const gy = Math.min(j / 2, BR - 1), j0 = Math.min(gy | 0, BR - 2), ty = gy - j0;
      for (let i = 0; i < cols; i++) {
        const gx = Math.min(i / 2, BC - 1), i0 = Math.min(gx | 0, BC - 2), tx = gx - i0, a = j0 * BC + i0;
        const top = auraG[a] + (auraG[a + 1] - auraG[a]) * tx, bot = auraG[a + BC] + (auraG[a + BC + 1] - auraG[a + BC]) * tx;
        const o = j * cols + i, b = top + (bot - top) * ty;
        depthF[o] = f[o] < b ? f[o] : b;
      }
    }
    return depthF;
  }

  function gpuGround(cv) {
    const gl = cv.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: true });
    if (!gl) return null;
    const vA = c => `vec3(${(c[0] / 255).toFixed(4)}, ${(c[1] / 255).toFixed(4)}, ${(c[2] / 255).toFixed(4)})`, v3 = h => vA(hex(h));
    const vs = `#version 300 es
      in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
    const fs = `#version 300 es
      precision highp float; precision highp int;
      uniform sampler2D field, depth, lut, bgDay, bgNight; uniform vec2 res; uniform float night; uniform int mode;
      out vec4 o;
      const vec2 dims = vec2(${cols}.0, ${rows}.0);
      uint hash2(int x, int y, int s) {
        uint h = uint(x) * 374761393u + uint(y) * 668265263u + uint(s) * 1442695041u;
        h = (h ^ (h >> 13u)) * 1274126177u; return h ^ (h >> 16u);
      }
      float hashF(int x, int y, int s) { return float(hash2(x, y, s) & 0xffffffu) / 16777215.0; }
      float vnoise(vec2 q, int seed) {
        vec2 i = floor(q), f = q - i; int ix = int(i.x), iy = int(i.y);
        float a = hashF(ix, iy, seed), b = hashF(ix + 1, iy, seed), c = hashF(ix, iy + 1, seed), d = hashF(ix + 1, iy + 1, seed);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return (a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y) * 2.0 - 1.0;
      }
      float fbm3(vec2 q, int seed) {
        float s = 0.0, amp = 0.5, fr = 1.0, nrm = 0.0;
        for (int k = 0; k < 3; k++) { s += amp * vnoise(q * fr, seed + k * 31); nrm += amp; amp *= 0.5; fr *= 2.03; }
        return s / nrm;
      }
      float vAt(vec2 pt) { return texture(field, (pt / ${STEP}.0 + 0.5) / dims).r; }
      void main() {
        vec2 pt = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y) / res * vec2(${VW}.0, ${VH}.0);
        float v = vAt(pt);
        float fn = hashF(int(floor(pt.x * 2.0 + 0.5)), int(floor(pt.y * 2.0 + 0.5)), 5) * 2.0 - 1.0;
        vec2 uv = pt / vec2(${VW}.0, ${VH}.0);
        vec3 bg = mix(texture(bgDay, uv).rgb, texture(bgNight, uv).rgb, night);
        vec3 c;
        if (mode == 0) {                                    // Lagoon
          float hn = fbm3(pt / 360.0, 61) * 1.35, n, sc;
          if (v < ${LP}.0) {
            float wob = vnoise(pt / 46.0, 71) * 2.2 + vnoise(pt / 13.0, 72) * 0.8;
            n = v - wob * 2.0; sc = 1.0 + fn * 0.035 + hn * 0.03;
            float u = (clamp((n - ${LO}.0) * ${RES}.0, 0.0, ${LN - 1}.0) + 0.5) / ${LN}.0;
            c = mix(texture(lut, vec2(u, 0.125)).rgb, texture(lut, vec2(u, 0.375)).rgb, night) * sc;
          } else {
            // Shore details by the distance; the open-water ramp by the merged depth.
            float d = v - ${LP}.0, dd = max(texture(depth, (pt / ${STEP}.0 + 0.5) / dims).r - ${LP}.0, 0.0);
            float u = (clamp(dd * ${RES}.0, 0.0, ${LN - 1}.0) + 0.5) / ${LN}.0;
            vec3 ramp = mix(texture(lut, vec2(u, 0.625)).rgb, texture(lut, vec2(u, 0.875)).rgb, night);
            vec3 wetC = mix(${vA(wet)}, ${vA(wetNight)}, night), shallowC = mix(${vA(shallow)}, ${vA(shallowNight)}, night);
            c = mix(wetC, mix(shallowC, ramp, smoothstep(2.0, 26.0, d)), smoothstep(0.0, 5.0, d)) * (1.0 + hn * 0.05 + fn * 0.015);
          }
        } else if (mode == 1) {                             // Cloud Meadow: the field itself (clouds are drawn above)
          c = bg;
        } else {                                            // Metro: rooftops, glass walls below them, cast shadows
          const float P = 52.0;
          vec3 tint = ${v3(0x0A1030)}, warm = ${v3(0xFFA94D)}, bulbC = ${v3(0xFFD27A)};
          float vs = vAt(pt - vec2(0.0, 22.0)), vsh = vAt(pt - vec2(28.0, 36.0));
          vec3 lc = warm; float la = 0.0;
          if (v < P) {
            float spill = smoothstep(P - 30.0, P - 3.0, v) * 0.42;
            if (v > P - 4.0) {
              bool bulb = v > P - 3.3 && v < P - 0.7 && fract((pt.x + pt.y) / 8.0) < 0.3;
              c = ${v3(0xE8E5DE)} * (1.0 + fn * 0.02); lc = bulb ? bulbC : warm; la = bulb ? 1.0 : 0.32;
            } else if (v > P - 5.5) { c = ${v3(0x8F8B85)}; la = spill + 0.06; }
            else {
              c = ${v3(0xC9C6BF)} * (1.0 + fn * 0.025);
              if (fract(pt.x / 26.0) < 0.045 || fract(pt.y / 26.0) < 0.045) c = ${v3(0xB8B4AC)};
              la = spill;
            }
            c = mix(mix(c, tint, 0.62 * night), lc, min(1.0, la) * night);
          } else if (vs < P) {
            vec2 w = fract(pt / vec2(7.0, 6.0));
            bool pane = w.x > 0.2 && w.x < 0.78 && w.y > 0.22 && w.y < 0.82;
            c = (pane ? ${v3(0x3B4757)} : ${v3(0x7C8695)}) * (1.0 - smoothstep(P - 22.0, P, vs) * 0.25);
            bool on = pane && hashF(int(floor(pt.x / 7.0)), int(floor(pt.y / 6.0)), 83) > 0.55;
            c = mix(c, tint, 0.62 * night);
            if (on) c = mix(c, bulbC, 0.7 * night);
          } else {
            c = bg * (vsh < P ? 0.6 : 1.0);
          }
        }
        o = vec4(c, 1.0);
      }`;
    const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); return gl.getShaderParameter(x, gl.COMPILE_STATUS) ? x : null; };
    const v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    const prog = gl.createProgram(); gl.attachShader(prog, v); gl.attachShader(prog, f); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const texs = [];
    const texture = (unit, name) => {
      gl.activeTexture(gl.TEXTURE0 + unit); const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); texs[unit] = t;
      for (const [k, val] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, val);
      gl.uniform1i(gl.getUniformLocation(prog, name), unit);
    };
    texture(1, "lut");
    const lutPx = new Uint8Array(LN * 4 * 4).fill(255);
    [lutDay, lutNight, rampDay, rampNight].forEach((rowC, r) => {
      for (let n = 0; n < LN; n++) for (let i = 0; i < 3; i++) lutPx[(r * LN + n) * 4 + i] = rowC[n * 3 + i];
    });
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, LN, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, lutPx);
    for (const [unit, name] of [[2, "bgDay"], [3, "bgNight"]]) {
      texture(unit, name);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    }
    texture(4, "depth");
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, cols, rows, 0, gl.RED, gl.FLOAT, new Float32Array(N));
    texture(0, "field");
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, cols, rows, 0, gl.RED, gl.FLOAT, new Float32Array(N));
    if (gl.getError() !== gl.NO_ERROR) return null;
    const uRes = gl.getUniformLocation(prog, "res"), uNight = gl.getUniformLocation(prog, "night"), uMode = gl.getUniformLocation(prog, "mode");
    return {
      gpu: true,
      resize(w, h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); gl.uniform2f(uRes, w, h); },
      background(day, nightImg) {
        for (const [unit, im] of [[2, day], [3, nightImg || day]]) {
          if (!im) continue;
          gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texs[unit]);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
        }
      },
      draw(f, nightAmt, mode) {
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texs[0]);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RED, gl.FLOAT, f);
        if (mode === 0) {
          gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, texs[4]);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RED, gl.FLOAT, auraDepth(f, AURA));
        }
        gl.uniform1f(uNight, nightAmt); gl.uniform1i(uMode, mode);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    };
  }

  function cpuGround(cv) {   // Lagoon only
    const ctx = cv.getContext("2d");
    let W = 0, H = 0, S = 1, img = null, wob, fg, hg;
    const lut = new Float32Array(LN * 3), ramp = new Float32Array(LN * 3), wetC = [0, 0, 0], shC = [0, 0, 0];
    return {
      gpu: false,
      resize(w) {
        S = Math.min(0.6, w / VW); W = Math.round(VW * S); H = Math.round(VH * S);
        cv.width = W; cv.height = H; img = ctx.createImageData(W, H);
        wob = new Float32Array(W * H); fg = new Float32Array(W * H); hg = new Float32Array(W * H);
        for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
          const x = px / S, y = py / S, k = py * W + px;
          wob[k] = valueNoise(x / 46, y / 46, 71) * 2.2 + valueNoise(x / 13, y / 13, 72) * 0.8;
          fg[k] = hashF(Math.round(x * 2), Math.round(y * 2), 5) * 2 - 1;
          hg[k] = fbm(x / 360, y / 360, 3, 61) * 1.35;
        }
      },
      background() {},
      draw(f, nightAmt) {
        for (let i = 0; i < lut.length; i++) { lut[i] = mix(lutDay[i], lutNight[i], nightAmt); ramp[i] = mix(rampDay[i], rampNight[i], nightAmt); }
        for (let i = 0; i < 3; i++) { wetC[i] = mix(wet[i], wetNight[i], nightAmt); shC[i] = mix(shallow[i], shallowNight[i], nightAmt); }
        const dep = auraDepth(f, AURA);
        const px = img.data, inv = 1 / (S * STEP);
        for (let py = 0; py < H; py++) {
          const gy = Math.min(rows - 1.001, py * inv), j = gy | 0, fy = gy - j;
          for (let qx = 0; qx < W; qx++) {
            const gx = Math.min(cols - 1.001, qx * inv), i = gx | 0, fx = gx - i, o = j * cols + i;
            const top = f[o] + (f[o + 1] - f[o]) * fx, bot = f[o + cols] + (f[o + cols + 1] - f[o + cols]) * fx;
            const v = top + (bot - top) * fy, k = py * W + qx, q = k * 4;
            if (v < LP) {
              let n = (v - wob[k] * 2 - LO) * RES; const s = 1 + fg[k] * 0.035 + hg[k] * 0.03;
              n = (n < 0 ? 0 : n >= LN ? LN - 1 : n | 0) * 3;
              px[q] = lut[n] * s; px[q + 1] = lut[n + 1] * s; px[q + 2] = lut[n + 2] * s; px[q + 3] = 255;
              continue;
            }
            const dt = dep[o] + (dep[o + 1] - dep[o]) * fx, db = dep[o + cols] + (dep[o + cols + 1] - dep[o + cols]) * fx;
            let n = (dt + (db - dt) * fy - LP) * RES; n = (n < 0 ? 0 : n >= LN ? LN - 1 : n | 0) * 3;
            const d = v - LP, s = 1 + hg[k] * 0.05 + fg[k] * 0.015, s1 = sst(2, 26, d), s0 = sst(0, 5, d);
            for (let i = 0; i < 3; i++) px[q + i] = mix(wetC[i], mix(shC[i], ramp[n + i], s1), s0) * s;
            px[q + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
      }
    };
  }

  // (A canvas that tried WebGL can't fall back to 2D, so the fallback gets a fresh one.)
  let groundEl = groundCv;
  const ground = gpuGround(groundCv) || (() => { groundEl = groundCv.cloneNode(); groundCv.replaceWith(groundEl); return cpuGround(groundEl); })();
  if (!ground.gpu) root.querySelectorAll("[data-scene]:not([data-scene=lagoon])").forEach(b => b.hidden = true);

  function sizeCanvases() {
    // Sized for the full window even while it's the smaller lock screen, so unlocking stays sharp.
    const wrap = root.parentElement, cs = getComputedStyle(wrap);
    const cssW = Math.max(stage.clientWidth, wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) || 900, dpr = Math.min(devicePixelRatio || 1, 2);
    ground.resize(Math.round(cssW * dpr), Math.round(cssW * dpr * VH / VW));
    for (const c of [shadeCv, lifeCv, puffCv, skyCv, oldCv]) { c.width = Math.round(Math.min(VW * 1.5, cssW * dpr)); c.height = Math.round(c.width * VH / VW); }
  }

  // ---------- Artwork ----------
  const art = {};
  const loadImg = src => new Promise(res => { const im = new Image(); im.decoding = "async"; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  const names = ["shell0", "shell1", "lantern", "lantern-night", "floatLantern", "floatLantern-night", "campfire", "campfire-night", "solarPanel", "planter", "waterTank"];
  for (let k = 0; k < 6; k++) names.push(`palm${k}`);
  for (let k = 0; k < 3; k++) names.push(`roofUnit${k}`);
  for (let v = 0; v < 3; v++) { for (let f = 0; f < 3; f++) names.push(`swimmer${v}-${f}`); for (let f = 0; f < 2; f++) names.push(`kayak${v}-${f}`); }
  const loadArt = () => Promise.all(names.map(n => loadImg(`sprites/${n}.png`).then(im => { art[n] = im; })));
  // Each scene's moving life, fetched the first time the scene is shown (or preloaded once the page settles).
  const SCENE_ART = {
    lagoon: ["gull-0", "gull-1", "gull-shadow-0", "gull-shadow-1", "cloudShadow"],
    meadow: ["kiteKid-0", "kiteKid-1", "kiteKid-kite", "cat-0", "cat-1", "drift0", "drift1", "drift2", "drift0-shadow", "drift1-shadow",
             "drift2-shadow", "butterfly0", "butterfly1", "butterfly2", "firefly", "songbird-0", "songbird-1", "songbird-shadow-0", "songbird-shadow-1"],
    metro: ["headlights", "crow-0", "crow-1", "crow-shadow-0", "crow-shadow-1", "cloudShadow"]
  };
  for (let k = 0; k < 7; k++) SCENE_ART.metro.push(`car${k}`);
  const sceneArt = {};
  const loadSceneArt = id => sceneArt[id] || (sceneArt[id] = Promise.all(SCENE_ART[id].map(n => art[n] ? 0 : loadImg(`sprites/${n}.png`).then(im => { art[n] = im; }))));
  // Cloud Meadow's night multiplies everything below its lights by the moon colour (the ground image has it
  // already); moving things get a moonlit copy of their sprite, faded in with the night.
  const moonlit = {};
  function moonlitArt(name) {
    if (moonlit[name]) return moonlit[name];
    const im = art[name]; if (!im) return null;
    const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const x = c.getContext("2d");
    x.drawImage(im, 0, 0); x.globalCompositeOperation = "multiply"; x.fillStyle = "#8597d0"; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = "destination-in"; x.drawImage(im, 0, 0);
    return moonlit[name] = c;
  }
  function drawLit(ctx, name, x, y, w, h) {
    const im = art[name]; if (!im) return;
    ctx.drawImage(im, x, y, w, h);
    if (sc.moonLit && nightAmt > 0.005) {
      const a = ctx.globalAlpha; ctx.globalAlpha = a * nightAmt; ctx.drawImage(moonlitArt(name), x, y, w, h); ctx.globalAlpha = a;
    }
  }
  // A cloud's cast shadow takes the night look's colour (graded, then moonlit) like the clouds under the icons.
  let shadowNight = null;
  function drawShadow(ctx, name, x, y, w, h) {
    const im = art[name]; if (!im) return;
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * (1 - nightAmt); ctx.drawImage(im, x, y, w, h);
    if (nightAmt <= 0.005) { ctx.globalAlpha = a; return; }
    shadowNight = shadowNight || {};
    if (!shadowNight[name]) {
      const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
      const g = c.getContext("2d"), col = grade(hex(0x2B561E), 0.55, 0.8).map((v, i) => Math.round(v * [133, 151, 208][i] / 255));
      g.drawImage(im, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = `rgb(${col})`; g.fillRect(0, 0, c.width, c.height);
      shadowNight[name] = c;
    }
    ctx.globalAlpha = a * nightAmt; ctx.drawImage(shadowNight[name], x, y, w, h); ctx.globalAlpha = a;
  }
  const bgs = {};
  const loadBg = (id, night) => {
    const key = id + (night ? "-night" : "");
    return bgs[key] || (bgs[key] = loadImg(`sprites/${key}-bg.jpg`));
  };

  // ---------- Props: one candidate per cell, decided by the field like the app ----------
  function makeCells(s) {
    const out = [], sp = s.cell;
    for (let cj = 0; cj <= VH / sp; cj++) for (let ci = 0; ci <= VW / sp; ci++) {
      const r = k => hashF(ci * 7 + k, cj * 13 - k, 404 + k);
      out.push({ x: s.jitter ? ci * sp + r(1) * sp : ci * sp + sp / 2, y: s.jitter ? cj * sp + r(2) * sp : cj * sp + sp / 2,
                 a: r(3), b: r(4), kind: Math.floor(r(5) * 6), alpha: 0, shown: null });
    }
    return out;
  }
  const cellsFor = {};
  function propKind(c, v) {
    if (sceneId === "lagoon") {
      const P = 62;
      if (v > P - 24 && v < P - 5 && c.a < 0.05) return "palm";
      if (v > 6 && v < P - 5 && c.b < 0.02) return "shell";
      if (nightAmt > 0.02 && v < P - 8 && v > P - 22 && c.b > 0.94) return "lantern";
      if (nightAmt > 0.02 && v > P + 50 && c.b > 0.997) return "floatLantern";
      return null;
    }
    if (sceneId === "metro") {
      const P = 52;
      if (v < 6) return null;
      // Each kind keeps clear of the parapet by its own reach, as in the app.
      const k = c.a < 0.22 ? "solarPanel" : c.a < 0.376 ? "roofUnit" : c.a < 0.451 ? "planter" : c.a < 0.495 ? "waterTank" : null;
      const reach = { solarPanel: 10, roofUnit: 10, planter: 11, waterTank: 13 }[k];
      return k && v <= P - 7 - reach ? k : null;
    }
    return null;
  }

  // ---------- Cloud Meadow's puffs (makePuffs / drawPuffs in Props.swift) ----------
  const PUFF = { thr: 36, r0: 24, r1: 38, sp: 24, body: [hex(0xDCE6F1), hex(0xE0E9F3)], hi: hex(0xF3F7FB), hiA: 0.35,
                 shade: 0.95, off: [70, 95], shA: 0.32, shC: "#2B561E" };
  const puffCells = [];
  for (let cj = -2; cj < VH / PUFF.sp + 3; cj++) for (let ci = -2; ci < VW / PUFF.sp + 3; ci++) {
    const r = k => hashF(ci * 7 + 3 + k, cj * 13 + 5 - k, 23 + 404 + k);
    puffCells.push({ x: (ci + r(1)) * PUFF.sp, y: (cj + r(2)) * PUFF.sp, r: mix(PUFF.r0, PUFF.r1, r(3)), color: r(4) < 0.5 ? 0 : 1,
                     seed: r(6), k: 0, k0: 0, k1: 0 });
  }
  puffCells.sort((a, b) => a.y - b.y);
  // Each puff's shading is drawn once per colour (and again as night falls) and stamped at its size; the cast
  // shadow and the white rims are one shape each, so overlapping puffs don't darken or double up.
  const PR = 40, PPX = 1.6, PS = Math.ceil(PR * 2.4 * PPX);
  const puffArt = [document.createElement("canvas"), document.createElement("canvas")];
  let puffArtNight = -1;
  const moonC3 = [133, 151, 208];
  const atNight = c => {   // the ground's night look: MoonGrade(exposure 0.8), then the moonlight multiply
    const g = grade(c, 0.55, 0.8).map((x, i) => x * moonC3[i] / 255);
    return c.map((x, i) => mix(x, g[i], nightAmt));
  };
  // Clouds only take the moonlight multiply, so the ones under the icons match the drifting ones above them.
  const cloudNight = c => c.map((x, i) => mix(x, x * moonC3[i] / 255, nightAmt));
  const rgba = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
  const circle = (c, x, y, r) => { c.beginPath(); c.arc(x, y, Math.max(0, r), 0, Math.PI * 2); c.fill(); };
  function makePuffArt() {
    const q = Math.round(nightAmt * 40);
    if (q === puffArtNight) return;
    puffArtNight = q;
    const R = PR, o = R / 31, k = 0.87;   // the app's small fixed offsets are for a ~31-pt puff
    puffArt.forEach((cv, i) => {
      cv.width = cv.height = PS;
      const c = cv.getContext("2d"), b = PUFF.body[i];
      c.setTransform(PPX, 0, 0, PPX, PS / 2, PS / 2);
      c.save(); c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.clip();
      c.fillStyle = rgba(cloudNight(b.map(x => x * PUFF.shade * 0.86)), 0.17); circle(c, R * 0.1, R * 0.22, R * k * 1.04);
      c.restore();
      c.fillStyle = rgba(cloudNight(b.map(x => x * PUFF.shade))); circle(c, 1.2 * o, 2.2 * o, R * k);
      c.fillStyle = rgba(cloudNight(b)); circle(c, -0.6 * o, -0.8 * o, R * 0.8);
      c.fillStyle = rgba(cloudNight(b.map((x, j) => mix(x, PUFF.hi[j], 0.5))), PUFF.hiA * 0.35); circle(c, -R * 0.16, -R * 0.22, R * 0.62);
      c.fillStyle = rgba(cloudNight(PUFF.hi), PUFF.hiA); circle(c, -R * 0.26, -R * 0.32, R * 0.36);
    });
  }
  // Which puffs make up the clouds: those far enough inside the icons' clearing. During a move each puff that
  // comes or goes swells or deflates on its own little schedule, the way the app animates them.
  const inCloud = (f, p) => sampleV(f, p.x, p.y) < PUFF.thr - p.r * 0.45;
  function settlePuffs(f) { for (const p of puffCells) p.k = p.k0 = p.k1 = inCloud(f, p) ? 1 : 0; }
  function aimPuffs(f) { for (const p of puffCells) { p.k0 = p.k; p.k1 = inCloud(f, p) ? 1 : 0; } }
  function stepPuffs(t) {
    for (const p of puffCells) if (p.k0 !== p.k1) {
      const u = Math.max(0, Math.min(1, (t - p.seed * 0.35) / 0.6));
      p.k = mix(p.k0, p.k1, u * u * (3 - 2 * u));
    }
  }
  const live = [];
  function drawPuffs() {
    const ctx = puffCv.getContext("2d"), sh = shadeCv.getContext("2d"), L = puffCv.width / VW;
    for (const c of [ctx, sh]) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, puffCv.width, puffCv.height); }
    if (sceneId !== "meadow") return;
    live.length = 0;
    for (const p of puffCells) if (p.k * p.r > 0.6) live.push({ x: p.x, y: p.y, r: p.r * p.k, color: p.color });
    if (!live.length) return;
    makePuffArt();
    const union = (c, dx, dy, s) => { c.beginPath(); for (const p of live) { c.moveTo(p.x + dx + p.r * s, p.y + dy); c.arc(p.x + dx, p.y + dy, p.r * s, 0, Math.PI * 2); } c.fill(); };
    // The cast shadow falls on the ground (under the drifting clouds, like the app), the clouds sit above.
    sh.setTransform(L, 0, 0, L, 0, 0);
    sh.globalAlpha = PUFF.shA; sh.fillStyle = rgba(atNight(hex(0x2B561E))); union(sh, PUFF.off[0], PUFF.off[1], 1.02); sh.globalAlpha = 1;
    ctx.setTransform(L, 0, 0, L, 0, 0);
    ctx.fillStyle = rgba(cloudNight([255, 255, 255])); union(ctx, 0, 0, 1);
    for (const p of live) ctx.drawImage(puffArt[p.color], p.x - p.r * 1.2, p.y - p.r * 1.2, p.r * 2.4, p.r * 2.4);
  }

  // ---------- Icons and selection ----------
  const DOCS = [["Projects", "folder"], ["Photos", "folder"], ["Notes.txt", "text"], ["Budget.xlsx", "sheet"],
    ["Trip", "folder"], ["Résumé.pdf", "pdf"], ["Music", "folder"], ["Ideas.md", "text"], ["Logo.png", "image"],
    ["Clip.mov", "movie"], ["Recipes", "folder"], ["Draft.pdf", "pdf"]];
  const START = [[0, 0], [1, 0], [0, 1], [1, 1], [12, 2], [12, 3], [6, 6]];
  const iconLayer = root.querySelector(".demo-icons");
  let icons = [];                                   // {el, col, row, name, sel}
  // Icons start just under the menu bar. On a phone the bar keeps a readable height while the screen shrinks,
  // so it covers more of the virtual screen: start the grid below it there (laptop widths keep the usual 40).
  const OY = (() => {
    const wrap = root.parentElement, cs = getComputedStyle(wrap);
    const w = Math.max(stage.clientWidth, wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) || 900;
    return Math.max(40, Math.ceil(root.querySelector(".demo-bar").offsetHeight * VW / w) + 4);
  })();
  const rect = ic => ({ x: OX + ic.col * GX, y: OY + ic.row * GY, w: IW, h: IH });
  const maxCol = Math.floor((VW - OX - IW) / GX), maxRow = Math.floor((VH - OY - IH) / GY);
  const placeEl = (ic, x, y) => { ic.el.style.left = (x / VW * 100) + "%"; ic.el.style.top = (y / VH * 100) + "%"; };
  const selected = () => icons.filter(ic => ic.sel);
  function select(list) { for (const ic of icons) { ic.sel = list.includes(ic); ic.el.classList.toggle("sel", ic.sel); ic.el.setAttribute("aria-pressed", ic.sel); } }
  function makeIcon(name, kind, col, row) {
    const el = document.createElement("button");
    el.className = "dicon"; el.type = "button";
    el.innerHTML = `<span class="glyph g-${kind}"></span><span class="label">${name}</span>`;
    el.setAttribute("aria-label", `${name}. Drag, or use the arrow keys, to move it. Shift-click to select several.`);
    const ic = { el, col, row, name, sel: false };
    placeEl(ic, OX + col * GX, OY + row * GY);
    iconLayer.appendChild(el);
    bindIcon(ic);
    return ic;
  }
  function nearestFree(c, r, blocked) {
    let best = null, bd = 1e9;
    for (let rr = 0; rr <= maxRow; rr++) for (let cc = 0; cc <= maxCol; cc++) {
      if (blocked.has(cc + "," + rr)) continue;
      const d = (cc - c) ** 2 + (rr - r) ** 2;
      if (d < bd) { bd = d; best = [cc, rr]; }
    }
    return best;
  }

  /// Moves several icons at once (wanted slots in order of priority), then plays the move.
  function moveIcons(wants) {
    const moving = new Set(wants.map(w => w[0]));
    const blocked = new Set(icons.filter(ic => !moving.has(ic)).map(ic => ic.col + "," + ic.row));
    const keptR = icons.filter(ic => !moving.has(ic)).map(rect), leftR = [], arrivedR = [];
    for (const [ic, c, r] of wants) {
      const [fc, fr] = nearestFree(c, r, blocked) || [ic.col, ic.row];
      blocked.add(fc + "," + fr);
      if (fc !== ic.col || fr !== ic.row) { leftR.push(rect(ic)); ic.col = fc; ic.row = fr; arrivedR.push(rect(ic)); }
      else keptR.push(rect(ic));
      placeEl(ic, OX + ic.col * GX, OY + ic.row * GY);
    }
    if (arrivedR.length) { startMorph(keptR, leftR, arrivedR); hideHint(); if (++moves === 1) setTimeout(showMenuHint, 1400); }
  }

  // ---------- Scene state ----------
  // In dark mode the demo starts at night (and follows the system until someone picks Day or Night).
  const darkMode = matchMedia("(prefers-color-scheme: dark)");
  let lightPicked = false;
  let cur = null, morph = null, night = darkMode.matches, nightAmt = night ? 1 : 0, switching = null;
  const showLight = () => {
    root.querySelectorAll("[data-light]").forEach(x => x.classList.toggle("on", (x.dataset.light === "night") === night));
    const tip = root.querySelector(".menu-hint");   // suggests whichever light isn't showing
    if (tip) tip.textContent = "Switch scenes or try " + (night ? "day" : "night");
  };
  showLight();
  darkMode.addEventListener("change", () => { if (!lightPicked) { night = darkMode.matches; showLight(); wake(); } });
  const work = new Float32Array(N);
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const morphT = () => morph && morph.t0 ? Math.max(0, Math.min(1, (performance.now() - morph.t0) / morph.dur)) : 0;
  // A move's fields are worked out a few rows at a time over its first frames (the morph starts on the old
  // ground anyway), so the page never stalls; the move itself starts the moment they're ready.
  function startMorph(keptR, leftR, arrivedR) {
    const a = morph ? (morph.t0 ? morphField(morph, ease(morphT()), new Float32Array(N)) : morph.a) : cur;
    const k = sc.blend, s = sc, jobs = [];
    const raws = { kept: empty(), b: null, left: empty(), arrived: empty() };
    const rowsOf = (icons, key) => {
      if (!icons.length) return;
      const boxes = boxesOf(icons, s);
      for (let j = 0; j < rows; j += 20) jobs.push(() => rawRows(boxes, raws[key], j, Math.min(rows, j + 20), k));
    };
    rowsOf(keptR, "kept");
    jobs.push(() => { raws.b = raws.kept.slice(); });
    rowsOf(arrivedR, "b"); rowsOf(leftR, "left"); rowsOf(arrivedR, "arrived");
    const done = {};
    for (const key of ["b", "kept", "left", "arrived"]) jobs.push(() => {
      done[key] = (key === "b" || (key === "kept" ? keptR : key === "left" ? leftR : arrivedR).length) ? warped(raws[key], s) : raws[key];
    });
    morph = { a, jobs, done, t0: 0, dur: reduceMotion ? 1 : sc.moveTime || 1250 };
    wake();
  }
  function prepareMorph() {
    const until = performance.now() + 6;
    while (morph.jobs.length && performance.now() < until) morph.jobs.shift()();
    if (morph.jobs.length) return;
    // Like the app, the ground waits a beat so trees on a leaving island start to go just before it shrinks.
    Object.assign(morph, morph.done, { t0: performance.now() + (reduceMotion ? 0 : 150) });
    cur = morph.b;
    aimPuffs(cur);
    retireLife(cur);
  }

  // ---------- Swimmers and kayaks (Lagoon) ----------
  let meta = null, walkers = [];
  function spawnWalkers(f) {
    walkers = [];
    if (sceneId !== "lagoon" || !meta) return;
    for (const [kind, n, minV] of [["swimmer", 6, 92], ["kayak", 2, 122]]) for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 200; tries++) {
        const x = 40 + Math.random() * (VW - 80), y = 60 + Math.random() * (VH - 120);
        if (sampleV(f, x, y) > minV + 20 && !walkers.some(w => Math.hypot(w.x - x, w.y - y) < 90)) {
          walkers.push({ kind, v: k % 3, m: meta[kind][k % 3], x, y, minV, dir: Math.random() * Math.PI * 2, phase: Math.random() * 3, alpha: 0 });
          break;
        }
      }
    }
  }
  function stepWalkers(f, dt) {
    for (const w of walkers) {
      const sp = w.m.speed * (w.kind === "swimmer" ? 1.6 : 1);
      const ahead = sampleV(f, w.x + Math.cos(w.dir) * 40, w.y + Math.sin(w.dir) * 40);
      const nx = w.x + Math.cos(w.dir) * sp * dt, ny = w.y + Math.sin(w.dir) * sp * dt;
      if (ahead < w.minV || nx < 30 || ny < 40 || nx > VW - 30 || ny > VH - 30) w.dir += (0.9 + Math.random()) * dt * 2.2;
      else { w.x = nx; w.y = ny; w.dir += (Math.random() - 0.5) * 0.15 * dt; }
      const target = sampleV(f, w.x, w.y) > w.minV - 10 ? 1 : 0;
      w.alpha += (target - w.alpha) * Math.min(1, dt * 2.5);
      if (w.alpha < 0.02 && target === 0) {          // land rose under it: swim off somewhere else
        for (let tries = 0; tries < 60; tries++) {
          const x = 40 + Math.random() * (VW - 80), y = 60 + Math.random() * (VH - 120);
          if (sampleV(f, x, y) > w.minV + 20) { w.x = x; w.y = y; break; }
        }
      }
      w.phase += dt;
    }
  }

  // ---------- The rest of the life (SceneController's rebuildAmbient / rebuildActors / launchFlock) ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  let lifeT = 0, clouds = [], drifts = [], paths = [], cars = [], flocks = [], bugs = [], nextFlock = 0, bugDebt = 0;

  // Walkers that wander a path (Renderer.wanderPaths): out and back along a smoothed random walk in the open.
  function wanderPath(spec, f, avoid) {
    const taken = avoid.slice();
    const free = (x, y) => !taken.some(q => Math.hypot(q[0] - x, q[1] - y) < 54);
    const ok = (x, y) => x > 16 && y > 16 && x < VW - 16 && y < VH - 16 && sampleV(f, x, y) > spec.minV;
    const open = (x, y, r) => {
      if (!ok(x, y)) return false;
      for (let k = 0; k < 8; k++) if (!ok(x + Math.cos(k * Math.PI / 4) * r, y + Math.sin(k * Math.PI / 4) * r)) return false;
      return true;
    };
    for (let att = 0; att < 500; att++) {
      let x = rand(40, VW - 40), y = rand(40, VH - 40);
      if (!open(x, y, spec.clearance) || !free(x, y)) continue;
      const pts = [[x, y]];
      let hd = rand(0, Math.PI * 2);
      for (let s = 0; s < 16; s++) {
        let moved = false;
        for (let t = 0; t < 10; t++) {
          const h = hd + (t === 0 ? rand(-0.5, 0.5) : rand(-2.4, 2.4));
          const nx = x + Math.cos(h) * spec.step, ny = y + Math.sin(h) * spec.step;
          if (open(nx, ny, spec.clearance * 0.9) && open((x + nx) / 2, (y + ny) / 2, spec.clearance * 0.8) && free(nx, ny) && free((x + nx) / 2, (y + ny) / 2)) {
            x = nx; y = ny; hd = h; moved = true; break;
          }
        }
        if (!moved) break;
        pts.push([x, y]);
      }
      if (pts.length < 5) continue;
      const loop = pts.concat(pts.slice(0, -1).reverse());
      const out = [loop[0]];                    // smoothPath: quadratic curves through the midpoints, sampled
      for (let i = 1; i < loop.length; i++) {
        const p0 = out[out.length - 1], c = loop[i - 1], m = [(loop[i - 1][0] + loop[i][0]) / 2, (loop[i - 1][1] + loop[i][1]) / 2];
        for (let s = 1; s <= 8; s++) { const t = s / 8, u = 1 - t; out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * m[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * m[1]]); }
      }
      out.push(loop[loop.length - 1]);
      const len = [0];
      for (let i = 1; i < out.length; i++) len.push(len[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
      return { pts: out, len, total: Math.max(1, len[len.length - 1]), raw: pts };
    }
    return null;
  }
  const pathMin = (p, f) => { let m = 1e9; for (let i = 0; i < p.pts.length; i += 2) m = Math.min(m, sampleV(f, p.pts[i][0], p.pts[i][1])); return m; };
  function planWalkers(f, fresh) {
    for (const spec of sc.walkers || []) {
      if (paths.some(w => w.spec === spec && w.target === 1)) continue;
      const avoid = paths.filter(w => w.target === 1).flatMap(w => w.path.raw);
      const path = wanderPath(spec, f, avoid);
      if (path) paths.push({ spec, m: meta[spec.kind], path, d: rand(0, path.total), i: 0, alpha: fresh ? 1 : 0, target: 1, phase: rand(0, 3) });
    }
  }

  // Cars (Renderer.carRoutes): straight runs along the lanes of open road, up to 14 at a time.
  function carRoutes(f) {
    const P = 52, W = 16, roadAt = (x, y) => (x % 150 < W || y % 120 < W) && sampleV(f, x, y) >= P && sampleV(f, x, y - 22) >= P;
    const spans = (fixed, horiz) => {
      const out = [], limit = horiz ? VW : VH;
      let start = null;
      for (let t = 0; t <= limit; t += 4) {
        if (horiz ? roadAt(t, fixed) : roadAt(fixed, t)) { if (start === null) start = t; }
        else if (start !== null) { if (t - start > 140) out.push([start, t]); start = null; }
      }
      if (start !== null && limit - start > 140) out.push([start, limit]);
      return out;
    };
    const routes = [];
    for (let y = 0; y < VH; y += 120) for (const [lane, fwd] of [[W * 0.27, false], [W * 0.73, true]])
      for (const [a, b] of spans(y + lane, true)) { const p = [a + 4, y + lane], q = [b - 4, y + lane]; routes.push(fwd ? [p, q] : [q, p]); }
    for (let x = 0; x < VW; x += 150) for (const [lane, fwd] of [[W * 0.27, true], [W * 0.73, false]])
      for (const [a, b] of spans(x + lane, false)) { const p = [x + lane, a + 4], q = [x + lane, b - 4]; routes.push(fwd ? [p, q] : [q, p]); }
    let seed = 182;
    const rnd = () => { seed = (imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
    for (let i = routes.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [routes[i], routes[j]] = [routes[j], routes[i]]; }
    return routes.slice(0, 14);
  }
  const routeKey = r => r.flat().map(Math.round).join(",");
  function planCars(f, fresh) {
    const have = new Set(cars.filter(c => c.target === 1).map(c => c.key));
    for (const r of carRoutes(f)) {
      const key = routeKey(r);
      if (have.has(key)) continue;
      const len = Math.hypot(r[1][0] - r[0][0], r[1][1] - r[0][1]);
      cars.push({ r, key, color: Math.floor(rand(0, 7)), dur: len / 38, u: Math.random(), alpha: fresh ? 1 : 0, target: 1 });
    }
  }

  // When icons start to move, whatever stands where land or a tower is about to rise heads off; newcomers
  // arrive once the move has settled.
  function retireLife(f) {
    for (const w of paths) if (w.target === 1 && pathMin(w.path, f) <= w.spec.minV) w.target = 0;
    if (sc.cars) { const ok = new Set(carRoutes(f).map(routeKey)); for (const c of cars) if (!ok.has(c.key)) c.target = 0; }
  }
  function settleLife(f) { planWalkers(f, false); if (sc.cars) planCars(f, false); }

  function newBug(kind, age) {
    const b = { kind, x: rand(0, VW), y: rand(0, VH), dir: rand(0, Math.PI * 2), age, rot: 0, out: 1 };
    if (kind === "b") Object.assign(b, { img: `butterfly${Math.floor(rand(0, 3))}`, v: 14 + rand(-8, 8), spin: rand(-0.6, 0.6), life: 16, a0: 1, fade: 0.04, size: 0.75 });
    else Object.assign(b, { img: "firefly", v: Math.max(0, 7 + rand(-5, 5)), spin: 0, life: 5 + rand(-2, 2), a0: Math.min(1, 1 + rand(-0.4, 0.4)), fade: 0.18, size: 0.45 + rand(-0.2, 0.2) });
    return b;
  }

  function initLife(f) {
    lifeT = 0; clouds = []; drifts = []; paths = []; cars = []; flocks = []; bugs = []; bugDebt = 0;
    nextFlock = rand(4, 12);
    if (sc.clouds) for (let i = 0; i < 3; i++) {
      const w = rand(700, 1100), dur = (VW + w) / rand(5, 8);
      clouds.push({ w, h: w * 0.58, y: VH * rand(0.1, 0.9), dur, off: dur * i / 3 + rand(0, 30) });
    }
    if (sc.drift) meta.drift.forEach((d, i) => {
      const dur = (VW + d.w * 1.5) / rand(3.5, 5.5);
      drifts.push({ i, w: d.w, h: d.h, y: VH * rand(0.15, 0.85), dur, off: dur * (i / 3 + 0.12) });
    });
    planWalkers(f, true);
    if (sc.cars) planCars(f, true);
    if (sc.flutter && nightAmt < 0.5) for (let i = 0; i < 34; i++) bugs.push(newBug("b", rand(0, 16)));
  }

  const turn = (from, to) => { const d = (to - from) % (2 * Math.PI); return d > Math.PI ? d - 2 * Math.PI : d < -Math.PI ? d + 2 * Math.PI : d; };
  function stepLife(f, dt) {
    lifeT += dt;
    for (const w of paths) {
      w.alpha = Math.max(0, Math.min(1, w.alpha + (w.target ? dt : -dt) / 0.8));
      w.d += w.m.speed * dt; w.phase += dt;
      if (w.d >= w.path.total) { w.d %= w.path.total; w.i = 0; }
      while (w.i < w.path.len.length - 2 && w.path.len[w.i + 1] < w.d) w.i++;
      // Heading: turn smoothly along the curve instead of snapping at every sampled point
      // (the kite hangs far out from the kid's hand, so any snap shows up there as a jolt).
      const p = w.path, i = w.i, a = p.pts[i], b = p.pts[i + 1] || a, c = p.pts[i + 2];
      const h1 = Math.atan2(b[1] - a[1], b[0] - a[0]), h2 = c && (c[0] !== b[0] || c[1] !== b[1]) ? Math.atan2(c[1] - b[1], c[0] - b[0]) : h1;
      const seg = (p.len[i + 1] || 0) - p.len[i] || 1, target = h1 + turn(h1, h2) * Math.min(1, Math.max(0, (w.d - p.len[i]) / seg));
      w.hd = w.hd === undefined ? target : w.hd + turn(w.hd, target) * Math.min(1, dt * 3);
    }
    paths = paths.filter(w => w.target || w.alpha > 0);
    for (const c of cars) { c.u = (c.u + dt / c.dur) % 1; c.alpha = Math.max(0, Math.min(1, c.alpha + (c.target ? dt / 0.8 : -dt / 0.5))); }
    cars = cars.filter(c => c.target || c.alpha > 0);
    // Birds pass over every so often, in daylight.
    if (sc.birds && !reduceMotion && lifeT > nextFlock) {
      nextFlock = lifeT + rand(25, 70);
      if (nightAmt < 0.55) {
        const angle = rand(0, Math.PI * 2), cx = VW * rand(0.25, 0.75), cy = VH * rand(0.25, 0.75), reach = Math.hypot(VW, VH) / 2 + 80;
        const birds = [];
        for (let i = 0, n = Math.floor(rand(2, 6)); i < n; i++) {
          const row = Math.floor((i + 1) / 2), side = i % 2 === 0 ? 1 : -1;
          birds.push({ x: -row * 14 + rand(-3, 3), y: side * row * 12 + rand(-3, 3), flap: rand(0.28, 0.4), off: rand(0, 0.4) });
        }
        flocks.push({ angle, x0: cx - Math.cos(angle) * reach, y0: cy - Math.sin(angle) * reach, x1: cx + Math.cos(angle) * reach,
                      y1: cy + Math.sin(angle) * reach, t: 0, dur: 2 * reach / rand(55, 80), birds, size: sc.birds === "gull" ? 20 : 16, style: sc.birds });
      }
    }
    for (const fl of flocks) fl.t += dt;
    flocks = flocks.filter(fl => fl.t < fl.dur);
    // Butterflies by day, fireflies after dark (the night look swaps them at half dark).
    if (sc.flutter && !reduceMotion) {
      const kind = nightAmt < 0.5 ? "b" : "f";
      bugDebt += dt * (kind === "b" ? 3 * VW * VH / 2e6 : VW * VH / 90000);
      while (bugDebt >= 1) { bugDebt -= 1; bugs.push(newBug(kind, 0)); }
      for (const b of bugs) {
        b.x += Math.cos(b.dir) * b.v * dt; b.y += Math.sin(b.dir) * b.v * dt; b.rot += b.spin * dt; b.age += dt;
        if (b.kind !== kind) b.out = Math.max(0, b.out - dt * 2);
      }
      bugs = bugs.filter(b => b.age < b.life && b.out > 0 && b.a0 - b.fade * b.age > 0);
    }
  }

  function drawMoving(ctx) {   // below the clouds under the icons: walkers, traffic, cloud shadows, drifting clouds
    for (const w of paths) {
      if (w.alpha <= 0) continue;
      const p = w.path, i = w.i, a = p.pts[i], b = p.pts[i + 1] || a, seg = (p.len[i + 1] || 0) - p.len[i] || 1, t = Math.min(1, (w.d - p.len[i]) / seg);
      const x = mix(a[0], b[0], t), y = mix(a[1], b[1], t), m = w.m, frame = Math.floor(w.phase / m.frameTime) % m.frames;
      ctx.save(); ctx.globalAlpha = w.alpha; ctx.translate(x, y); ctx.rotate(w.hd ?? Math.atan2(b[1] - a[1], b[0] - a[0])); ctx.scale(m.scale, m.scale);
      if (w.spec.kind === "kiteKid") {   // the kite on its string, swaying from the kid's hand
        const sway = mix(-0.14, 0.12, (1 - Math.cos(lifeT / 2.6 * Math.PI)) / 2);
        ctx.save(); ctx.translate(13 - m.w / 2, 5.2 - m.h / 2); ctx.rotate(-sway);
        drawLit(ctx, "kiteKid-kite", -96, -30, 100, 60); ctx.restore();
      }
      drawLit(ctx, `${w.spec.kind}-${frame}`, -m.w / 2, -m.h / 2, m.w, m.h);
      ctx.restore();
    }
    const lights = sst(0.3, 0.8, nightAmt);
    for (const c of cars) {
      const [p, q] = c.r, u = c.u, x = mix(p[0], q[0], u), y = mix(p[1], q[1], u);
      const a = c.alpha * (u < 0.04 ? u / 0.04 : u > 0.96 ? (1 - u) / 0.04 : 1);
      if (a <= 0) continue;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.rotate(Math.atan2(q[1] - p[1], q[0] - p[0]));
      const im = art[`car${c.color}`]; if (im) ctx.drawImage(im, -8, -4.5, 16, 9);
      if (lights > 0 && art.headlights) { ctx.globalAlpha = a * lights; ctx.drawImage(art.headlights, 6, -10, 40, 20); }
      ctx.restore();
    }
    for (const c of clouds) {
      if (!art.cloudShadow) break;
      const u = ((lifeT + c.off) / c.dur) % 1, x = -c.w / 2 + u * (VW + c.w);
      ctx.globalAlpha = sc.clouds; ctx.drawImage(art.cloudShadow, x - c.w / 2, c.y - c.h / 2, c.w, c.h);
    }
    ctx.globalAlpha = 1;
    for (const d of drifts) {
      const u = ((lifeT + d.off) / d.dur) % 1, from = -d.w / 2 - 40, to = VW + d.w / 2 + PUFF.off[0] + 40, x = mix(from, to, u) - d.w / 2, y = d.y - d.h / 2;
      ctx.globalAlpha = PUFF.shA; drawShadow(ctx, `drift${d.i}-shadow`, x + PUFF.off[0], y + PUFF.off[1], d.w, d.h);
      ctx.globalAlpha = 1; drawLit(ctx, `drift${d.i}`, x, y, d.w, d.h);
    }
  }

  const sctx = skyCv.getContext("2d");
  function drawSky() {   // above the night: passing birds and their shadows, butterflies, fireflies
    const L = skyCv.width / VW;
    sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.clearRect(0, 0, skyCv.width, skyCv.height);
    sctx.setTransform(L, 0, 0, L, 0, 0);
    for (const fl of flocks) {
      const u = fl.t / fl.dur, x = mix(fl.x0, fl.x1, u), y = mix(fl.y0, fl.y1, u), s = fl.size;
      for (const [dx, dy, kind] of [[26, 34, "-shadow"], [0, 0, ""]]) {
        sctx.save(); sctx.translate(x + dx, y + dy); sctx.rotate(fl.angle);
        for (const b of fl.birds) {
          const im = art[`${fl.style}${kind}-${Math.floor((fl.t + b.off) / fl.flap * 2) % 2}`];
          if (im) sctx.drawImage(im, b.x - s / 2, b.y - s / 2, s, s);
        }
        sctx.restore();
      }
    }
    const glow = 0.15 + nightAmt * 0.85;
    for (const b of bugs) {
      const im = art[b.img]; if (!im) continue;
      sctx.globalAlpha = Math.max(0, b.a0 - b.fade * b.age) * b.out * (b.kind === "f" ? glow : 1);
      if (b.kind === "b") { sctx.save(); sctx.translate(b.x, b.y); sctx.rotate(b.rot); sctx.drawImage(im, -3.75, -3, 7.5, 6); sctx.restore(); }
      else { const s = 16 * b.size; sctx.drawImage(im, b.x - s / 2, b.y - s / 2, s, s); }
    }
    sctx.globalAlpha = 1;
  }

  // Cloud Meadow's campfires: one spot in each part of the screen, lit wherever it's open meadow.
  const campfires = [];
  for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++)
    campfires.push({ x: 230 + i * 505 + (hashF(i, j, 61) - 0.5) * 200, y: 250 + j * 420 + (hashF(i, j, 62) - 0.5) * 160, alpha: 0 });

  // ---------- The live layer: walkers, props, night glows ----------
  const lctx = lifeCv.getContext("2d");
  function drawLife(f, dt) {
    const L = lifeCv.width / VW;
    lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, lifeCv.width, lifeCv.height);
    lctx.setTransform(L, 0, 0, L, 0, 0);
    for (const w of walkers) {
      if (w.alpha < 0.01) continue;
      const im = art[`${w.kind}${w.v}-${Math.floor(w.phase / w.m.frameTime) % w.m.frames}`]; if (!im) continue;
      const sw = w.m.w * w.m.scale, sh = w.m.h * w.m.scale;
      lctx.save(); lctx.globalAlpha = w.alpha; lctx.translate(w.x, w.y);
      if (w.m.rotates) lctx.rotate(w.dir);
      lctx.drawImage(im, -sw / 2, -sh / 2, sw, sh);
      lctx.restore();
    }
    const cells = cellsFor[sceneId] || [], k = Math.min(1, dt * 5), glows = [];
    if (sceneId === "meadow") for (const c of campfires) {   // after dark, a few campfires out in the open
      c.alpha += ((sampleV(f, c.x, c.y) > 90 ? 1 : 0) - c.alpha) * k;
      const a = c.alpha * nightAmt;
      if (a < 0.01 || !art.campfire || !art["campfire-night"]) continue;
      lctx.globalAlpha = a; lctx.drawImage(art.campfire, c.x - 64, c.y - 80, 128, 128);
      lctx.globalCompositeOperation = "lighter"; lctx.drawImage(art["campfire-night"], c.x - 64, c.y - 80, 128, 128);
      lctx.globalCompositeOperation = "source-over"; lctx.globalAlpha = 1;
    }
    if (sceneId !== "lagoon") drawMoving(lctx);   // the walkers, then the clouds drifting high over everything
    for (const c of cells) {
      // A prop that won't be there once a move lands leaves right away; arriving ones wait for the ground.
      const here = propKind(c, sampleV(f, c.x, c.y)), kind = morph && here && !propKind(c, sampleV(cur, c.x, c.y)) ? null : here;
      if (kind !== c.shown && c.alpha < 0.03) c.shown = kind;
      c.alpha += ((kind && kind === c.shown ? 1 : 0) - c.alpha) * k;
      if (!c.shown || c.alpha < 0.01) continue;
      const name = c.shown === "palm" ? `palm${c.kind}` : c.shown === "shell" ? `shell${c.kind & 1}` : c.shown === "roofUnit" ? `roofUnit${c.kind % 3}` : c.shown;
      const im = art[name]; if (!im) continue;
      const lamp = c.shown === "lantern" || c.shown === "floatLantern";
      const a = c.alpha * (lamp ? nightAmt : 1);
      lctx.globalAlpha = a;
      lctx.drawImage(im, c.x - 64, c.y - 80, 128, 128);
      if (lamp) glows.push([art[name + "-night"], c.x, c.y, a]);
    }
    lctx.globalAlpha = 1;
    if (sceneId === "lagoon") drawMoving(lctx);
    if (sc.tint && nightAmt > 0) {     // the city's night tint over its rooftops, traffic and cloud shadows
      lctx.globalCompositeOperation = "source-atop"; lctx.fillStyle = `rgba(10,16,48,${0.62 * nightAmt})`;
      lctx.fillRect(0, 0, VW, VH); lctx.globalCompositeOperation = "source-over";
    }
    if (glows.length) {
      lctx.globalCompositeOperation = "lighter";
      for (const [im, x, y, a] of glows) if (im) { lctx.globalAlpha = a; lctx.drawImage(im, x - 64, y - 80, 128, 128); }
      lctx.globalCompositeOperation = "source-over"; lctx.globalAlpha = 1;
    }
  }

  // ---------- Switching scenes: the new one grows out from the icons over the old one ----------
  const maskCv = document.createElement("canvas"); maskCv.width = cols; maskCv.height = rows;
  const snapCv = document.createElement("canvas");
  let pendingScene = null;
  async function setScene(id) {
    if (id === sceneId || !SCENES[id]) return;
    if (switching) { pendingScene = id; return; }
    const s = SCENES[id];
    root.querySelectorAll("[data-scene]").forEach(b => b.classList.toggle("on", b.dataset.scene === id));
    switching = { loading: true };
    const [day, nightImg] = await Promise.all([s.bg && loadBg(s.bg, false), s.bg && loadBg(s.bg, true), loadSceneArt(id)]);
    if (s.bg) ground.background(day, nightImg);
    // Freeze what's on screen now (the moon tint included), then build the new scene underneath.
    snapCv.width = oldCv.width; snapCv.height = oldCv.height;
    const sx = snapCv.getContext("2d");
    sx.drawImage(groundEl, 0, 0, snapCv.width, snapCv.height);
    if (sc.moon && nightAmt > 0) {
      sx.globalCompositeOperation = "multiply"; sx.globalAlpha = sc.moon * nightAmt; sx.fillStyle = "#8597d0";
      sx.fillRect(0, 0, snapCv.width, snapCv.height); sx.globalCompositeOperation = "source-over"; sx.globalAlpha = 1;
    }
    sx.drawImage(shadeCv, 0, 0, snapCv.width, snapCv.height);
    sx.drawImage(lifeCv, 0, 0, snapCv.width, snapCv.height);
    sx.drawImage(puffCv, 0, 0, snapCv.width, snapCv.height);
    sx.drawImage(skyCv, 0, 0, snapCv.width, snapCv.height);
    morph = null;
    sceneId = id; sc = s;
    root.dataset.scene = id;
    root.style.setProperty("--moon", s.moon);
    cur = field(icons.map(rect));
    settlePuffs(cur);
    if (!cellsFor[id] && s.cell) cellsFor[id] = makeCells(s);
    for (const c of cellsFor[id] || []) { c.alpha = 0; c.shown = null; }
    spawnWalkers(cur);
    initLife(cur);
    switching = { t0: performance.now(), dur: reduceMotion ? 1 : 1700, field: cur };
    oldCv.hidden = false;
    drawReveal();
    redrawAll = true;
    wake();
  }
  function drawReveal() {
    const t = Math.min(1, (performance.now() - switching.t0) / switching.dur);
    const R = -30 + 1500 * Math.pow(ease(t), 1.3);       // the front spreads out from the icons
    const m = maskCv.getContext("2d"), img = m.createImageData(cols, rows), f = switching.field, d = img.data;
    for (let i = 0; i < N; i++) d[i * 4 + 3] = 255 * (1 - sst(R - 70, R, f[i]));
    m.putImageData(img, 0, 0);
    const o = oldCv.getContext("2d"), sx = oldCv.width / VW;
    o.globalCompositeOperation = "source-over"; o.clearRect(0, 0, oldCv.width, oldCv.height);
    o.drawImage(snapCv, 0, 0);
    o.globalCompositeOperation = "destination-out"; o.imageSmoothingEnabled = true;
    o.drawImage(maskCv, -0.5 * STEP * sx, -0.5 * STEP * sx, cols * STEP * sx, rows * STEP * sx);
    o.globalCompositeOperation = "source-over";
    if (t >= 1) {
      switching = null; oldCv.hidden = true;
      if (pendingScene) { const p = pendingScene; pendingScene = null; setScene(p); }
    }
  }

  // ---------- Loop (sleeps when off-screen or the tab is hidden) ----------
  let visible = true, running = false, last = 0, redrawAll = false;
  function frame(now) {
    running = false;
    if (!visible || document.hidden) return;
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    let f = cur, groundDirty = redrawAll;
    if (morph && !morph.t0) prepareMorph();
    if (morph && !morph.t0) f = morph.a;
    else if (morph) {
      const t = morphT();
      f = morphField(morph, ease(t), work);
      stepPuffs(t);
      groundDirty = true;
      if (t >= 1) { morph = null; settlePuffs(cur); settleLife(cur); }
    }
    const goal = night ? 1 : 0, was = nightAmt;
    nightAmt += Math.sign(goal - nightAmt) * Math.min(Math.abs(goal - nightAmt), dt / 1.6);
    root.style.setProperty("--night", nightAmt.toFixed(3));
    if (nightAmt !== was) groundDirty = true;
    if (groundDirty) { ground.draw(f, nightAmt, sc.mode); drawPuffs(); redrawAll = false; }
    const live = locked ? 0 : dt;                     // the lock screen is a still snapshot
    if (!locked && (!reduceMotion || morph)) stepWalkers(f, dt);
    stepLife(f, reduceMotion ? 0 : live);
    drawLife(f, live);
    drawSky();
    if (switching && !switching.loading) drawReveal();
    if (locked && !morph && !switching && nightAmt === goal) return;   // nothing moves until it's unlocked
    wake();
  }
  function wake() { if (!running) { running = true; requestAnimationFrame(frame); } }
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) { last = 0; wake(); } }).observe(stage);
  document.addEventListener("visibilitychange", () => { last = 0; wake(); });

  // ---------- Pointer: drag icons (one or a selection), or drag across the desktop to select ----------
  const toPts = (e, b) => [(e.clientX - b.left) / b.width * VW, (e.clientY - b.top) / b.height * VH];
  // Double-clicking an icon (which would open it on a real Mac) gets a little reminder instead: Iconscape
  // only ever knows where icons sit.
  const peek = document.createElement("div");
  peek.className = "demo-peek"; peek.setAttribute("role", "status");
  peek.textContent = "Iconscape never looks inside 🔒";
  iconLayer.appendChild(peek);
  let peekTimer = 0;
  function showPeek(ic) {
    const x = OX + ic.col * GX, y = OY + ic.row * GY, right = x < VW * 0.3;
    peek.classList.toggle("right", right);
    peek.style.left = ((right ? x + IW : x) / VW * 100) + "%";
    peek.style.top = ((y + IH * 0.36) / VH * 100) + "%";
    peek.classList.remove("on"); void peek.offsetWidth; peek.classList.add("on");
    clearTimeout(peekTimer); peekTimer = setTimeout(hidePeek, 2400);
  }
  const hidePeek = () => peek.classList.remove("on");
  function bindIcon(ic) {
    ic.el.addEventListener("dblclick", () => showPeek(ic));
    ic.el.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      e.stopPropagation();
      hidePeek();
      if (e.shiftKey || e.metaKey || e.ctrlKey) { ic.sel = !ic.sel; select(icons.filter(x => x.sel)); return; }
      if (!ic.sel) select([ic]);
      const group = selected();
      ic.el.setPointerCapture(e.pointerId);
      const b = stage.getBoundingClientRect(), [sx, sy] = toPts(e, b);
      const origin = group.map(g => [g, OX + g.col * GX, OY + g.row * GY]);
      let moved = false;
      group.forEach(g => g.el.classList.add("dragging"));
      const mv = ev => {
        const [x, y] = toPts(ev, b), dx = x - sx, dy = y - sy;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        for (const [g, ox, oy] of origin) placeEl(g, Math.max(-IW / 2, Math.min(VW - IW / 2, ox + dx)), Math.max(0, Math.min(VH - IH / 2, oy + dy)));
      };
      const up = ev => {
        ic.el.removeEventListener("pointermove", mv); ic.el.removeEventListener("pointerup", up); ic.el.removeEventListener("pointercancel", up);
        group.forEach(g => g.el.classList.remove("dragging"));
        const [x, y] = toPts(ev, b), dx = x - sx, dy = y - sy;
        if (!moved) { for (const [g, ox, oy] of origin) placeEl(g, ox, oy); if (group.length > 1) select([ic]); return; }
        const wants = origin.map(([g, ox, oy]) => [g, Math.max(0, Math.min(maxCol, Math.round((ox + dx - OX) / GX))), Math.max(0, Math.min(maxRow, Math.round((oy + dy - OY) / GY)))]);
        wants.sort((p, q) => (p[0] === ic ? -1 : q[0] === ic ? 1 : 0));   // the icon under the pointer gets its spot first
        moveIcons(wants);
      };
      ic.el.addEventListener("pointermove", mv); ic.el.addEventListener("pointerup", up); ic.el.addEventListener("pointercancel", up);
    });
    ic.el.addEventListener("keydown", e => {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!d) return;
      e.preventDefault();
      const group = ic.sel ? selected() : [ic];
      if (group.some(g => g.col + d[0] < 0 || g.col + d[0] > maxCol || g.row + d[1] < 0 || g.row + d[1] > maxRow)) return;
      // Move the leading icons first, so a row of selected icons slides along instead of swapping.
      group.sort((p, q) => (q.col - p.col) * d[0] + (q.row - p.row) * d[1]);
      moveIcons(group.map(g => [g, g.col + d[0], g.row + d[1]]));
    });
  }
  const marquee = document.createElement("div"); marquee.className = "demo-marquee"; marquee.hidden = true; stage.appendChild(marquee);
  stage.addEventListener("pointerdown", e => {
    if (e.button !== 0 || locked || e.target.closest(".dicon, .demo-panel")) return;
    const b = stage.getBoundingClientRect(), [sx, sy] = toPts(e, b);
    const additive = e.shiftKey || e.metaKey || e.ctrlKey, base = additive ? selected() : [];
    stage.setPointerCapture(e.pointerId);
    let moved = false;
    const mv = ev => {
      const [x, y] = toPts(ev, b);
      if (Math.abs(x - sx) + Math.abs(y - sy) > 4) moved = true;
      if (!moved) return;
      const x0 = Math.min(sx, x), x1 = Math.max(sx, x), y0 = Math.min(sy, y), y1 = Math.max(sy, y);
      marquee.hidden = false;
      Object.assign(marquee.style, { left: x0 / VW * 100 + "%", top: y0 / VH * 100 + "%", width: (x1 - x0) / VW * 100 + "%", height: (y1 - y0) / VH * 100 + "%" });
      // Like Finder: an icon is picked up when the box touches its picture or its name.
      const hit = icons.filter(ic => { const r = rect(ic); return r.x + 14 < x1 && r.x + IW - 14 > x0 && r.y + 4 < y1 && r.y + IH - 8 > y0; });
      select([...new Set([...base, ...hit])]);
    };
    const up = () => {
      stage.removeEventListener("pointermove", mv); stage.removeEventListener("pointerup", up); stage.removeEventListener("pointercancel", up);
      marquee.hidden = true;
      if (!moved && !additive) select([]);
      else if (moved) hideHint();
    };
    stage.addEventListener("pointermove", mv); stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up);
  });

  // ---------- Menu-bar panel ----------
  const panel = root.querySelector(".demo-panel"), menuBtn = root.querySelector(".demo-menu-btn");
  const setPanel = open => { panel.hidden = !open; menuBtn.setAttribute("aria-expanded", open); if (open) { menuSeen = true; menuHint.classList.add("gone"); } };
  menuBtn.addEventListener("click", () => setPanel(panel.hidden));
  document.addEventListener("pointerdown", e => { if (!panel.hidden && !panel.contains(e.target) && !menuBtn.contains(e.target)) setPanel(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !panel.hidden) { setPanel(false); menuBtn.focus(); } });
  // Like a real menu, picking anything closes it (after the item's own handler has run).
  panel.addEventListener("click", e => {
    if (!e.target.closest("button")) return;
    const kb = e.detail === 0;   // keyboard activation: hand focus back to the menu-bar icon
    setPanel(false);
    if (kb) menuBtn.focus();
  });
  root.querySelectorAll("[data-scene]").forEach(b => b.addEventListener("click", () => setScene(b.dataset.scene)));
  root.querySelectorAll("[data-light]").forEach(b => b.addEventListener("click", () => {
    night = b.dataset.light === "night"; lightPicked = true;
    showLight();
    wake();
  }));
  root.querySelector("[data-act=add]").addEventListener("click", () => {
    const next = DOCS[icons.length % DOCS.length];
    const blocked = new Set(icons.map(ic => ic.col + "," + ic.row));
    const spot = nearestFree(Math.floor(Math.random() * (maxCol + 1)), Math.floor(Math.random() * (maxRow + 1)), blocked);
    if (!spot) return;
    const keptR = icons.map(rect);
    const ic = makeIcon(next[0], next[1], spot[0], spot[1]);
    icons.push(ic);
    ic.el.classList.add("arriving");
    startMorph(keptR, [], [rect(ic)]);
    hideHint();
  });
  root.querySelector("[data-act=tidy]").addEventListener("click", () => {
    const order = [...icons].sort((a, b) => a.col - b.col || a.row - b.row);
    moveIcons(order.map((ic, i) => [ic, Math.floor(i / (maxRow + 1)), i % (maxRow + 1)]));
  });

  const hint = root.querySelector(".demo-hint");
  function hideHint() { if (hint) hint.classList.add("gone"); }
  // After the first move, point at the menu-bar icon: scenes and night live there.
  const menuHint = root.querySelector(".menu-hint");
  let moves = 0, menuSeen = false;
  function placeMenuHint() {
    const s = stage.getBoundingClientRect(), b = menuBtn.getBoundingClientRect();
    menuHint.style.right = Math.max(6, s.right - (b.left + b.width / 2) - 17) + "px";
    menuHint.style.top = (root.querySelector(".demo-bar").getBoundingClientRect().bottom - s.top + 8) + "px";
  }
  function showMenuHint() {
    if (menuSeen || locked) return;
    placeMenuHint();
    menuHint.classList.remove("gone");
  }
  addEventListener("resize", () => { if (!menuHint.classList.contains("gone")) placeMenuHint(); });

  const clock = root.querySelector(".demo-clock"), lkClock = root.querySelector(".lk-clock"), lkDate = root.querySelector(".lk-date");
  const tick = () => {
    const now = new Date(), t = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (clock) clock.textContent = t;
    if (lkClock) lkClock.textContent = t.replace(/\s*[ap]\.?m\.?$/i, "");
    if (lkDate) lkDate.textContent = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  };
  tick(); setInterval(tick, 20000);

  // ---------- Lock screen ----------
  // The demo opens on the Mac's lock screen. Iconscape can set a still snapshot of the scene as the wallpaper,
  // so the lock screen shows the scene, frozen and without icons, at the same time of day. Unlocking grows the
  // window to full size, brings back the icons and the menu bar, wakes the scene, and the app's icon settles
  // into its place in the menu bar. Scrolling down onto the demo unlocks it too: the page glides it to the
  // middle of the window and holds it there while it unlocks, so one big flick doesn't carry right past it.
  let locked = root.classList.contains("locked"), lockedByHand = false;
  const lockEl = root.querySelector(".demo-lock"), lkUser = root.querySelector(".lk-user");
  const lkIcon = root.querySelector(".lk-avatar img"), barIcon = menuBtn.querySelector("img");
  iconLayer.inert = locked;
  const within = el => { const r = el.getBoundingClientRect(), o = root.getBoundingClientRect(); return [r.left - o.left, r.top - o.top, r.width]; };
  function unlock() {
    if (!locked) return;
    locked = false; last = 0; wake();
    iconLayer.inert = false;
    lockEl.inert = true;
    removeEventListener("scroll", onScroll);
    if (!holding) setTimeout(stopHolding, 0);
    root.classList.remove("locked");
    if (reduceMotion) return;
    // The icon flies from the lock screen into the menu bar while the window grows, following both live.
    const ghost = lkIcon.cloneNode(); ghost.className = "lk-ghost"; root.appendChild(ghost);
    root.classList.add("flying");
    const t0 = performance.now() + 250, dur = 950;
    const step = now => {
      const p = Math.max(0, Math.min(1, (now - t0) / dur)), e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const [ax, ay, aw] = within(lkIcon), [bx, by, bw] = within(barIcon);
      const arc = Math.sin(Math.PI * e) * aw * 0.6;      // a gentle lift on the way, rather than a straight line
      ghost.style.width = ghost.style.height = (aw + (bw - aw) * e) + "px";
      ghost.style.transform = `translate(${ax + (bx - ax) * e}px, ${ay + (by - ay) * e - arc}px)`;
      if (p < 1) requestAnimationFrame(step);
      else { ghost.remove(); root.classList.remove("flying"); }
    };
    requestAnimationFrame(step);
  }
  function lock() {
    setPanel(false); select([]); hidePeek();
    locked = true; lockedByHand = true;
    iconLayer.inert = true; lockEl.inert = false;
    root.classList.add("locked");
    wake();
  }
  // Clicking the lock screen centres the demo as it opens, as scrolling onto it does.
  lockEl.addEventListener("click", () => { if (locked && !reduceMotion) holdOnDemo(); unlock(); });
  root.querySelector("[data-act=lock]").addEventListener("click", lock);
  // While it holds, wheel, touch and key scrolling are soaked up. The listeners are in place (not passive) from
  // the start, because a scroll gesture already under way can only be stopped if they were there when it began.
  let holding = false, lastY = scrollY;
  const hush = { passive: false }, scrollKeys = new Set(["ArrowDown", "ArrowUp", "PageDown", "PageUp", " ", "Home", "End"]);
  const soak = e => { if (holding && e.cancelable) e.preventDefault(); };
  const soakKeys = e => { if (holding && scrollKeys.has(e.key)) e.preventDefault(); };
  function stopHolding() {
    holding = false;
    removeEventListener("wheel", soak, hush); removeEventListener("touchmove", soak, hush); removeEventListener("keydown", soakKeys);
  }
  function holdOnDemo() {
    const wrap = root.parentElement, cs = getComputedStyle(wrap), nav = document.querySelector(".nav");
    const w = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), h = w * VH / VW;
    const navH = nav ? nav.offsetHeight : 0, want = navH + Math.max(12, (innerHeight - navH - h) / 2);
    const from = scrollY, to = from + root.getBoundingClientRect().top - want, t0 = performance.now();
    holding = true;
    const step = now => {
      const p = Math.min(1, (now - t0) / 750), e = 1 - Math.pow(1 - p, 3);
      scrollTo({ top: from + (to - from) * e, behavior: "instant" });
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(stopHolding, 1400);
  }
  const onScroll = () => {
    const down = scrollY > lastY; lastY = scrollY;
    if (!locked || lockedByHand || !down || root.getBoundingClientRect().top > innerHeight * 0.6) return;
    if (!reduceMotion && !("resume" in document.documentElement.dataset)) holdOnDemo();   // not while the page glides past it (a section link, a refresh)
    unlock();
  };
  if (locked) {
    addEventListener("scroll", onScroll, { passive: true });
    if (!reduceMotion) { addEventListener("wheel", soak, hush); addEventListener("touchmove", soak, hush); addEventListener("keydown", soakKeys); }
  }

  // ---------- Start ----------
  Promise.all([loadArt(), loadSceneArt("lagoon"), fetch("sprites/sprites.json").then(r => r.json())]).then(([, , m]) => {
    meta = m;
    sizeCanvases();
    icons = START.map(([c, r], i) => makeIcon(DOCS[i][0], DOCS[i][1], c, r));
    cur = field(icons.map(rect));
    settlePuffs(cur);
    cellsFor.lagoon = makeCells(SCENES.lagoon);
    spawnWalkers(cur);
    initLife(cur);
    // On the lock screen the scene is a still, so settle the boats and swimmers into place first.
    if (locked) for (let k = 0; k < 40; k++) { stepWalkers(cur, 0.1); stepLife(cur, 0.1); }
    root.dataset.scene = sceneId; root.style.setProperty("--moon", sc.moon);
    redrawAll = true;
    root.classList.add("ready");
    wake();
    // Fetch the other free scenes' backgrounds once the page has settled, so switching is instant.
    if (ground.gpu) setTimeout(() => { loadBg("meadow", false); loadBg("metro", false); loadSceneArt("meadow"); loadSceneArt("metro"); }, 2500);
  });
  let rz;
  addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { sizeCanvases(); redrawAll = true; wake(); }, 200); });
})();
