// Motore WebGL2 scritto a mano (matematica, geometrie procedurali, programmi): lo stesso usato per il sito di Naomi.
/* ---------- matrici 4x4 (column-major) ---------- */
export const M = {
  id: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  },
  chain(...ms) { return ms.reduce((a, b) => M.mul(a, b)); },
  T(x, y, z) { const m = M.id(); m[12] = x; m[13] = y; m[14] = z; return m; },
  S(x, y = x, z = x) { const m = M.id(); m[0] = x; m[5] = y; m[10] = z; return m; },
  Rx(a) { const c = Math.cos(a), s = Math.sin(a), m = M.id(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; },
  Ry(a) { const c = Math.cos(a), s = Math.sin(a), m = M.id(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; },
  Rz(a) { const c = Math.cos(a), s = Math.sin(a), m = M.id(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; },
  // prospettiva con spostamento dell'obiettivo (sx, sy in coordinate NDC): la scena può stare in un angolo dello schermo
  persp(fovy, asp, n, f, sx = 0, sy = 0) {
    const t = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
    m[0] = t / asp; m[5] = t; m[8] = -sx; m[9] = -sy; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f);
    return m;
  },
  // proiezione ortogonale (per la mappa delle ombre)
  ortho(l, r, b, t, n, f) {
    const m = new Float32Array(16);
    m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n); m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n); m[15] = 1;
    return m;
  },
  look(e, t, up = [0, 1, 0]) {
    let z = [e[0] - t[0], e[1] - t[1], e[2] - t[2]]; const zl = Math.hypot(...z); z = z.map((v) => v / zl);
    let x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]]; const xl = Math.hypot(...x); x = x.map((v) => v / xl);
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
      -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1]);
  },
  pt(m, p) { // trasforma un punto
    const x = p[0], y = p[1], z = p[2];
    return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
  },
};

/* ---------- geometrie procedurali ---------- */
function orient(pos, nor, idx) { // se i triangoli guardano all'interno rispetto alle normali, li giro
  let s = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    s += nx * (nor[a] + nor[b] + nor[c]) + ny * (nor[a + 1] + nor[b + 1] + nor[c + 1]) + nz * (nor[a + 2] + nor[b + 2] + nor[c + 2]);
  }
  if (s < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
}

// Solido di rivoluzione. prof = [[r, y], ...] dal basso verso l'alto (poi verso l'asse in cima): normali verso l'esterno.
// Due punti uguali di fila fanno uno spigolo netto.
export function lathe(prof, seg = 40) {
  const n = prof.length, sn = [];
  for (let i = 0; i < n - 1; i++) {
    const dr = prof[i + 1][0] - prof[i][0], dy = prof[i + 1][1] - prof[i][1], l = Math.hypot(dr, dy);
    sn.push(l < 1e-9 ? null : [dy / l, -dr / l]);
  }
  const vn = prof.map((_, i) => {
    let nr = 0, ny = 0; const a = sn[i - 1], b = sn[i];
    if (a) { nr += a[0]; ny += a[1]; }
    if (b) { nr += b[0]; ny += b[1]; }
    const l = Math.hypot(nr, ny) || 1;
    return [nr / l, ny / l];
  });
  const pos = [], nor = [], idx = [], w = seg + 1;
  for (let i = 0; i < n; i++) for (let j = 0; j <= seg; j++) {
    const a = j / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    pos.push(prof[i][0] * c, prof[i][1], prof[i][0] * s);
    nor.push(vn[i][0] * c, vn[i][1], vn[i][0] * s);
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * w + j, b = a + 1, c = a + w, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  orient(pos, nor, idx);
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint32Array(idx) };
}

