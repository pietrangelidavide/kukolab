// Le persone del percorso: un solo scheletro (anche e busto, braccia e gambe con cinematica inversa) che veste cinque caratteri
// diversi: il cliente, Valerio, Chiara e il gruppo. Cambiano corporatura, capelli, volto (da foto o disegnato) e vestiti.
// Gli abiti sono parametri continui (lunghezza di maniche e pantaloni, colori): quando il cliente cambia disciplina si trasformano,
// non spuntano. Tutto in WebGL2, senza modelli esterni; un modello .glb potrà sostituire il corpo (vedi README del percorso).
import { lathe, smooth, upload, texFromBitmap, sphere } from './engine.js';
import { reupload, sweep } from './gl.js';
import { torus } from './engine.js';
import { LIGHT_GLSL, LIGHT_UNIFORMS, setLight, MAT, objScale } from './light.js';
import { makeBody } from './body.js';

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
  return { E: v.add(A, v.add(v.mul(dn, l1 * ca), v.mul(p, l1 * sa))), H, p };
}
// osso con sezione orientata: y da A a B, z verso zd (il lato interno dell'articolazione), raggio di riferimento r
function boneQ(A, B, r, zd) {
  const d = v.sub(B, A), yn = v.nrm(d);
  let z = v.sub(zd, v.mul(yn, v.dot(zd, yn)));
  if (v.len(z) < 1e-4) z = Math.abs(yn[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], z = v.sub(z, v.mul(yn, v.dot(z, yn)));
  const zn = v.nrm(z), xn = v.cross(yn, zn);
  return basis(A, v.mul(xn, r), d, v.mul(zn, r));
}
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = cl((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/* ---------- volto come pelle sulla testa (una texture per persona) ---------- */
const V3 = '#version 300 es\n';
const FVS = V3 + `layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec2 aUv;
uniform mat4 uM; uniform mat4 uVP; uniform vec2 uExp; out vec3 vW; out vec3 vN; out vec2 vUv; out vec3 vObj; out mat3 vNM;
float gs(vec2 p, vec2 c, vec2 s){ vec2 d = (p - c)/s; return exp(-dot(d, d)); }
// rilievo del volto (unità della testa): arcate, orbite, naso, zigomi, labbra, mento; le coordinate sono quelle della texture del viso
float relief(vec2 p, float sm){
  float r = 0.;
  r += .016*(gs(p, vec2(.12, .15), vec2(.085, .028)) + gs(p, vec2(-.12, .15), vec2(.085, .028)));       // arcate sopraccigliari
  r -= .013*(gs(p, vec2(.132, .042), vec2(.058, .036)) + gs(p, vec2(-.132, .042), vec2(.058, .036)));   // orbite
  r += .03*gs(p, vec2(0., -.02), vec2(.03, .1))*smoothstep(-.13, .07, p.y);                             // ponte del naso
  r += .034*gs(p, vec2(0., -.122), vec2(.04, .034));                                                    // punta
  r += .015*(gs(p, vec2(.052, -.13), vec2(.028, .024)) + gs(p, vec2(-.052, -.13), vec2(.028, .024)));   // ali del naso
  r += .014*(gs(p, vec2(.19, -.07), vec2(.075, .055)) + gs(p, vec2(-.19, -.07), vec2(.075, .055)));     // zigomi
  r -= .008*(gs(p, vec2(.17, -.19), vec2(.07, .05)) + gs(p, vec2(-.17, -.19), vec2(.07, .05)));         // guance sotto gli zigomi
  r += sm*.012*(gs(p, vec2(.17, -.14), vec2(.065, .05)) + gs(p, vec2(-.17, -.14), vec2(.065, .05)));    // sorriso: guance in su
  r += .011*gs(p, vec2(0., -.236), vec2(.075, .017)) + .014*gs(p, vec2(0., -.278), vec2(.065, .022));   // labbra
  r -= .006*gs(p, vec2(0., -.257), vec2(.09, .006));                                                    // linea della bocca
  r += .02*gs(p, vec2(0., -.35), vec2(.08, .04));                                                       // mento
  r += .01*gs(p, vec2(0., .25), vec2(.15, .08));                                                        // fronte
  return r;
}
void main(){
  float win = 1. - smoothstep(.62, 1., length(vec2(aPos.x/.3, aPos.y/.4)));
  float e = .004, h0 = relief(aPos.xy, uExp.x);
  float hx = relief(aPos.xy + vec2(e, 0.), uExp.x) - relief(aPos.xy - vec2(e, 0.), uExp.x), hy = relief(aPos.xy + vec2(0., e), uExp.x) - relief(aPos.xy - vec2(0., e), uExp.x);
  vec3 pp = aPos + aNor*win*(h0 + .012);
  vec3 nn = normalize(aNor + vec3(-hx, -hy, 0.)*win/(2.*e));
  vec4 w = uM*vec4(pp, 1.); vW = w.xyz; mat3 nm = transpose(inverse(mat3(uM))); vNM = nm; vN = nm*nn; vUv = aUv; vObj = aPos; gl_Position = uVP*w; }`;
const FFS = V3 + `precision highp float; 
in vec3 vW; in vec3 vN; in vec2 vUv; in vec3 vObj; in mat3 vNM; uniform vec3 uEye, uFogC; uniform vec2 uFog; uniform vec4 uP; uniform sampler2D uTex; uniform vec2 uExp;
uniform float uHL[12]; uniform vec3 uHairC; uniform float uHairK;
${LIGHT_UNIFORMS}${LIGHT_GLSL}
out vec4 o;
float hlAt(float ph){ float f = clamp(ph/0.15, 0., 10.999); int i = int(f); return mix(uHL[i], uHL[i+1], f - float(i)); }
float gs2(vec2 p, vec2 c, vec2 s){ vec2 d = (p - c)/s; return exp(-dot(d, d)); }
float lum(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
void main(){
  vec2 p = vObj.xy, uv = vUv;
  float smile = uExp.x, blink = uExp.y;
  // sorriso leggero: gli angoli della bocca salgono (il disegno si sposta)
  float cr = gs2(vec2(abs(p.x), p.y), vec2(.098, -.254), vec2(.05, .04));
  uv.y += cr*.017*smile/.8;
  vec4 tx = texture(uTex, uv);
  // occhi: maschera dell'occhio, palpebra che scende con il battito, ombra della palpebra superiore, riflessi
  vec2 pe = vec2(abs(p.x) - .132, p.y - .037);
  float em = 1. - smoothstep(.62, 1., length(vec2(pe.x/.06, pe.y/.036)));
  if(blink > .01){
    vec4 lid = texture(uTex, uv - vec2(0., .042/.8));
    tx = mix(tx, lid, clamp(blink*1.15, 0., 1.)*em);
    float ll = 1. - smoothstep(0., .0045, abs(pe.y + .003 + .007*pow(pe.x/.06, 2.)));
    tx.rgb *= 1. - .5*ll*blink*(1. - smoothstep(.7, 1., abs(pe.x)/.06));
  }
  tx.rgb *= 1. - .17*smoothstep(.006, .03, pe.y)*em*(1. - blink);                    // ombra della palpebra sull'occhio
  tx.rgb *= 1. - .1*gs2(vec2(abs(p.x), p.y), vec2(.13, -.012), vec2(.062, .016));       // sotto l'occhio
  // pelle: naso e guance appena più calde, tono più profondo attorno alla bocca
  tx.rgb = mix(tx.rgb, tx.rgb*vec3(1.08, .9, .87), .3*gs2(p, vec2(0., -.122), vec2(.04, .03)) + .22*gs2(vec2(abs(p.x), p.y), vec2(.18, -.1), vec2(.07, .05)));
  if(uHairK > .5){ // attaccatura dei capelli dipinta sul volto: scura sopra il bordo della calotta, sfuma nella pelle sotto, con qualche filo
    float ph = atan(abs(vObj.x), max(vObj.z, .001)/1.06);
    float hl = hlAt(ph);
    float st = .5 + .5*sin(vObj.x*260. + sin(vObj.y*50.)*2.);
    float m = smoothstep(hl - .05 - .012*st, hl + .003, vObj.y);
    tx.rgb = mix(tx.rgb, uHairC*(.9 + .1*st), m*.95);
  }
  vec3 n = normalize(vN); if(!gl_FrontFacing) n = -n;
  // micro-rilievo dai toni del disegno (sopracciglia, linea delle labbra, narici): le zone scure rientrano
  { vec2 d = vec2(2./576., 2./768.); float L0 = lum(tx.rgb), Lx = lum(texture(uTex, uv + vec2(d.x, 0.)).rgb), Ly = lum(texture(uTex, uv + vec2(0., d.y)).rgb);
    n = normalize(n + vNM*vec3(-(Lx - L0), (Ly - L0), 0.)*.32*(1. - .8*em)); }
  vec3 V = normalize(uEye - vW);
  vec4 Pm = uP;
  float wet = em*(1. - blink);                                                      // cornea: lucida, riflette il softbox
  Pm.x = mix(Pm.x, .3, wet*.8); Pm.y = mix(Pm.y, 90., wet*.8);
  float lm = gs2(p, vec2(0., -.254), vec2(.085, .03)); Pm.x += .16*lm; Pm.y = mix(Pm.y, 60., lm*.6); // labbra
  vec3 c = toDsp(shade(tx.rgb, n, V, vW, Pm, vObj, vNM));
  // luce puntiforme negli occhi (finestra della luce principale, in alto a sinistra, e un riflesso piccolo opposto)
  vec2 q = vec2(sign(p.x)*pe.x, pe.y);
  float cl1 = exp(-dot((q - vec2(-.014*sign(p.x), .013))/vec2(.0075, .0075), (q - vec2(-.014*sign(p.x), .013))/vec2(.0075, .0075)));
  float cl2 = exp(-dot((pe - vec2(.012*sign(p.x), -.011))/vec2(.0045, .0045), (pe - vec2(.012*sign(p.x), -.011))/vec2(.0045, .0045)));
  c += vec3(1., .97, .92)*(cl1*1.5 + cl2*.45)*wet*smoothstep(.0, .5, em);
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
  const HS = 0.74;
  const HEAD_PROF = smooth([[0, -0.42], [0.095, -0.405], [0.185, -0.35], [0.26, -0.24], [0.305, -0.08], [0.322, 0.08], [0.3, 0.25], [0.22, 0.35], [0.1, 0.405], [0, 0.42]], 10);
  const LP = (pts, per = 4, seg = 22) => up(lathe(smooth(pts, per), seg));
  const AG = {
    limb: up(lathe(smooth([[0, 0], [0.55, 0.004], [0.92, 0.04], [1, 0.1], [0.93, 0.72], [0.8, 0.93], [0.5, 0.99], [0, 1]], 4), 20)),
    tube: up(lathe(smooth([[0, 0], [0.6, 0.005], [0.95, 0.05], [1, 0.12], [1, 0.88], [0.95, 0.95], [0.6, 0.995], [0, 1]], 4), 14)),
    rim: up(torus(1, 0.14, 44, 10)),
    head: up(lathe(HEAD_PROF, 64)),
  };
  const BD = makeBody(), BG = {};
  Object.keys(BD).forEach((k) => { const g = BD[k]; if (g.pos) BG[k] = up(g); });
  BG.shoe = {}; Object.keys(BD.shoe).forEach((k) => { BG.shoe[k] = up(BD.shoe[k]); });
  const hr = (y) => {
    y = Math.min(0.42, Math.max(-0.42, y));
    for (let i = 1; i < HEAD_PROF.length; i++) if (y <= HEAD_PROF[i][1]) { const p = HEAD_PROF[i - 1], q = HEAD_PROF[i], u = q[1] === p[1] ? 0 : (y - p[1]) / (q[1] - p[1]); return p[0] + (q[0] - p[0]) * u; }
    return 0;
  };
  const sz = (x, y) => 1.06 * Math.sqrt(Math.max(0, hr(y) * hr(y) - x * x));
  /* ---------- capelli: calotta con attaccatura naturale ----------
     ph = angolo dal davanti (0 fronte, π nuca). L'attaccatura scende dalla fronte alle tempie, alle basette, poi dietro l'orecchio fino alla nuca.
     La calotta si assottiglia fino a zero sul bordo, così non fa gradino sulla pelle; il volto (shader) sfuma lo stesso colore sotto il bordo. */
  const HL_PTS = [[0, 0.285], [0.55, 0.28], [0.9, 0.25], [1.08, 0.2], [1.2, 0.1], [1.3, 0.02], [1.45, 0.05], [1.62, 0.07], [1.85, 0.0], [2.15, -0.06], [2.5, -0.12], [2.85, -0.15], [Math.PI, -0.16]];
  const hairlineY = (ph) => {
    const P = HL_PTS; ph = cl(ph, 0, Math.PI);
    let i = 0; while (i < P.length - 2 && ph > P[i + 1][0]) i++;
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const h = p2[0] - p1[0], u = (ph - p1[0]) / h, u2 = u * u, u3 = u2 * u;
    const m1 = (p2[1] - p0[1]) / (p2[0] - p0[0]) * h, m2 = (p3[1] - p1[1]) / (p3[0] - p1[0]) * h;
    return (2 * u3 - 3 * u2 + 1) * p1[1] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2[1] + (u3 - u2) * m2;
  };
  const HL_N = 12, HL_D = 0.15; // campioni dell'attaccatura per lo shader del volto (0 … 1,65 rad, davanti)
  const HLU = new Float32Array(HL_N).map((_, k) => hairlineY(k * HL_D));
  const dhr = (y) => (hr(Math.min(0.41, y + 0.006)) - hr(Math.max(-0.42, y - 0.006))) / 0.012; // pendenza del profilo della testa
  // thk = spessore sul cocuzzolo, back = volume in più dietro (nuca); la calotta sale dalla pelle lungo la normale del profilo
  function capGeo(sd, thk, back) {
    const NP = 44, NT = 20, pos = [], nor = [], idx = [];
    for (let j = 0; j <= NT; j++) for (let i = 0; i <= NP; i++) {
      const ph = Math.PI * (i / NP), t = j / NT, edge = hairlineY(ph);
      const y = 0.42 + (edge - 0.42) * Math.pow(t, 0.9), k = Math.pow(1 - smoothstep(0, 1, t), 0.75);
      const th = 0.004 + (thk + back * smoothstep(1.3, 2.4, ph) * smoothstep(0.02, 0.45, t)) * k;   // il volume dietro sfuma verso il cocuzzolo: niente punta
      let nr = 1, ny = 0;
      if (j > 0) { const s = dhr(y), l = Math.hypot(1, s); nr = 1 / l; ny = -s / l; } else { nr = 0; ny = 1; }
      const rh = hr(Math.min(y, 0.418)), R = j === 0 ? 0 : rh + th * nr, Y = y + th * ny;
      const x = sd * R * Math.sin(ph), z = 1.06 * R * Math.cos(ph);
      pos.push(x, Y, z);
      const nxx = sd * nr * Math.sin(ph), nzz = nr * Math.cos(ph) / 1.06, l = Math.hypot(nxx, ny, nzz) || 1; nor.push(nxx / l, ny / l, nzz / l);
    }
    for (let j = 0; j < NT; j++) for (let i = 0; i < NP; i++) { const a = j * (NP + 1) + i, b = a + 1, c = a + NP + 1, d = c + 1; if (sd > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); }
    return up({ pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint32Array(idx) });
  }
  const CAPS = new Map();
  const CAPD = { short: [0.05, 0.022], buzz: [0.016, 0.0], curly: [0.034, 0.012], long: [0.046, 0.03], pony: [0.042, 0.02], bun: [0.042, 0.02], afro: [0.03, 0.0] };
  const capFor = (kind) => { const key = CAPD[kind] ? kind : 'short'; let c = CAPS.get(key); if (!c) { const [a, b] = CAPD[key]; c = { L: capGeo(-1, a, b), R: capGeo(1, a, b) }; CAPS.set(key, c); } return c; };
  X.headSurface = sz; X.headRadius = hr;

  // griglia del volto: segue la superficie della testa
  const faceGeo = (() => {
    const NX = 84, NY = 112, pos = [], nor = [], uv = [], idx = [], eps = 0.0;
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
    u.uHL = gl.getUniformLocation(p, 'uHL');
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
  function drawFace(key, headM, hairC, ex) {
    const tex = FACES[key], F = X.U; if (!tex || !F) return;
    const { p, u } = faceGeo;
    gl.useProgram(p);
    gl.uniform1fv(u.uHL, HLU); gl.uniform1f(u.uHairK, hairC ? 1 : 0); gl.uniform3fv(u.uHairC, hairC || [0, 0, 0]);
    gl.uniformMatrix4fv(u.uM, false, headM); gl.uniformMatrix4fv(u.uVP, false, F.vp); gl.uniform3fv(u.uEye, F.eye);
    gl.uniform3fv(u.uFogC, F.fogC); gl.uniform2fv(u.uFog, F.fog);
    setLight(gl, u, F);
    gl.uniform2f(u.uExp, ex ? ex[0] : 0.25, ex ? ex[1] : 0); gl.uniform4f(u.uP, 0.16, 36, 0.6, MAT.skin); gl.uniform3fv(u.uObjS, objScale(headM)); gl.uniform1f(u.uClip, 9);
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(u.uTex, 6); gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -2);
    gl.bindVertexArray(faceGeo.vao); gl.drawElements(gl.TRIANGLES, faceGeo.n, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.useProgram(X.P.mesh.p);
  }

  /* ---------- materiali ---------- */
  const soft = { spec: 0.06, shin: 14, rim: 0.55 }, gloss = { spec: 0.35, shin: 40, rim: 0.7 };
  const MS = { spec: 0.12, shin: 22, rim: 0.7, mat: MAT.skin }, MC = { spec: 0.05, shin: 10, rim: 0.8, mat: MAT.cloth }, MH = { spec: 0.4, shin: 34, rim: 0.7, mat: MAT.hair };
  const ML = { spec: 0.2, shin: 36, rim: 0.85 }, MSOLE = { spec: 0.1, shin: 16, rim: 0.5 };
  const NSC = new Map(); // stessi materiali, senza ombra (per il gruppo sullo sfondo)
  const ns = (o) => { let r = NSC.get(o); if (!r) { r = { ...o, noShadow: true }; NSC.set(o, r); } return r; };
  // capo tecnico: tessuto con cuciture, pieghe quando l'articolazione si piega (bend 0..1) e orlo a distanza clip lungo l'osso (oltre, si taglia)
  const GMC = new Map();
  const GM = (bend, clip) => {
    const b = Math.round(cl(bend) * 8) / 8, cp = clip >= 0.999 ? 9 : Math.round(clip * 200) / 200, k = b + '|' + cp; let m = GMC.get(k);
    if (!m) { m = { spec: 0.05, shin: 10, rim: 0.8, mat: MAT.cloth + 0.02 + 0.44 * b, clip: cp }; GMC.set(k, m); }
    return m;
  };

  /* ---------- persona ---------- */
  // spec: { id, face, skin, hair:{kind,col,hi}, build:{w,torso,arm,leg,h,hip}, logo, watch }
  function createPerson(spec) {
    const B = { w: 1, torso: 1, arm: 1, leg: 1, h: 1, hip: 1, ...(spec.build || {}) };
    const shirtG = Math.abs(B.hip / B.w - 1) < 0.03 ? BG.shirt : up(BD.shirtFor(B.hip / B.w));   // maglia con l'orlo sulla larghezza dei fianchi di questa persona
    const HAIR = { kind: 'short', col: [0.1, 0.07, 0.05], hi: [0.2, 0.14, 0.1], ...(spec.hair || {}) };
    const skin = spec.skin, skinD = mixc(skin, [0.5, 0.2, 0.15], 0.2);
    let hair = null; // capelli lunghi: lamina propria per ogni persona (si ricalcola a ogni fotogramma)
    const HC = 61, HV = 26;
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
          // onde che scorrono insieme (la fase cambia piano da una ciocca all'altra) e rilievo a ciocche: avvallamenti e creste lungo la lunghezza
          const wv = Math.sin(tt * 5.8 + s * 1.3 + 0.5), wz = Math.cos(tt * 4.6 + s * 1.1);
          q[0] += wv * 0.03 * Math.pow(tt, 1.15); q[2] += wz * 0.018 * tt;
          const rdg = (0.011 * Math.sin(i * 1.9 + hash(i * 0.37) * 3) + 0.006 * Math.sin(i * 4.3 + tt * 2)) * smoothstep(0.0, 0.25, tt) * (1 - 0.5 * tt);
          const rx = q[0], rz = q[2] - hcl[2], rl = Math.hypot(rx, rz) || 1; q[0] += rx / rl * rdg; q[2] += rz / rl * rdg;
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
    // ricci (Valerio): ciocche a spirale (tubi lungo un'elica) sparse sopra l'attaccatura; tre mesh fuse (base, mezzo, riflessi) così il colore varia da ciocca a ciocca.
    // Più corte e sottili vicino al bordo: la frangia sfuma sul volto invece di fermarsi di colpo
    let CURL = null;
    const curlMeshes = () => {
      if (CURL) return CURL;
      const N = 330, parts = [[], [], []], RAD = 7, NP = 15;
      for (let i = 0; i < N; i++) {
        const f = Math.sqrt((i + 0.5) / N), a = i * 2.39996, y = lerp(0.43, -0.1, f * f);
        const az = Math.abs(((a + Math.PI) % (2 * Math.PI)) - Math.PI), sd = Math.sin(a) < 0 ? -1 : 1;
        const d = y - hairlineY(az); if (d < 0.02) continue;        // niente ricci sulla pelle
        const rh = hr(Math.min(y, 0.405)) + 0.012, near = 0.55 + 0.45 * Math.min(1, d / 0.16), k = (0.8 + hash(i * 7.3) * 0.5) * near;
        const P = [sd * rh * Math.sin(az), y, 1.06 * rh * Math.cos(az)];
        const out = v.nrm([P[0], (P[1] - 0.04) * 0.55, P[2] + 0.02]);
        const ax = v.nrm(v.add(out, [0, -0.38 - 0.25 * hash(i * 1.9), 0]));     // asse: verso l'esterno e un po' in basso (gravità)
        const t1 = v.nrm(v.cross(ax, Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t2 = v.cross(ax, t1);
        const turns = 1.15 + hash(i * 3.1) * 0.55, ph = hash(i * 5.7) * 6.283, dirn = hash(i * 2.2) < 0.5 ? 1 : -1;
        const len = 0.115 * k, R0 = 0.029 * k, tr = 0.02 * k;
        const path = [], rad = [];
        for (let j = 0; j < NP; j++) {
          const u = j / (NP - 1), R = R0 * Math.min(1, u * 5) * (1 - 0.35 * u), an = ph + dirn * u * turns * 6.283;
          const hgt = -0.012 + len * u;
          path.push([P[0] + ax[0] * hgt + (t1[0] * Math.cos(an) + t2[0] * Math.sin(an)) * R, P[1] + ax[1] * hgt + (t1[1] * Math.cos(an) + t2[1] * Math.sin(an)) * R, P[2] + ax[2] * hgt + (t1[2] * Math.cos(an) + t2[2] * Math.sin(an)) * R]);
          rad.push(tr * (1.15 - 0.55 * u * u));
        }
        parts[i % 5 === 0 ? 2 : i % 2 === 0 ? 1 : 0].push(sweep(path, rad, RAD));
      }
      CURL = parts.map((list) => {
        let nv = 0, ni = 0; for (const g of list) { nv += g.pos.length; ni += g.idx.length; }
        const pos = new Float32Array(nv), nor = new Float32Array(nv), idx = new Uint32Array(ni); let po = 0, io = 0;
        for (const g of list) { pos.set(g.pos, po); nor.set(g.nor, po); for (let q = 0; q < g.idx.length; q++) idx[io + q] = g.idx[q] + po / 3; po += g.pos.length; io += g.idx.length; }
        return up({ pos, nor, idx });
      });
      return CURL;
    };
    const hairSt = { p: null, t: 0 };
    // mani: dita e pollice come capsule fuse in una sola geometria dinamica per mano (15 segmenti, indici fissi)
    const FT = BD.fing, FN = FT.pos.length, FI = FT.idx.length, FV = FN / 3, NSEG = 15;
    const mkHand = () => {
      const pos = new Float32Array(NSEG * FN), nor = new Float32Array(NSEG * FN), idx = new Uint32Array(NSEG * FI);
      for (let k = 0; k < NSEG; k++) for (let i = 0; i < FI; i++) idx[k * FI + i] = FT.idx[i] + k * FV;
      return { pos, nor, idx, n: 0, geo: upload(gl, { pos, nor, idx }, true) };
    };
    const HANDS = { R: mkHand(), L: mkHand() };
    function addCap(hg, A, B2, r) {
      const k = hg.n++; if (k >= NSEG) return;
      const d = v.sub(B2, A), L = v.len(d) || 1e-6, yn = v.mul(d, 1 / L), ref = Math.abs(yn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const xn = v.nrm(v.cross(ref, yn)), zn = v.cross(xn, yn), o = k * FN;
      for (let i = 0; i < FN; i += 3) {
        const x = FT.pos[i] * r, y = FT.pos[i + 1], z = FT.pos[i + 2] * r;
        hg.pos[o + i] = A[0] + xn[0] * x + d[0] * y + zn[0] * z; hg.pos[o + i + 1] = A[1] + xn[1] * x + d[1] * y + zn[1] * z; hg.pos[o + i + 2] = A[2] + xn[2] * x + d[2] * y + zn[2] * z;
        const nx = FT.nor[i], ny = FT.nor[i + 1], nz = FT.nor[i + 2];
        let X = L * (xn[0] * nx + zn[0] * nz) + r * yn[0] * ny, Y = L * (xn[1] * nx + zn[1] * nz) + r * yn[1] * ny, Z = L * (xn[2] * nx + zn[2] * nz) + r * yn[2] * ny;
        const l = Math.hypot(X, Y, Z) || 1; hg.nor[o + i] = X / l; hg.nor[o + i + 1] = Y / l; hg.nor[o + i + 2] = Z / l;
      }
    }
    function flushHand(hg) {
      for (let k = hg.n; k < NSEG; k++) hg.pos.fill(0, k * FN, (k + 1) * FN);
      gl.bindVertexArray(hg.geo.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, hg.geo.bp); gl.bufferSubData(gl.ARRAY_BUFFER, 0, hg.pos);
      gl.bindBuffer(gl.ARRAY_BUFFER, hg.geo.bn); gl.bufferSubData(gl.ARRAY_BUFFER, 0, hg.nor);
      gl.bindVertexArray(null);
    }

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
      const SW = 0.362 * B.w;
      const sh_ = { R: M.pt(torsoM, [-SW, 1.07, 0]), L: M.pt(torsoM, [SW, 1.07, 0]) };
      const hd = P.head || [0, 0, 0];
      const headM = M.chain(torsoM, M.T(0, 1.44, 0), M.Ry(hd[0]), M.Rx(hd[1]), M.Rz(hd[2]), M.T(0, 0.27, 0), M.S(HS));
      const hc = M.pt(headM, [0, 0, 0]);
      const J = { hip: hipW, hands: {}, grip: {}, head: M.pt(RM, hc), RM, torsoM, headM, pelvisM };
      const toW = (p) => M.pt(RM, p);

      /* gambe */
      const fwd = [Math.sin(P.yaw), 0, Math.cos(P.yaw)];
      const rT = 0.19 * B.leg, rC = 0.135 * B.leg, gK = OF.legK, ez = 1.04 + 0.16 * Math.max(0, gK - 1);
      const flexOf = (A, E, H) => cl((1 - v.dot(v.nrm(v.sub(E, A)), v.nrm(v.sub(H, E)))) * 1.7);
      const feetW = [];
      [{ sd: -1, a: P.aR, y: P.fyR || 0, p: P.fpR || 0 }, { sd: 1, a: P.aL, y: P.fyL || 0, p: P.fpL || 0 }].forEach((f) => {
        const hp = M.pt(pelvisM, [f.sd * 0.15 * B.hip, -0.02, 0]);
        const ankle = toL(f.a);
        const { E, H, p: kp } = ik2(hp, ankle, 0.98, 0.92, P.kneePole ? v.add(P.kneePole, [0, 0, f.sd * 0.25]) : v.add(fwd, [f.sd * 0.12, 0, 0]));
        const zb = v.mul(kp, -1), kb = flexOf(hp, E, H);   // z+ = dietro il ginocchio
        const Lc = OF.legL * 1.9, f1 = cl(Lc / 0.98), f2 = cl((Lc - 0.98) / 0.92);
        bm0(BG.thigh, boneQ(hp, v.add(hp, v.mul(v.sub(E, hp), 1.03)), rT, zb), skin, MS); bm0(BG.calf, boneQ(E, H, rC, zb), skin, MS);   // la coscia scende un po' sul polpaccio: niente fessura all'articolazione
        bm0(BG.sph, M.chain(M.T(E[0], E[1], E[2]), M.S(rT * 0.58)), skin, MS); // ginocchio (un poco più piccola dell'estremità dei segmenti: se i raggi coincidono le due superfici litigano e fanno la scalloppatura)
        if (OF.bot && f1 > 0.02) {
          bm0(BG.thigh, boneQ(hp, v.add(hp, v.mul(v.sub(E, hp), 1.03)), rT * ez, zb), OF.bot, GM(kb, f1 >= 0.999 ? f1 : f1 / 1.03));
          if (f2 > 0.02) { bm0(BG.sph, M.chain(M.T(E[0], E[1], E[2]), M.S(rT * 0.58 * ez)), OF.bot, MC); bm0(BG.calf, boneQ(E, H, rC * ez * 1.04, zb), OF.bot, GM(kb, f2)); }
        }
        // piede: scarpa da ginnastica (suola, tomaia, puntale, tallone, lacci, righe) oppure a piedi nudi / calzino
        const fm = M.chain(M.T(ankle[0], ankle[1], ankle[2]), M.Ry(f.y), M.Rx(-f.p), M.T(0, -0.035, 0.075));
        const SH = BG.shoe, sk = OF.sock || skin;
        if (OF.bare > 0.5) {
          const fb = M.mul(fm, M.chain(M.T(0, -0.05, -0.005), M.S(0.94, 0.9, 0.98)));
          bm0(SH.upper, fb, sk, MC); bm0(SH.toe, fb, sk, MC);
          bm0(BG.collar, M.mul(fm, M.chain(M.T(0, 0.118, -0.095), M.S(0.078, 0.06, 0.088))), sk, MC);
        } else {
          bm0(SH.sole, fm, OF.sole, MSOLE); bm0(SH.upper, fm, OF.shoe, ML);
          if (!lod) {
            bm0(SH.toe, fm, mixc(OF.shoe, [0.8, 0.8, 0.78], 0.32), ML);
            bm0(SH.heel, fm, OF.shoeAcc || mixc(OF.shoe, [0, 0, 0], 0.28), ML);
            bm0(BG.collar, M.mul(fm, M.chain(M.T(0, 0.118, -0.095), M.S(0.089, 0.1, 0.098))), OF.shoe, MC);
            bm0(BG.tongue, fm, mixc(OF.shoe, [0.9, 0.9, 0.88], 0.1), MC);
            bm0(BG.laces, fm, mixc(OF.shoe, [0.95, 0.95, 0.92], 0.7), MC);
            bm0(BG.stripes, fm, PAL.pink, ML);
          }
        }
        const fc = M.pt(fm, [0, 0, 0]), fw = toW(fc); feetW.push({ x: fw[0], z: fw[2], y: toW(ankle)[1], yaw: f.y });
      });
      if (X.contact) {
        feetW.forEach((q) => { const lift = cl(1 - (q.y - 0.14 * hs) / 0.55); if (lift > 0.02) X.contact(q.x, q.z, 0.4 * hs, 0.86 * hs, 0.5 * lift, q.yaw, 0.012); });
        const cx = (feetW[0].x + feetW[1].x) / 2, cz = (feetW[0].z + feetW[1].z) / 2, sp = Math.hypot(feetW[0].x - feetW[1].x, feetW[0].z - feetW[1].z);
        const dl = cl(1 - (Math.max(feetW[0].y, feetW[1].y) - 0.14 * hs) / 1.2);
        if (dl > 0.02) X.contact(cx, cz, (sp + 0.95) * hs, 1.25 * hs, 0.34 * dl, P.yaw, 0.01);
      }
      /* bacino, tronco e maglia */
      const pgm = GM(0, 9);
      bm0(BG.pelvis, M.mul(pelvisM, M.S(B.hip, 1, B.torso)), OF.bot || skin, OF.bot ? pgm : MS);
      bm0(BG.torso, M.mul(torsoM, M.S(B.w, br, B.torso)), skin, MS);
      bm0(shirtG, M.mul(torsoM, M.S(B.w, br, B.torso)), OF.top, GM(0, 9));
      if (spec.logo && !lod) { // chevron arancio del marchio sul petto
        const lg = spec.logo, ly = lg[1], zf = (ly < 1 ? lerp(0.215, 0.228, cl((ly - 0.85) / 0.15)) : lerp(0.228, 0.2, cl((ly - 1) / 0.1))) + 0.032;
        [1, -1].forEach((s2) => bm0(G.box, M.mul(torsoM, M.chain(M.T(lg[0] * B.w, ly + s2 * 0.028, zf * B.torso), M.Rz(s2 * -0.75), M.S(0.07, 0.016, 0.01))), PAL.pink, soft));
      }
      /* collo, testa */
      const rn = 0.118 * Math.sqrt(B.w), tz = [torsoM[8], torsoM[9], torsoM[10]];
      bm0(BG.neck, boneQ(M.pt(torsoM, [0, 1.14, 0.0]), M.pt(headM, [0, -0.2, 0.025]), rn, tz), skin, MS);
      { const ck = smoothstep(0.08, 0.38, OF.sleeveL);        // il colletto c'è solo nelle maglie con le maniche (e compare piano nei cambi d'abito)
        if (ck > 0.02) bm0(BG.collar, M.mul(torsoM, M.chain(M.T(0, 1.295, 0.0), M.S(0.138 * Math.sqrt(B.w), 0.1 * ck, 0.128 * B.torso))), mixc(OF.top, [0, 0, 0], 0.12), MC); }
      bm0(AG.head, M.mul(headM, M.S(1, 1, 1.06)), skin, { ...MS, spec: 0.18, shin: 26 });
      [-1, 1].forEach((s2) => bm0(G.sphere, M.mul(headM, M.chain(M.T(s2 * 0.312, -0.02, 0.0), M.Ry(s2 * 0.3), M.S(0.034, 0.068, 0.05))), skin, MS));
      if (!lod || o.face) { const hm = M.mul(RM, headM), fk = spec.face, hp = HAIR.kind === 'bald' ? null : HAIR.col; const sd = spec.seed || 0, smile = P.smile ?? (0.3 + 0.12 * Math.sin(t * 0.5 + sd)), per = 3.6 + hash(sd * 2.3) * 2.4, bt = (t + sd * 3.7) % per, blink = bt < 0.2 && !X.portrait ? Math.pow(Math.sin(bt / 0.2 * Math.PI), 0.7) : 0; later(() => drawFace(fk, hm, hp, [smile, blink])); }
      /* capelli */
      const hcol = HAIR.col, hhi = HAIR.hi;
      if (HAIR.kind !== 'bald') {
        const CAP = capFor(HAIR.kind), MHC = { ...MH, spec: HAIR.kind === 'buzz' ? 0.1 : 0.26, shin: 26 };
        { const cc = HAIR.kind === 'curly' ? mixc(hcol, [0, 0, 0], 0.4) : hcol; bm0(CAP.L, headM, cc, MHC); bm0(CAP.R, headM, cc, MHC); }
        if (HAIR.kind === 'afro') bm0(G.sphere, M.mul(headM, M.chain(M.T(0, 0.14, -0.1), M.S(0.46, 0.43, 0.44))), hcol, { ...MH, spec: 0.12 });
        else if (HAIR.kind === 'curly' && !lod) {
          const cm = curlMeshes();
          bm0(cm[0], headM, hcol, { ...MH, spec: 0.16, shin: 22 }); bm0(cm[1], headM, mixc(hcol, hhi, 0.45), { ...MH, spec: 0.18, shin: 24 }); bm0(cm[2], headM, hhi, { ...MH, spec: 0.22, shin: 28 });
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
      const rA = 0.105 * B.arm, rF = 0.088 * B.arm, HSC = 1.1 * Math.sqrt(B.arm), se = 1.085;
      [{ sd: -1, key: 'R', t: P.hR, pole: P.eR || [-1, -0.3, -0.4], n: P.nR || [1, 0, 0.2], c: P.cR || [0.4, 0.4, 0.4] },
       { sd: 1, key: 'L', t: P.hL, pole: P.eL || [1, -0.3, -0.4], n: P.nL || [-1, 0, 0.2], c: P.cL || [0.4, 0.4, 0.4] }].forEach((h) => {
        const A = sh_[h.key], { E, H, p: ep } = ik2(A, toL(h.t), 0.66, 0.62, h.pole);
        const zb = v.mul(ep, -1), eb = flexOf(A, E, H);
        const dd = v.mul(v.nrm(v.sub(A, M.pt(torsoM, [0, 1.06, 0]))), 0.012), dc = v.add(A, [dd[0], dd[1] + 0.012, dd[2]]);
        bm0(BG.sph, M.chain(M.T(dc[0], dc[1], dc[2]), M.S(rA * 0.92)), skin, MS); // deltoide
        bm0(BG.uarm, boneQ(A, v.add(A, v.mul(v.sub(E, A), 1.03)), rA, zb), skin, MS);
        bm0(BG.farm, boneQ(E, H, rF, zb), skin, MS);
        bm0(BG.sph, M.chain(M.T(E[0], E[1], E[2]), M.S(rF * 0.76)), skin, MS);
        const olc = v.add(E, v.mul(ep, 0.055 * B.arm)); if (eb > 0.25) bm0(BG.sph, M.chain(M.T(olc[0], olc[1], olc[2]), M.S(0.05 * B.arm)), skin, MS); // gomito che sporge
        const Lc = OF.sleeveL * 1.28, fu = cl(Lc / 0.66), ff = cl((Lc - 0.66) / 0.62);
        if (fu > 0.02) {
          bm0(BG.sph, M.chain(M.T(dc[0], dc[1], dc[2]), M.S(rA * 0.92 * se)), sleeveC, MC);
          bm0(BG.uarm, boneQ(A, v.add(A, v.mul(v.sub(E, A), 1.03)), rA * se, zb), sleeveC, GM(eb, fu >= 0.999 ? fu : fu / 1.03));
          if (ff > 0.02) {
            bm0(BG.sph, M.chain(M.T(E[0], E[1], E[2]), M.S(rF * 0.76 * se)), sleeveC, MC);
            bm0(BG.farm, boneQ(E, H, rF * se, zb), sleeveC, GM(eb, ff));
          }
        }
        J.hands[h.key] = toW(H);
        const fd = v.nrm(v.sub(H, E)); J.grip[h.key] = toW(v.add(H, v.mul(fd, 0.2)));
        if (spec.watch && h.key === 'L') bm0(AG.tube, boneM(v.mix(E, H, 0.85), v.mix(E, H, 0.93), 0.066 * B.arm), [0.08, 0.08, 0.1], ML);
        let zz = v.sub(h.n, v.mul(fd, v.dot(h.n, fd))); if (v.len(zz) < 1e-3) zz = [0, 0, 1]; zz = v.nrm(zz);
        const hm = basis(H, v.mul(v.cross(fd, zz), HSC), v.mul(fd, HSC), v.mul(zz, HSC));
        const c = h.c;
        if (lod) { // mano semplice: palma, dita unite, pollice
          bm0(G.sphere, M.mul(hm, M.chain(M.T(0, 0.13, 0), M.S(0.062, 0.13 - 0.04 * c[1], 0.036))), skin, MS);
        } else {
          bm0(BG.palm, hm, skin, MS);
          const hg = HANDS[h.key], sd = h.sd, hp = (a) => M.pt(hm, a), cap = (A2, B2, r) => addCap(hg, hp(A2), hp(B2), r * HSC);
          hg.n = 0;
          // quattro dita a tre falangi: la curvatura cresce verso la punta, un po' di ventaglio quando sono aperte
          const fingers = [[sd * 0.047, 0.19, [0.075, 0.054, 0.045], 0.0205, c[0], 0.07 * sd], [sd * 0.016, 0.2, [0.083, 0.06, 0.048], 0.021, c[1], 0.0], [-sd * 0.016, 0.196, [0.077, 0.056, 0.046], 0.0195, c[1] + 0.05, -0.05 * sd], [-sd * 0.046, 0.186, [0.06, 0.044, 0.04], 0.0165, c[1] + 0.1, -0.12 * sd]];
          fingers.forEach(([x0, y0, len, r, cv, spl]) => {
            let q = [x0, y0, 0.002], ang = 0; const ks = [0.9, 1.15, 0.8], sp = spl * (1 - 0.5 * Math.min(1, cv));
            for (let i = 0; i < 3; i++) {
              ang += cv * ks[i] + (i === 0 ? 0.06 : 0.05);
              const q2 = [q[0] + Math.sin(sp) * Math.cos(ang) * len[i], q[1] + Math.cos(sp) * Math.cos(ang) * len[i], q[2] + Math.sin(ang) * len[i]];
              cap(q, q2, r * (1 - 0.1 * i)); q = q2;
            }
          });
          // pollice: dal cuscinetto del palmo, si chiude verso le dita con th
          const th = c[2], to = [[0.62, 0.74, 0.14], [0.55, 0.8, 0.2], [0.5, 0.84, 0.2]], tc = [[0.45, 0.7, 0.5], [-0.1, 0.55, 0.82], [-0.55, 0.3, 0.78]], tl = [0.07, 0.062, 0.05], tr = [0.0245, 0.022, 0.0195];
          let q = [sd * 0.046, 0.04, 0.014];
          for (let i = 0; i < 3; i++) {
            const dv = v.nrm([lerp(to[i][0], tc[i][0], th) * sd, lerp(to[i][1], tc[i][1], th), lerp(to[i][2], tc[i][2], th)]);
            const q2 = v.add(q, v.mul(dv, tl[i])); cap(q, q2, tr[i]); q = q2;
          }
          flushHand(hg);
          bm0(hg.geo, M.id(), skin, MS);
        }
      });
      return J;
    }
    return { draw, spec };
  }

  return { createPerson, loadFaces, FACES, AG };
}
