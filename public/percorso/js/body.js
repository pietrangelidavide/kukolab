// Forme del corpo: sezioni anatomiche "lofted" (una serie di sezioni ellittiche lungo un asse) invece di semplici solidi di rivoluzione.
// Ogni sezione ha larghezza (rx), profondità davanti/dietro (rzp, rzn) e uno scarto (ox, oz); n > 2 la rende più squadrata (petto, bacino).
// Per gli arti l'asse y va da 0 (articolazione a monte) a 1 (a valle). z+ è il lato "interno" dell'articolazione (dietro il ginocchio,
// piega del gomito), z- il lato esterno (rotula, gomito): così quadricipite, polpaccio, bicipite e avambraccio hanno la loro forma
// e le pieghe dei vestiti cadono dal lato giusto. Le geometrie si costruiscono una volta sola, poi si dispongono con una matrice.
import { M } from './gl.js';
import { sphere, torus } from './engine.js';

const TAU = Math.PI * 2;
const spow = (x, e) => Math.sign(x) * Math.pow(Math.abs(x), e);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// se i triangoli guardano all'interno rispetto alle normali, li giro
export function orient(g) {
  const { pos, nor, idx } = g; let s = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    s += nx * (nor[a] + nor[b] + nor[c]) + ny * (nor[a + 1] + nor[b + 1] + nor[c + 1]) + nz * (nor[a + 2] + nor[b + 2] + nor[c + 2]);
  }
  if (s < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  return g;
}

// secs: [{ y, rx, rz | rzp,rzn, ox, oz, n }]; restituisce { pos, nor, idx } con normali morbide
export function loft(secs, nu = 28) {
  const ns = secs.length, w = nu + 1, P = new Float32Array(ns * w * 3), N = new Float32Array(ns * w * 3), idx = [];
  const rad = new Float32Array(ns * w * 2);
  for (let i = 0; i < ns; i++) {
    const s = secs[i], e = 2 / (s.n || 2);
    for (let j = 0; j <= nu; j++) {
      const a = (j / nu) * TAU, c = Math.cos(a), sn = Math.sin(a);
      const rz = sn >= 0 ? (s.rzp ?? s.rz ?? 0) : (s.rzn ?? s.rz ?? 0);
      const dx = (s.rx || 0) * spow(c, e), dz = rz * spow(sn, e), o = (i * w + j) * 3;
      P[o] = (s.ox || 0) + dx; P[o + 1] = s.y; P[o + 2] = (s.oz || 0) + dz;
      rad[(i * w + j) * 2] = dx; rad[(i * w + j) * 2 + 1] = dz;
    }
  }
  const at = (i, j) => (Math.max(0, Math.min(ns - 1, i)) * w + ((j % nu) + nu) % nu) * 3;
  for (let i = 0; i < ns; i++) for (let j = 0; j <= nu; j++) {
    const a = at(i, j - 1), b = at(i, j + 1), c = at(i - 1, j), d = at(i + 1, j);
    const du = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], dv = [P[d] - P[c], P[d + 1] - P[c + 1], P[d + 2] - P[c + 2]];
    let n = cross(dv, du); const l = Math.hypot(n[0], n[1], n[2]);
    const o = (i * w + j) * 3;
    if (l < 1e-9) n = [0, i < ns / 2 ? -1 : 1, 0];
    else {
      n = [n[0] / l, n[1] / l, n[2] / l];
      const rr = (i * w + j) * 2; if (n[0] * rad[rr] + n[2] * rad[rr + 1] < 0 && Math.hypot(rad[rr], rad[rr + 1]) > 1e-5) n = [-n[0], -n[1], -n[2]];
    }
    N[o] = n[0]; N[o + 1] = n[1]; N[o + 2] = n[2];
  }
  for (let i = 0; i < ns - 1; i++) for (let j = 0; j < nu; j++) { const a = i * w + j, b = a + 1, c = a + w, d = c + 1; idx.push(a, c, b, b, c, d); }
  return orient({ pos: P, nor: N, idx: new Uint32Array(idx) });
}