// Profilo smussato: punti (r, y) → curva più fitta (Catmull-Rom) per forme morbide
export function smooth(pts, per = 6) {
  const out = [], n = pts.length;
  const P = (i) => pts[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((d) => 0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  out.push(pts[n - 1].slice());
  return out.map(([r, y]) => [Math.max(0, r), y]);
}

// Tubo lungo un tracciato con raggio variabile: stelo, banana, filo d'acqua, anse.
export function sweep(path, rad, radial = 10) {
  const n = path.length, pos = [], nor = [], idx = [];
  const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const tan = path.map((p, i) => { const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)]; return nrm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]); });
  let u = nrm(cr(tan[0], Math.abs(tan[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  for (let i = 0; i < n; i++) {
    const t = tan[i], d = dt(u, t);
    u = nrm([u[0] - t[0] * d, u[1] - t[1] * d, u[2] - t[2] * d]);
    const v = cr(t, u);
    const a0 = path[Math.max(0, i - 1)], a1 = path[Math.min(n - 1, i + 1)];
    const ds = Math.hypot(a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]) || 1;
    const slope = (rad[Math.min(n - 1, i + 1)] - rad[Math.max(0, i - 1)]) / ds;
    for (let k = 0; k <= radial; k++) {
      const a = k / radial * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const nx = u[0] * c + v[0] * s, ny = u[1] * c + v[1] * s, nz = u[2] * c + v[2] * s;
      pos.push(path[i][0] + nx * rad[i], path[i][1] + ny * rad[i], path[i][2] + nz * rad[i]);
      const m = nrm([nx - t[0] * slope, ny - t[1] * slope, nz - t[2] * slope]);
      nor.push(m[0], m[1], m[2]);
    }
  }
  const w = radial + 1;
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < radial; k++) {
    const a = i * w + k, b = a + 1, c = a + w, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  orient(pos, nor, idx);
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint32Array(idx) };
}

// Foglia (spinacio): una lamina lungo +x, incurvata, a doppia faccia
export function leaf(L = 1, W = 0.5, nu = 16, nv = 8, cup = 0.5, droop = 0.25) {
  const pos = [], idx = [];
  const P = (u, v) => {
    const w = W / 2 * Math.sin(Math.PI * Math.pow(u, 0.72)) * (1 - 0.15 * u);
    return [(u - 0.5) * L, cup * v * v * w + droop * (u * u) * L * 0.5 - droop * 0.1, v * w];
  };
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const p = P(i / nu, -1 + 2 * j / nv); pos.push(...p); }
  const nor = new Array(pos.length).fill(0), w = nv + 1;
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * w + j, b = a + 1, c = a + w, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b, c]) { nor[q] += nx; nor[q + 1] += ny; nor[q + 2] += nz; }
  }
  for (let i = 0; i < nor.length; i += 3) { const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]) || 1; nor[i] /= l; nor[i + 1] /= l; nor[i + 2] /= l; }
  if (nor[1] < 0) for (let i = 0; i < nor.length; i++) nor[i] = -nor[i]; // normali verso l'alto: l'ombra si legge dal verso
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint32Array(idx) };
}

// Quadrato unitario sul piano XZ (ombre a terra)
export function quad() {
  return {
    pos: new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]),
    nor: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    idx: new Uint32Array([0, 2, 1, 0, 3, 2]),
  };
}

/* ---------- WebGL ---------- */
export function upload(gl, g, dynamic = false) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const use = dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW;
  const bp = gl.createBuffer(), bn = gl.createBuffer(), bi = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bp); gl.bufferData(gl.ARRAY_BUFFER, g.pos, use);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, bn); gl.bufferData(gl.ARRAY_BUFFER, g.nor, use);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bi); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.idx, use);
  gl.bindVertexArray(null);
  return { vao, n: g.idx.length, bp, bn, bi };
}
export function reupload(gl, m, g) {
  gl.bindVertexArray(m.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, m.bp); gl.bufferData(gl.ARRAY_BUFFER, g.pos, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, m.bn); gl.bufferData(gl.ARRAY_BUFFER, g.nor, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.bi); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.idx, gl.DYNAMIC_DRAW);
  gl.bindVertexArray(null);
  m.n = g.idx.length;
}

export function program(gl, vs, fs) {
  const mk = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
  return { p, u };
}
