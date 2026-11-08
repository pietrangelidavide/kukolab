// Le persone del percorso: un solo scheletro (anche e busto, braccia e gambe con cinematica inversa) che veste cinque caratteri
// diversi: il cliente, Valerio, Chiara e il gruppo. Cambiano corporatura, capelli, volto (da foto o disegnato) e vestiti.
// Gli abiti sono parametri continui (lunghezza di maniche e pantaloni, colori): quando il cliente cambia disciplina si trasformano,
// non spuntano. Tutto in WebGL2, senza modelli esterni; un modello .glb potrà sostituire il corpo (vedi README del percorso).
import { lathe, smooth, upload, texFromBitmap } from './engine.js';
import { reupload } from './gl.js';
import { torus } from './engine.js';
import { LIGHT_GLSL, LIGHT_UNIFORMS, setLight, MAT } from './light.js';

/* ---------- vettori ---------- */
export const v = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  nrm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  mix: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
const basis = (o, x, y, z) => new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, o[0], o[1], o[2], 1]);
function boneM(A, B, r) {
  const d = v.sub(B, A), yn = v.nrm(d), ref = Math.abs(yn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const xn = v.nrm(v.cross(ref, yn)), zn = v.cross(xn, yn);
  return basis(A, v.mul(xn, r), d, v.mul(zn, r));
}
function ik2(A, T, l1, l2, pole) {
  const d = v.sub(T, A), L = v.len(d), dn = L > 1e-6 ? v.mul(d, 1 / L) : [0, -1, 0];
  const Lc = Math.min((l1 + l2) * 0.998, Math.max(Math.abs(l1 - l2) + 0.03, L));
  const H = v.add(A, v.mul(dn, Lc));
  const ca = Math.min(1, Math.max(-1, (l1 * l1 + Lc * Lc - l2 * l2) / (2 * l1 * Lc))), sa = Math.sqrt(1 - ca * ca);
  let p = v.sub(pole, v.mul(dn, v.dot(pole, dn))); if (v.len(p) < 1e-4) p = [0, 0, 1]; p = v.nrm(p);
  return { E: v.add(A, v.add(v.mul(dn, l1 * ca), v.mul(p, l1 * sa))), H };
}
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = cl((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/* ---------- volto come pelle sulla testa (una texture per persona) ---------- */
const V3 = '#version 300 es\n';
const FVS = V3 + `layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec2 aUv;
uniform mat4 uM; uniform mat4 uVP; out vec3 vW; out vec3 vN; out vec2 vUv; out vec3 vObj; out mat3 vNM;
void main(){ vec4 w = uM*vec4(aPos,1.); vW = w.xyz; mat3 nm = transpose(inverse(mat3(uM))); vNM = nm; vN = nm*aNor; vUv = aUv; vObj = aPos; gl_Position = uVP*w; }`;
const FFS = V3 + `precision highp float;
in vec3 vW; in vec3 vN; in vec2 vUv; in vec3 vObj; in mat3 vNM; uniform vec3 uEye, uFogC; uniform vec2 uFog; uniform vec4 uP; uniform sampler2D uTex;
${LIGHT_UNIFORMS}${LIGHT_GLSL}
out vec4 o;
void main(){
  vec4 tx = texture(uTex, vUv);
  vec3 n = normalize(vN); if(!gl_FrontFacing) n = -n;
  vec3 V = normalize(uEye - vW);
  vec3 c = toDsp(shade(tx.rgb, n, V, vW, uP, vObj, vNM));
  float fd = length(uEye - vW); float f = smoothstep(uFog.x,uFog.y,fd);
  c = mix(c,uFogC,f*.8);
  o = vec4(c,1.);
}`;
function shd(gl, type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }

export function addPeople(X) {
  const { gl, G, PAL, M, mesh, later, mixc } = X;
  const up = (g) => upload(gl, g);
  const XR = 0.30, YT = 0.40, YB = -0.40;

  /* ---------- geometrie condivise ---------- */
  const HS = 0.86;
  const HEAD_PROF = smooth([[0, -0.42], [0.095, -0.405], [0.185, -0.35], [0.26, -0.24], [0.305, -0.08], [0.322, 0.08], [0.3, 0.25], [0.22, 0.35], [0.1, 0.405], [0, 0.42]], 10);
  const LP = (pts, per = 4, seg = 22) => up(lathe(smooth(pts, per), seg));
  const AG = {
    thigh: LP([[0, 0], [0.55, 0.004], [0.92, 0.03], [1, 0.1], [0.97, 0.4], [0.86, 0.75], [0.75, 0.94], [0.5, 0.992], [0, 1]]),
    calf: LP([[0, 0], [0.55, 0.004], [0.95, 0.04], [1, 0.1], [1.08, 0.3], [0.95, 0.62], [0.66, 0.92], [0.5, 0.99], [0, 1]]),
    uarm: LP([[0, 0], [0.6, 0.004], [0.95, 0.03], [1, 0.1], [0.95, 0.5], [0.86, 0.9], [0.8, 0.985], [0, 1]]),
    farm: LP([[0, 0], [0.6, 0.004], [0.95, 0.03], [1, 0.08], [1.06, 0.25], [0.85, 0.65], [0.62, 0.95], [0.5, 0.99], [0, 1]]),
    sleeve: LP([[0, 0], [0.6, 0.004], [0.95, 0.03], [1, 0.08], [0.98, 0.6], [0.92, 0.96], [0.9, 0.996], [0, 1]]),
    limb: up(lathe(smooth([[0, 0], [0.55, 0.004], [0.92, 0.04], [1, 0.1], [0.93, 0.72], [0.8, 0.93], [0.5, 0.99], [0, 1]], 4), 20)),
    tube: up(lathe(smooth([[0, 0], [0.6, 0.005], [0.95, 0.05], [1, 0.12], [1, 0.88], [0.95, 0.95], [0.6, 0.995], [0, 1]], 4), 14)),
    torso: up(lathe(smooth([[0, 0], [0.3, 0.01], [0.355, 0.12], [0.34, 0.3], [0.295, 0.52], [0.31, 0.72], [0.36, 0.92], [0.385, 1.04], [0.34, 1.17], [0.2, 1.26], [0.09, 1.3], [0, 1.31]], 4), 32)),
    shirt: up(lathe(smooth([[0, -0.1], [0.37, -0.09], [0.405, -0.03], [0.385, 0.2], [0.33, 0.5], [0.355, 0.72], [0.405, 0.92], [0.43, 1.04], [0.37, 1.17], [0.22, 1.26], [0.12, 1.3], [0, 1.31]], 4), 32)),
    rim: up(torus(1, 0.14, 44, 10)),
    head: up(lathe(HEAD_PROF, 64)),
  };
  const hr = (y) => {
    y = Math.min(0.42, Math.max(-0.42, y));
    for (let i = 1; i < HEAD_PROF.length; i++) if (y <= HEAD_PROF[i][1]) { const p = HEAD_PROF[i - 1], q = HEAD_PROF[i], u = q[1] === p[1] ? 0 : (y - p[1]) / (q[1] - p[1]); return p[0] + (q[0] - p[0]) * u; }
    return 0;
  };
  const sz = (x, y) => 1.06 * Math.sqrt(Math.max(0, hr(y) * hr(y) - x * x));
  function capGeo(sd) {
    const NP = 26, NT = 16, pos = [], nor = [], idx = [], ph0 = 0.035, ph1 = Math.PI * 0.97;
    for (let j = 0; j <= NT; j++) for (let i = 0; i <= NP; i++) {
      const ph = ph0 + (ph1 - ph0) * (i / NP), edge = 0.262 - 0.29 * smoothstep(0.3, 1.55, ph), t = j / NT;
      const y = 0.432 + (edge - 0.432) * t, r = hr(Math.min(y, 0.418)) + 0.024 + 0.012 * Math.sin(Math.PI * Math.min(1, t * 1.4));
      const x = sd * r * Math.sin(ph), z = 1.06 * r * Math.cos(ph);
      pos.push(x, y, z);
      const nx = x / 0.1225, ny = y / 0.1936, nz = z / (0.1225 * 1.1236), l = Math.hypot(nx, ny, nz) || 1; nor.push(nx / l, ny / l, nz / l);
    }
    for (let j = 0; j < NT; j++) for (let i = 0; i < NP; i++) { const a = j * (NP + 1) + i, b = a + 1, c = a + NP + 1, d = c + 1; if (sd > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); }
    return up({ pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint32Array(idx) });
  }
  AG.capL = capGeo(-1); AG.capR = capGeo(1);
  X.headSurface = sz; X.headRadius = hr;

  // griglia del volto: segue la superficie della testa
  const faceGeo = (() => {
    const NX = 44, NY = 64, pos = [], nor = [], uv = [], idx = [], eps = 0.012;
    for (let j = 0; j <= NY; j++) {
      const y = YT + (YB - YT) * (j / NY), w = Math.min(XR, 0.985 * hr(y));
      for (let i = 0; i <= NX; i++) {
        const x = -w + 2 * w * (i / NX), z = sz(x, y) + eps, d = 0.012;
        const dzx = (sz(Math.min(x + d, 0.999 * hr(y)), y) - sz(Math.max(x - d, -0.999 * hr(y)), y)) / (2 * d);
        const dzy = (sz(x, y + d) - sz(x, y - d)) / (2 * d);
        const l = Math.hypot(dzx, dzy, 1);
        pos.push(x, y, z); nor.push(-dzx / l, -dzy / l, 1 / l); uv.push((x + XR) / (2 * XR), (YT - y) / (YT - YB));
      }
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf = (arr, loc, size) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };
    buf(pos, 0, 3); buf(nor, 1, 3); buf(uv, 2, 2);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const p = gl.createProgram(); gl.attachShader(p, shd(gl, gl.VERTEX_SHADER, FVS)); gl.attachShader(p, shd(gl, gl.FRAGMENT_SHADER, FFS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) { const nm = gl.getActiveUniform(p, i).name; u[nm] = gl.getUniformLocation(p, nm); }
    return { vao, n: idx.length, p, u };
  })();
  const FACES = {};
  async function loadFaces(base, keys) {
    await Promise.all(keys.map(async (k) => {
      try {
        const r = await fetch(`${base}img/viso-${k}.webp`); if (!r.ok) throw new Error(r.status);
        const bmp = await createImageBitmap(await r.blob(), { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        const tex = texFromBitmap(gl, bmp, { mip: true, premul: false }).t;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        FACES[k] = tex;
      } catch (e) { console.warn('[viso] non caricato:', k, e.message || e); }
    }));
  }
  function drawFace(key, headM) {
    const tex = FACES[key], F = X.U; if (!tex || !F) return;
    const { p, u } = faceGeo;
    gl.useProgram(p);
    gl.uniformMatrix4fv(u.uM, false, headM); gl.uniformMatrix4fv(u.uVP, false, F.vp); gl.uniform3fv(u.uEye, F.eye);
    gl.uniform3fv(u.uFogC, F.fogC); gl.uniform2fv(u.uFog, F.fog);
    setLight(gl, u, F);
    gl.uniform4f(u.uP, 0.16, 36, 0.6, MAT.skin);
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(u.uTex, 6); gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -2);
    gl.bindVertexArray(faceGeo.vao); gl.drawElements(gl.TRIANGLES, faceGeo.n, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.useProgram(X.P.mesh.p);
  }

  /* ---------- materiali ---------- */
  const soft = { spec: 0.06, shin: 14, rim: 0.55 }, gloss = { spec: 0.35, shin: 40, rim: 0.7 };
  const MS = { spec: 0.12, shin: 22, rim: 0.7, mat: MAT.skin }, MC = { spec: 0.05, shin: 10, rim: 0.8, mat: MAT.cloth }, MH = { spec: 0.4, shin: 34, rim: 0.7, mat: MAT.hair };
  const ML = { spec: 0.5, shin: 70, rim: 0.8 }, MSOLE = { spec: 0.1, shin: 16, rim: 0.5 };
  const NSC = new Map(); // stessi materiali, senza ombra (per il gruppo sullo sfondo)
  const ns = (o) => { let r = NSC.get(o); if (!r) { r = { ...o, noShadow: true }; NSC.set(o, r); } return r; };

  /* ---------- persona ---------- */
  // spec: { id, face, skin, hair:{kind,col,hi}, build:{w,torso,arm,leg,h,hip}, logo, watch }
  function createPerson(spec) {
    const B = { w: 1, torso: 1, arm: 1, leg: 1, h: 1, hip: 1, ...(spec.build || {}) };
    const HAIR = { kind: 'short', col: [0.1, 0.07, 0.05], hi: [0.2, 0.14, 0.1], ...(spec.hair || {}) };
    const skin = spec.skin, skinD = mixc(skin, [0.5, 0.2, 0.15], 0.2);
    let hair = null; // capelli lunghi: lamina propria per ogni persona (si ricalcola a ogni fotogramma)
    const HC = 31, HV = 20;
    if (HAIR.kind === 'long') {
      const hpos = new Float32Array(HC * (HV + 1) * 3), hnor = new Float32Array(HC * (HV + 1) * 3), hidx = new Uint32Array((HC - 1) * HV * 6);
      let k = 0; for (let j = 0; j < HV; j++) for (let i = 0; i < HC - 1; i++) { if (i === (HC - 1) / 2 - 1) continue; const a = j * HC + i, b = a + 1, c = a + HC, d = c + 1; hidx.set([a, c, b, b, c, d], k); k += 6; }
      hair = { hpos, hnor, hidx, geo: upload(gl, { pos: hpos, nor: hnor, idx: hidx }, true) };
    }
    const rigidInv = (m) => new Float32Array([m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0,
      -(m[0] * m[12] + m[1] * m[13] + m[2] * m[14]), -(m[4] * m[12] + m[5] * m[13] + m[6] * m[14]), -(m[8] * m[12] + m[9] * m[13] + m[10] * m[14]), 1]);
    const bez4 = (a, b, c, d, t) => { const u = 1 - t, w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t; return [0, 1, 2].map((q) => a[q] * w0 + b[q] * w1 + c[q] * w2 + d[q] * w3); };
    function buildHair(headM, torsoM, swayX, swayZ, lean) {
      const { hpos, hnor, hidx } = hair;
      const iT = rigidInv(torsoM), Hl = M.mul(iT, headM);
      const hcl = M.pt(Hl, [0, 0, 0]);
      for (let i = 0; i < HC; i++) {
        const s = (i / (HC - 1)) * 2 - 1, sd = s < 0 ? -1 : 1, as = Math.abs(s);
        const ph = 1.2 + (Math.PI - 1.2) * as, back = smoothstep(1.5, 2.6, ph), centre = smoothstep(2.5, Math.PI, ph);
        const yR = 0.02, r = hr(yR) + 0.034;
        const P0 = M.pt(Hl, [sd * r * Math.sin(ph), yR, 1.06 * r * Math.cos(ph)]);
        const out = v.nrm(v.sub(P0, hcl));
        const P1 = v.add(P0, v.mul(out, 0.08 + 0.05 * back)); P1[1] -= 0.16;
        const xT = sd * lerp(0.25, 0.4, smoothstep(1.2, 1.8, ph)) * (1 - 0.45 * smoothstep(1.9, 2.6, ph)) * (1 - centre);
        const zE = 0.31 * Math.sqrt(Math.max(0, 1 - (xT / 0.43) * (xT / 0.43))) + 0.055;
        const zT = lerp(zE, -zE - 0.01, smoothstep(1.55, 2.3, ph));
        const P2 = [xT, 1.06, zT];
        const rag = Math.sin(i * 1.3) * 0.07 + (hash(i * 3.7) - 0.5) * 0.14;
        let P3 = [xT * 0.97 + swayZ * 0.2, lerp(0.42, 0.18, back) + rag, zT * 0.96 - swayX * 0.3 + (1 - back) * 0.03];
        P3 = v.mix(P3, [P2[0], P2[1] - 0.85 + rag, P2[2] - 0.05], lean);
        const C2 = [P2[0], P2[1] - 0.1, P2[2]];
        for (let j = 0; j <= HV; j++) {
          const tt = j / HV;
          const q = bez4(P0, P1, C2, P3, tt);
          q[0] += Math.sin(tt * 6.5 + i * 0.9) * 0.014 * tt; q[2] += Math.cos(tt * 5.2 + i * 0.7) * 0.01 * tt;
          const o = (j * HC + i) * 3; hpos[o] = q[0]; hpos[o + 1] = q[1]; hpos[o + 2] = q[2];
        }
      }
      for (let j = 0; j <= HV; j++) for (let i = 0; i < HC; i++) {
        const o = (j * HC + i) * 3, o1 = (j * HC + Math.min(HC - 1, i + 1)) * 3, o0 = (j * HC + Math.max(0, i - 1)) * 3, p1 = (Math.min(HV, j + 1) * HC + i) * 3, p0 = (Math.max(0, j - 1) * HC + i) * 3;
        const du = [hpos[o1] - hpos[o0], hpos[o1 + 1] - hpos[o0 + 1], hpos[o1 + 2] - hpos[o0 + 2]], dv = [hpos[p1] - hpos[p0], hpos[p1 + 1] - hpos[p0 + 1], hpos[p1 + 2] - hpos[p0 + 2]];
        let n = v.cross(du, dv); const l = v.len(n); n = l > 1e-8 ? v.mul(n, 1 / l) : [0, 0, -1];
        const rel = [hpos[o], 0, hpos[o + 2] - 0.02]; if (v.dot(n, rel) < 0) n = v.mul(n, -1);
        hnor[o] = n[0]; hnor[o + 1] = n[1]; hnor[o + 2] = n[2];
      }
      reupload(gl, hair.geo, { pos: hpos, nor: hnor, idx: hidx });
    }
    // ricci (Valerio): sfere piccole sulla calotta alta, distribuite a spirale
    const CURLS = Array.from({ length: 62 }, (_, i) => {
      const a = i * 2.39996, y = 0.12 + 0.3 * Math.sqrt((i + 0.5) / 62), r = Math.sqrt(Math.max(0, 1 - (y / 0.44) ** 2)) * (hr(Math.min(y, 0.41)) + 0.03);
      const x = Math.sin(a) * r, z = Math.cos(a) * r * 1.06;
      return { x, y, z, s: 0.062 + hash(i * 5.1) * 0.03 };
    }).filter((c) => !(c.z > 0.12 && c.y < 0.3 && Math.abs(c.x) < 0.26)); // la fronte resta libera, per il volto
    const hairSt = { p: null, t: 0 };

    // pose → disegno. P (mondo): root[x,z], hip, yaw, pitch, lean, twist, roll, head, hR/hL, eR/eL, nR/nL, cR/cL, aR/aL (caviglie), fyR/fyL, fpR/fpL, smile;
    // o: outfit { top, sleeve, sleeveL, bot, legL, legK, shoe, sole, bare } e lod (0 = dettagliata, 1 = semplice)
    function draw(P, t, o = {}) {
      const lod = o.lod || 0, hs = B.h, O = [P.root[0], 0, P.root[1]];
      const toL = (p) => [(p[0] - O[0]) / hs, p[1] / hs, (p[2] - O[2]) / hs];
      const RM = M.mul(M.T(O[0], 0, O[2]), M.S(hs));
      const sh = lod ? (a) => a : null; void sh;
      const bm0 = (g, m, col, mo) => mesh(g, M.mul(RM, m), col, lod ? ns(mo || soft) : mo);
      const OF = { top: [0.1, 0.1, 0.11], sleeve: null, sleeveL: 0.4, bot: [0.1, 0.1, 0.11], legL: 0.3, legK: 1, shoe: [0.1, 0.1, 0.11], sole: [0.95, 0.95, 0.93], bare: 0, ...(spec.outfit || {}), ...(o.outfit || {}) };
      const sleeveC = OF.sleeve || OF.top;
      const hipW = toL(P.hip);
      const pelvisM = M.chain(M.T(hipW[0], hipW[1], hipW[2]), M.Ry(P.yaw), M.Rx(P.pitch || 0), M.Rz(P.roll || 0));
      const torsoM = M.mul(pelvisM, M.chain(M.Rx(P.lean || 0), M.Ry(P.twist || 0)));
      const br = 1 + Math.sin(t * 1.4 + (spec.seed || 0)) * 0.006 * (1 + (P.breath || 0) * 6);
      const SW = 0.41 * B.w;
      const sh_ = { R: M.pt(torsoM, [-SW, 1.08, 0]), L: M.pt(torsoM, [SW, 1.08, 0]) };
      const hd = P.head || [0, 0, 0];
      const headM = M.chain(torsoM, M.T(0, 1.44, 0), M.Ry(hd[0]), M.Rx(hd[1]), M.Rz(hd[2]), M.T(0, 0.33, 0), M.S(HS));
      const hc = M.pt(headM, [0, 0, 0]);
      const J = { hip: hipW, hands: {}, grip: {}, head: M.pt(RM, hc), RM, torsoM, headM, pelvisM };
      const toW = (p) => M.pt(RM, p);

      /* gambe */
      const fwd = [Math.sin(P.yaw), 0, Math.cos(P.yaw)];
      const rT = 0.158 * B.leg, rC = 0.118 * B.leg, gK = OF.legK;
      [{ sd: -1, a: P.aR, y: P.fyR || 0, p: P.fpR || 0 }, { sd: 1, a: P.aL, y: P.fyL || 0, p: P.fpL || 0 }].forEach((f) => {
        const hp = M.pt(pelvisM, [f.sd * 0.13 * B.hip, -0.02, 0]);
        const ankle = toL(f.a);
        const { E, H } = ik2(hp, ankle, 0.98, 0.92, P.kneePole ? v.add(P.kneePole, [0, 0, f.sd * 0.25]) : v.add(fwd, [f.sd * 0.12, 0, 0]));
        const Lc = OF.legL * 1.9, f1 = cl(Lc / 0.98), f2 = cl((Lc - 0.98) / 0.92);
        bm0(AG.thigh, boneM(hp, E, rT), skin, MS); bm0(AG.calf, boneM(E, H, rC), skin, MS);
        if (OF.bot && f1 > 0.02) {
          const e1 = v.mix(hp, E, f1);
          bm0(AG.thigh, boneM(hp, e1, rT * (1.1 + 0.13 * (gK - 1) + 0.04)), OF.bot, MC);
          bm0(G.sphere, M.chain(M.T(hp[0], hp[1], hp[2]), M.S(rT * (1.12 + 0.12 * (gK - 1)))), OF.bot, MC);
          if (f1 < 0.999 && f1 > 0.1) bm0(AG.tube, boneM(v.mix(hp, E, f1 - 0.015), e1, rT * (1.12 + 0.13 * (gK - 1)) * 0.98), mixc(OF.bot, [0, 0, 0], 0.16), MC); // orlo
          if (f2 > 0.02) {
            const h2 = v.mix(E, H, f2);
            bm0(G.sphere, M.chain(M.T(E[0], E[1], E[2]), M.S(rT * (0.98 + 0.1 * (gK - 1)))), OF.bot, MC);
            bm0(AG.calf, boneM(E, h2, rC * (1.12 + 0.18 * (gK - 1))), OF.bot, MC);
            if (f2 < 0.999 && f2 > 0.1) bm0(AG.tube, boneM(v.mix(E, H, f2 - 0.015), h2, rC * (1.12 + 0.18 * (gK - 1)) * 0.98), mixc(OF.bot, [0, 0, 0], 0.16), MC);
          } else bm0(G.sphere, M.chain(M.T(E[0], E[1], E[2]), M.S(rT * 0.8)), skin, MS);
        } else bm0(G.sphere, M.chain(M.T(E[0], E[1], E[2]), M.S(rT * 0.8)), skin, MS);
        // piede: scarpa da ginnastica (suola, tomaia, puntale, lacci) oppure a piedi nudi / calzino
        const fm = M.chain(M.T(ankle[0], ankle[1], ankle[2]), M.Ry(f.y), M.Rx(-f.p), M.T(0, -0.035, 0.075));
        if (OF.bare > 0.5) {
          bm0(G.sphere, M.mul(fm, M.chain(M.T(0, -0.01, 0.01), M.S(0.092, 0.07, 0.235))), OF.sock || skin, MC);
          bm0(G.sphere, M.mul(fm, M.chain(M.T(0, -0.025, 0.17), M.S(0.095, 0.052, 0.11))), OF.sock || skin, MC);
        } else {
          bm0(G.sphere, M.mul(fm, M.S(0.118, 0.088, 0.262)), OF.shoe, ML);
          bm0(G.sphere, M.mul(fm, M.chain(M.T(0, -0.052, 0.012), M.S(0.128, 0.036, 0.282))), OF.sole, MSOLE);
          if (!lod) {
            bm0(G.sphere, M.mul(fm, M.chain(M.T(0, 0.0, 0.2), M.S(0.1, 0.07, 0.1))), mixc(OF.shoe, [0.8, 0.8, 0.78], 0.3), ML);
            for (let q = 0; q < 3; q++) bm0(G.box, M.mul(fm, M.chain(M.T(0, 0.083 - q * 0.004, q * 0.065), M.Rx(-0.35), M.S(0.085, 0.01, 0.018))), OF.sole, MC);
          }
          if (OF.shoeAcc) bm0(G.sphere, M.mul(fm, M.chain(M.T(0, 0.012, -0.21), M.S(0.04, 0.05, 0.03))), OF.shoeAcc, ML);
        }
      });
      /* bacino, tronco e maglia */
      bm0(G.sphere, M.mul(pelvisM, M.chain(M.T(0, 0.02, 0), M.S(0.33 * B.hip, 0.24, 0.25))), OF.bot || skin, MC);
      bm0(AG.torso, M.mul(torsoM, M.S(B.w, br, 0.68 * B.torso)), skin, MS);
      bm0(AG.shirt, M.mul(torsoM, M.chain(M.S(B.w, br, 0.72 * B.torso))), OF.top, MC);
      bm0(AG.rim, M.mul(torsoM, M.chain(M.T(0, -0.085, 0), M.S(0.385 * B.w, 0.2, 0.385 * 0.72 * B.torso))), mixc(OF.top, [0, 0, 0], 0.12), MC);
      bm0(AG.rim, M.mul(torsoM, M.chain(M.T(0, 1.27, 0.005), M.S(0.125, 0.5, 0.1))), mixc(OF.top, [0, 0, 0], 0.1), MC);
      if (spec.logo && !lod) { // chevron arancio del marchio sul petto
        const lg = spec.logo;
        [1, -1].forEach((s2) => bm0(G.box, M.mul(torsoM, M.chain(M.T(lg[0] * B.w, lg[1] + s2 * 0.028, 0.405 * 0.72 * B.torso + 0.005), M.Rz(s2 * -0.75), M.S(0.07, 0.016, 0.01))), PAL.pink, soft));
      }
      /* collo, testa */
      bm0(AG.tube, boneM(M.pt(torsoM, [0, 1.16, 0]), M.pt(headM, [0, -0.3, 0]), 0.064), skin, MS);
      bm0(AG.head, M.mul(headM, M.S(1, 1, 1.06)), skin, { ...MS, spec: 0.18, shin: 26 });
      [-1, 1].forEach((s2) => bm0(G.sphere, M.mul(headM, M.chain(M.T(s2 * 0.312, -0.02, 0.0), M.Ry(s2 * 0.3), M.S(0.034, 0.068, 0.05))), skin, MS));
      if (!lod || o.face) { const hm = M.mul(RM, headM), fk = spec.face; later(() => drawFace(fk, hm)); }
      /* capelli */
      const hcol = HAIR.col, hhi = HAIR.hi;
      if (HAIR.kind !== 'bald') {
        bm0(AG.capL, headM, hcol, MH); bm0(AG.capR, headM, hcol, MH);
        if (HAIR.kind === 'short' || HAIR.kind === 'long' || HAIR.kind === 'pony' || HAIR.kind === 'bun') bm0(G.sphere, M.mul(headM, M.chain(M.T(0, 0.05, -0.1), M.S(0.335, 0.335, 0.325))), hcol, MH);
        else if (HAIR.kind === 'buzz') bm0(G.sphere, M.mul(headM, M.chain(M.T(0, 0.03, -0.09), M.S(0.325, 0.33, 0.315))), hcol, { ...MH, spec: 0.1 });
        else if (HAIR.kind === 'afro') { bm0(G.sphere, M.mul(headM, M.chain(M.T(0, 0.12, -0.04), M.S(0.46, 0.44, 0.46))), hcol, { ...MH, spec: 0.12 }); }
        else if (HAIR.kind === 'curly') {
          bm0(G.sphere, M.mul(headM, M.chain(M.T(0, 0.06, -0.1), M.S(0.34, 0.33, 0.33))), hcol, MH);
          const n = lod ? 0 : CURLS.length;
          for (let i = 0; i < n; i++) { const c = CURLS[i]; bm0(G.sphere, M.mul(headM, M.chain(M.T(c.x, c.y, c.z), M.S(c.s))), i % 3 ? hcol : hhi, { ...MH, spec: 0.5 }); }
        }
        if (HAIR.kind === 'long' && hair) {
          const hc2 = M.pt(torsoM, [0, 1.3, 0]); void hc2;
          if (!hairSt.p) hairSt.p = hc.slice();
          const dt = Math.min(0.1, Math.max(0.001, t - (hairSt.t || t))); hairSt.t = t;
          const kh = 1 - Math.exp(-dt * 7);
          hairSt.p = hairSt.p.map((x, a) => x + (hc[a] - x) * kh);
          const drag = v.sub(hairSt.p, hc);
          const swayX = cl(-drag[2] * 1.2 + Math.sin(t * 1.3) * 0.03, -0.4, 0.4), swayZ = cl(drag[0] * 1.2 + Math.sin(t * 0.9 + 1) * 0.025, -0.4, 0.4);
          buildHair(headM, torsoM, swayX, swayZ, smoothstep(0.35, 0.9, Math.abs((P.pitch || 0) + (P.lean || 0))));
          bm0(hair.geo, torsoM, hcol, { ...MH, spec: 0.5 });
        }
        if (HAIR.kind === 'pony') {
          const a0 = M.pt(headM, [0, 0.22, -0.3]), sw = Math.sin(t * 2 + (spec.seed || 0)) * 0.1;
          const p1 = v.add(a0, [sw * 0.4, -0.4, -0.3]), p2 = v.add(p1, [sw, -0.44, -0.12]), p3 = v.add(p2, [sw * 1.2, -0.32, -0.04]);
          [[a0, p1, 0.1, hcol], [p1, p2, 0.092, hhi], [p2, p3, 0.072, hhi]].forEach(([A, Bq, r, c]) => bm0(AG.limb, boneM(A, Bq, r), c, MH));
          bm0(AG.rim, M.mul(M.T(a0[0], a0[1], a0[2]), M.S(0.085, 0.34, 0.085)), PAL.pink, MC);
        }
        if (HAIR.kind === 'bun') bm0(G.sphere, M.mul(headM, M.chain(M.T(0, 0.43, -0.12), M.S(0.14))), hhi, MH);
      }
      if (HAIR.band) bm0(AG.rim, M.mul(headM, M.chain(M.T(0, 0.27, 0.0), M.S(0.34, 0.1, 0.35))), HAIR.band, MC); // fascia
      /* braccia */
      const rA = 0.084 * B.arm, rF = 0.07 * B.arm;
      [{ sd: -1, key: 'R', t: P.hR, pole: P.eR || [-1, -0.3, -0.4], n: P.nR || [1, 0, 0.2], c: P.cR || [0.4, 0.4, 0.4] },
       { sd: 1, key: 'L', t: P.hL, pole: P.eL || [1, -0.3, -0.4], n: P.nL || [-1, 0, 0.2], c: P.cL || [0.4, 0.4, 0.4] }].forEach((h) => {
        const A = sh_[h.key], { E, H } = ik2(A, toL(h.t), 0.66, 0.62, h.pole);
        bm0(G.sphere, M.chain(M.T(A[0], A[1], A[2]), M.S(rA * 1.38)), skin, MS);
        bm0(AG.uarm, boneM(A, E, rA * 1.34), skin, MS);
        bm0(AG.farm, boneM(E, H, rF * 1.36), skin, MS);
        bm0(G.sphere, M.chain(M.T(E[0], E[1], E[2]), M.S(rF * 1.4)), skin, MS);
        const Lc = OF.sleeveL * 1.28, fu = cl(Lc / 0.66), ff = cl((Lc - 0.66) / 0.62);
        if (fu > 0.02) {
          const e1 = v.mix(A, E, fu);
          bm0(AG.uarm, boneM(A, e1, 0.128 * B.arm * 1.02), sleeveC, MC);
          bm0(G.sphere, M.chain(M.T(A[0], A[1], A[2]), M.S(0.146 * B.arm)), sleeveC, MC);
          if (fu < 0.999) bm0(AG.tube, boneM(v.mix(A, E, fu - 0.04), e1, 0.119 * B.arm), mixc(sleeveC, [0, 0, 0], 0.14), MC);
          if (ff > 0.02) {
            const h1 = v.mix(E, H, ff);
            bm0(G.sphere, M.chain(M.T(E[0], E[1], E[2]), M.S(0.104 * B.arm)), sleeveC, MC);
            bm0(AG.sleeve, boneM(E, h1, 0.098 * B.arm), sleeveC, MC);
            if (ff < 0.999) bm0(AG.tube, boneM(v.mix(E, H, ff - 0.03), h1, 0.093 * B.arm), mixc(sleeveC, [0, 0, 0], 0.14), MC);
          }
        }
        J.hands[h.key] = toW(H);
        const fd = v.nrm(v.sub(H, E)); J.grip[h.key] = toW(v.add(H, v.mul(fd, 0.2)));
        if (spec.watch && h.key === 'L') bm0(AG.tube, boneM(v.mix(E, H, 0.86), v.mix(E, H, 0.93), 0.078 * B.arm), [0.08, 0.08, 0.1], ML);
        let zz = v.sub(h.n, v.mul(fd, v.dot(h.n, fd))); if (v.len(zz) < 1e-3) zz = [0, 0, 1]; zz = v.nrm(zz);
        const hm = basis(H, v.cross(fd, zz), fd, zz);
        const c = h.c;
        if (lod) { // mano semplice: palma, dita unite, pollice
          bm0(G.sphere, M.mul(hm, M.chain(M.T(0, 0.12, 0), M.S(0.062, 0.12 - 0.03 * c[1], 0.034))), skin, MS);
        } else {
          const bn = (a, b, r) => bm0(AG.tube, boneM(M.pt(hm, a), M.pt(hm, b), r), skin, MS);
          bm0(G.sphere, M.mul(hm, M.chain(M.T(0, 0.085, 0), M.S(0.066, 0.1, 0.036))), skin, MS);
          const fing = (x, l1, l2, cv, r) => {
            const a1 = cv * 1.0, a2 = cv * 1.25;
            const p0 = [x, 0.17, 0], p1 = [x, 0.17 + Math.cos(a1) * l1, Math.sin(a1) * l1], p2 = [x, p1[1] + Math.cos(a1 + a2) * l2, p1[2] + Math.sin(a1 + a2) * l2];
            bn(p0, p1, r); bn(p1, p2, r * 0.9);
          };
          fing(h.sd * 0.036, 0.1, 0.085, c[0], 0.02);
          fing(0, 0.105, 0.085, c[1], 0.021); fing(-h.sd * 0.03, 0.098, 0.08, c[1], 0.019); fing(-h.sd * 0.056, 0.08, 0.065, c[1], 0.017);
          const th = c[2];
          const t0 = [h.sd * 0.062, 0.05, 0.005], t1 = [h.sd * (0.1 - th * 0.05), 0.1 + th * 0.04, 0.03 + th * 0.06], t2 = [h.sd * (0.1 - th * 0.09), 0.15 + th * 0.03, 0.04 + th * 0.12];
          bn(t0, t1, 0.023); bn(t1, t2, 0.02);
        }
      });
      return J;
    }
    return { draw, spec };
  }

  return { createPerson, loadFaces, FACES, AG };
}