// porta una geometria in un altro sistema con una matrice 4x4 (le normali con la cofattrice della parte 3x3)
export function xform(g, m) {
  const pos = new Float32Array(g.pos.length), nor = new Float32Array(g.nor.length);
  const a0 = [m[0], m[1], m[2]], a1 = [m[4], m[5], m[6]], a2 = [m[8], m[9], m[10]], c0 = cross(a1, a2), c1 = cross(a2, a0), c2 = cross(a0, a1);
  for (let i = 0; i < pos.length; i += 3) {
    const x = g.pos[i], y = g.pos[i + 1], z = g.pos[i + 2];
    pos[i] = m[0] * x + m[4] * y + m[8] * z + m[12]; pos[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; pos[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    const nx = g.nor[i], ny = g.nor[i + 1], nz = g.nor[i + 2];
    let X = c0[0] * nx + c1[0] * ny + c2[0] * nz, Y = c0[1] * nx + c1[1] * ny + c2[1] * nz, Z = c0[2] * nx + c1[2] * ny + c2[2] * nz;
    const l = Math.hypot(X, Y, Z) || 1; nor[i] = X / l; nor[i + 1] = Y / l; nor[i + 2] = Z / l;
  }
  return { pos, nor, idx: g.idx };
}
export function merge(list) {
  let np = 0, ni = 0; list.forEach((g) => { np += g.pos.length; ni += g.idx.length; });
  const pos = new Float32Array(np), nor = new Float32Array(np), idx = new Uint32Array(ni); let po = 0, io = 0;
  list.forEach((g) => { pos.set(g.pos, po); nor.set(g.nor, po); for (let k = 0; k < g.idx.length; k++) idx[io + k] = g.idx[k] + po / 3; po += g.pos.length; io += g.idx.length; });
  return { pos, nor, idx };
}

// interpola una tabella [t, valore...] con Catmull-Rom (t crescente)
function prof(tab, ts) {
  const n = tab.length, k = tab[0].length - 1, out = [];
  ts.forEach((t) => {
    let i = 0; while (i < n - 2 && t > tab[i + 1][0]) i++;
    const p0 = tab[Math.max(0, i - 1)], p1 = tab[i], p2 = tab[i + 1], p3 = tab[Math.min(n - 1, i + 2)];
    const u = (t - p1[0]) / ((p2[0] - p1[0]) || 1), u2 = u * u, u3 = u2 * u, r = [];
    for (let d = 1; d <= k; d++) r.push(0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * u + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * u2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * u3));
    out.push(r);
  });
  return out;
}

// arto: tab = [[t, rx, rz, oz], ...] con t in 0..1; le estremità sono chiuse da una calotta tonda alta cap (in frazione di lunghezza)
export function limb(tab, nu = 24, cap = 0.014, steps = 22) {
  const secs = [], ts = [];
  for (let i = 0; i <= steps; i++) ts.push(cap + (1 - 2 * cap) * (i / steps));
  const vals = prof(tab, ts), rounds = 4, F = vals[0], L = vals[vals.length - 1];
  for (let k = 0; k <= rounds; k++) { const a = (k / rounds) * Math.PI / 2, s = Math.sin(a); secs.push({ y: cap * (1 - Math.cos(a)), rx: F[0] * s, rz: F[1] * s, oz: F[2] * s }); }
  vals.forEach((v, i) => { if (i > 0 && i < vals.length - 1) secs.push({ y: ts[i], rx: v[0], rz: v[1], oz: v[2] }); });
  for (let k = rounds; k >= 0; k--) { const a = (k / rounds) * Math.PI / 2, s = Math.sin(a); secs.push({ y: 1 - cap * (1 - Math.cos(a)), rx: L[0] * s, rz: L[1] * s, oz: L[2] * s }); }
  const g = loft(secs, nu), w = nu + 1, ns = secs.length;
  // le calotte chiudono la geometria ma non devono cambiare la luce: la normale resta quella dell'anello pieno vicino, così tra due segmenti (coscia/polpaccio, braccio/avambraccio) non resta un anello scuro
  for (let i = 0; i < rounds; i++) for (let j = 0; j < w; j++) {
    const o = (i * w + j) * 3, s0 = (rounds * w + j) * 3, o2 = ((ns - 1 - i) * w + j) * 3, s1 = ((ns - 1 - rounds) * w + j) * 3;
    g.nor[o] = g.nor[s0]; g.nor[o + 1] = g.nor[s0 + 1]; g.nor[o + 2] = g.nor[s0 + 2];
    g.nor[o2] = g.nor[s1]; g.nor[o2 + 1] = g.nor[s1 + 1]; g.nor[o2 + 2] = g.nor[s1 + 2];
  }
  return g;
}

// geometria con l'asse di sviluppo z (come nelle scarpe): costruita lungo y e girata
function alongZ(g) {
  const pos = new Float32Array(g.pos.length), nor = new Float32Array(g.nor.length);
  for (let i = 0; i < pos.length; i += 3) { pos[i] = g.pos[i]; pos[i + 1] = g.pos[i + 2]; pos[i + 2] = g.pos[i + 1]; nor[i] = g.nor[i]; nor[i + 1] = g.nor[i + 2]; nor[i + 2] = g.nor[i + 1]; }
  return orient({ pos, nor, idx: Uint32Array.from(g.idx) });
}
// sezioni di scarpa: [z, mezza larghezza, quota in alto]; basso fisso. Sezione tondeggiante (n)
const shoeLoft = (pts, yb, n = 2.3, nu = 22, grow = 0) => alongZ(loft([{ y: pts[0][0] - 0.004, rx: 0, rz: 0, oz: (pts[0][2] + yb) / 2 }].concat(
  pts.map(([z, rx, top]) => ({ y: z, rx: rx + grow, rz: Math.max(0.004, (top - yb) / 2 + grow), oz: (top + yb) / 2, n })),
  [{ y: pts[pts.length - 1][0] + 0.006, rx: 0, rz: 0, oz: (pts[pts.length - 1][2] + yb) / 2 }]), nu));

// pezzi del corpo; unità: gli arti hanno raggio di riferimento 1 (si scalano con boneM/boneQ), il tronco è in unità di scena
export function makeBody() {
  const B = {};
  // coscia: più larga in alto, quadricipite davanti (z-) e bicipite femorale dietro, si stringe sul ginocchio
  B.thigh = limb([[0, 0.8, 0.84, 0.03], [0.1, 0.97, 0.98, 0.02], [0.3, 1.02, 1.04, -0.01], [0.52, 0.94, 0.99, -0.03], [0.74, 0.8, 0.84, -0.01], [0.92, 0.7, 0.72, 0.01], [1, 0.68, 0.68, 0.02]], 28, 0.004);
  // polpaccio: il gemello bombato dietro (z+), la tibia più piatta davanti, caviglia sottile
  B.calf = limb([[0, 0.94, 0.94, 0.01], [0.1, 0.98, 1.0, 0.05], [0.26, 1.0, 1.1, 0.1], [0.42, 0.92, 1.02, 0.08], [0.66, 0.72, 0.78, 0.04], [0.88, 0.58, 0.6, 0.02], [1, 0.58, 0.58, 0.02]], 26, 0.004);
  // braccio: deltoide in alto, bicipite sul lato interno (z+), tricipite, gomito
  B.uarm = limb([[0, 0.94, 0.98, 0], [0.1, 1.1, 1.06, 0.02], [0.26, 1.03, 1.06, 0.05], [0.5, 0.95, 1.04, 0.06], [0.78, 0.82, 0.88, 0.04], [1, 0.74, 0.76, 0.02]], 26, 0.004);
  // avambraccio: il muscolo vicino al gomito, poi si assottiglia al polso (che è più piatto)
  B.farm = limb([[0, 0.9, 0.94, 0.01], [0.14, 1.04, 1.02, 0.03], [0.3, 1.04, 0.98, 0.03], [0.62, 0.8, 0.76, 0.01], [0.9, 0.64, 0.54, 0], [1, 0.62, 0.52, 0]], 24, 0.004);
  // collo: svasato alla base (trapezio), poi il cilindro del collo
  B.neck = limb([[0, 1.62, 1.38, 0], [0.18, 1.2, 1.1, 0], [0.5, 0.98, 1.0, 0], [0.85, 0.96, 1.02, 0], [1, 1.0, 1.04, 0]], 26, 0.03);
  // tronco: bacino, vita, costole larghe, petto, trapezio che scende verso la spalla. [y, rx, davanti, dietro, squadratura]
  const T = [[-0.04, 0.3, 0.19, 0.185, 2.1], [0.05, 0.315, 0.2, 0.2, 2.2], [0.22, 0.29, 0.185, 0.18, 2.2], [0.45, 0.272, 0.172, 0.16, 2.15], [0.65, 0.3, 0.19, 0.16, 2.25],
    [0.85, 0.35, 0.215, 0.168, 2.4], [1.0, 0.385, 0.228, 0.172, 2.4], [1.1, 0.388, 0.21, 0.162, 2.3], [1.18, 0.352, 0.18, 0.148, 2.15], [1.235, 0.28, 0.145, 0.126, 2.05], [1.275, 0.2, 0.115, 0.105, 2], [1.305, 0.125, 0.092, 0.09, 2], [1.325, 0.085, 0.08, 0.08, 2]];
  // sagoma del bacino (rx, davanti, dietro) per quota: la maglia deve restare fuori dai pantaloni, con un orlo che li copre, altrimenti le due superfici si intersecano di striscio e il bordo viene a dente di sega
  const HIPS = [[-0.1, 0.335, 0.22, 0.205], [-0.08, 0.345, 0.225, 0.21], [-0.02, 0.318, 0.2, 0.185], [0.03, 0.285, 0.18, 0.168], [0.075, 0.23, 0.15, 0.14], [0.115, 0, 0, 0]];
  const hipAt = (y) => { if (y <= HIPS[0][0]) return HIPS[0].slice(1); for (let i = 1; i < HIPS.length; i++) if (y <= HIPS[i][0]) { const a = HIPS[i - 1], b = HIPS[i], u = (y - a[0]) / (b[0] - a[0]); return [1, 2, 3].map((k) => a[k] + (b[k] - a[k]) * u); } return [0, 0, 0]; };
  const tsecs = (ease, lo = -0.06, over = 0, hr = 1) => {   // hr = larghezza dei fianchi / larghezza del busto della persona (la maglia è scalata sul busto, i pantaloni sui fianchi)
    const out = [{ y: lo - 0.004, rx: 0, rzp: 0, rzn: 0 }, over ? { y: lo, rx: hipAt(lo)[0] * hr + over, rzp: hipAt(lo)[1] + over, rzn: hipAt(lo)[2] + over, n: 2.45 } : { y: lo, rx: T[0][1] * 0.7 + ease, rzp: T[0][2] * 0.7 + ease, rzn: T[0][3] * 0.7 + ease, n: 2 }];
    T.forEach(([y, rx, p, n, e]) => { const h = over ? hipAt(y) : [0, 0, 0]; out.push({ y, rx: Math.max(rx + ease, h[0] * hr + over), rzp: Math.max(p + ease, h[1] + over), rzn: Math.max(n + ease, h[2] + over), n: over && y < 0.1 ? Math.max(e, 2.45) : e }); });
    out.push({ y: T[T.length - 1][0] + 0.02, rx: 0, rzp: 0, rzn: 0 });
    return out;
  };
  B.torso = loft(tsecs(0), 40);
  B.shirt = loft(tsecs(0.026, -0.1, 0.04), 40);
  B.shirtFor = (hr) => loft(tsecs(0.026, -0.1, 0.04, hr), 40);
  // bacino con i pantaloni (nel sistema del bacino): dalla vita all'inguine
  B.pelvis = loft([{ y: -0.26, rx: 0.0, rzp: 0.0, rzn: 0.0 }, { y: -0.25, rx: 0.12, rzp: 0.12, rzn: 0.12, n: 2 }, { y: -0.2, rx: 0.27, rzp: 0.2, rzn: 0.19, n: 2.3 }, { y: -0.08, rx: 0.345, rzp: 0.225, rzn: 0.21, n: 2.4 }, { y: -0.02, rx: 0.318, rzp: 0.2, rzn: 0.185, n: 2.3 }, { y: 0.03, rx: 0.285, rzp: 0.18, rzn: 0.168, n: 2.2 }, { y: 0.075, rx: 0.23, rzp: 0.15, rzn: 0.14, n: 2.1 }, { y: 0.105, rx: 0.15, rzp: 0.1, rzn: 0.095, n: 2 }, { y: 0.115, rx: 0, rzp: 0, rzn: 0 }], 36);   // dentro la sagoma del busto sopra la vita: se i due volumi coincidono la maglia e i pantaloni litigano e il bordo viene a dente di sega
  // dito: capsula affusolata (y da 0 a 1, raggio 1 → 0.84)
  B.fing = limb([[0, 1, 1, 0], [1, 0.84, 0.84, 0]], 8, 0.2, 1);
  // palmo (nel sistema della mano: y lungo il braccio, x in larghezza, z verso il palmo): più stretto al polso, con il cuscinetto del pollice
  B.palm = loft([{ y: -0.03, rx: 0, rz: 0 }, { y: -0.02, rx: 0.044, rz: 0.03, oz: 0.0 }, { y: 0.03, rx: 0.056, rz: 0.034, oz: 0.004 }, { y: 0.11, rx: 0.066, rz: 0.036, oz: 0.004 }, { y: 0.17, rx: 0.07, rz: 0.03, oz: 0.0 }, { y: 0.205, rx: 0.066, rz: 0.022, oz: -0.002 }, { y: 0.215, rx: 0, rz: 0 }], 14);
  // scarpa sportiva (nel sistema del piede: z in avanti, y in su; la suola tocca il suolo a y = -0.088)
  const SB = -0.034;
  B.shoe = {
    upper: shoeLoft([[-0.25, 0.052, 0.09], [-0.2, 0.082, 0.136], [-0.13, 0.093, 0.152], [-0.06, 0.089, 0.128], [0.02, 0.093, 0.107], [0.12, 0.107, 0.088], [0.2, 0.108, 0.066], [0.255, 0.087, 0.044], [0.282, 0.046, 0.026]], SB, 2.2),
    sole: shoeLoft([[-0.262, 0.05, -0.034], [-0.22, 0.09, -0.023], [-0.12, 0.097, -0.03], [0, 0.1, -0.032], [0.1, 0.115, -0.032], [0.2, 0.123, -0.031], [0.26, 0.1, -0.026], [0.292, 0.05, -0.016]], -0.089, 2.8),
    toe: shoeLoft([[0.19, 0.1, 0.068], [0.23, 0.105, 0.059], [0.265, 0.083, 0.043], [0.289, 0.043, 0.027]], -0.046, 2.2, 22, 0.004),
    heel: shoeLoft([[-0.262, 0.05, 0.08], [-0.225, 0.082, 0.115], [-0.18, 0.093, 0.13], [-0.145, 0.093, 0.138]], -0.024, 2.2, 22, 0.004),
  };
  B.collar = torus(1, 0.2, 28, 8);
  // lacci (4 barre) e righe laterali, già al loro posto, in un'unica geometria
  const bar = limb([[0, 1, 1, 0], [1, 1, 1, 0]], 8, 0.3, 1);
  B.laces = merge([0.0, 0.045, 0.09, 0.135].map((z, q) => xform(bar, M.chain(M.T(0, 0.104 - q * 0.0055, z), M.Rx(-0.25), M.Rz(Math.PI / 2), M.S(0.008, 0.075, 0.0085), M.T(0, -0.5, 0)))));
  const sph = sphere(10);
  B.stripes = merge([-1, 1].map((sd) => xform(sph, M.chain(M.T(sd * 0.099, 0.0, 0.02), M.Ry(sd * 0.08), M.Rx(-0.2), M.S(0.007, 0.022, 0.11)))));
  B.tongue = xform(sph, M.chain(M.T(0, 0.122, -0.012), M.Rx(0.5), M.S(0.045, 0.014, 0.06)));
  B.sph = sph;
  return B;
}
