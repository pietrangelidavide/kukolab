// Il percorso: un unico corridoio lungo (hero con la porta → sala Personal → Pilates → Functional → finale) attraversato dal cliente.
// Tutto è una funzione di `pos` (0 → 6, la posizione nello scorrimento) e del tempo: scorrendo all'indietro la sequenza si riavvolge.
// Qui stanno: il cammino del cliente, le pose di tutti, le sale, i cancelli a lamelle e gli oggetti che orbitano e si trasformano.
import { addProps } from './props.js';
import { addPeople, v } from './people.js';

export const ZX = [0, 22, 46, 70, 94];                  // centro di hero, Personal, Pilates, Functional, finale
export const GATE = [11, 34, 58, 82];                   // cancelli a lamelle tra le sale
export const STEPS = 6;
const BZ = -7;                                          // parete di fondo

export async function addWorld(X) {
  const { gl, G, M, mesh, PAL, cl, lin, sm, lerp, eo, pop, mixc, hooks, T, quadFX, quadTex, glass } = X;
  const P = addProps(X);
  const { K, Mx, MATS } = X;
  const { STEEL, CHROME, BLACK, MATT, RUB, PAINT, WOOD, UPH, GLOSS } = MATS;
  const PE = addPeople(X);
  await PE.loadFaces(X.base, ['valerio', 'chiara', 'cliente', 'g1', 'g2', 'g3', 'g4', 'g5', ...(X.portrait ? ['calabro', 'osteo', 'fisio'] : [])]);
  const SK = X.visi || {};
  const sk = (k, d) => (SK[k] && SK[k].skin) || d;
  const eio = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const TAU = Math.PI * 2;
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  /* =============================== PERSONE =============================== */
  const OUT = {
    casual: { top: [0.9, 0.9, 0.87], sleeve: null, sleeveL: 0.4, bot: [0.16, 0.22, 0.36], legL: 2, legK: 1.9, shoe: [0.92, 0.92, 0.9], sole: [0.95, 0.95, 0.93], bare: 0 },
    pt: { top: [0.06, 0.06, 0.07], sleeve: null, sleeveL: 0.0, bot: [0.07, 0.07, 0.08], legL: 0.3, legK: 1.0, shoe: [0.08, 0.08, 0.09], sole: [0.9, 0.9, 0.88], bare: 0, shoeAcc: [0.91, 0.38, 0.14] },
    pil: { top: [0.88, 0.83, 0.74], sleeve: null, sleeveL: 1.0, bot: [0.4, 0.31, 0.28], legL: 2, legK: 0.0, shoe: [0.5, 0.4, 0.35], sole: [0.9, 0.87, 0.8], bare: 1, sock: [0.9, 0.87, 0.8] },
    fun: { top: [0.91, 0.38, 0.14], sleeve: null, sleeveL: 0.38, bot: [0.07, 0.07, 0.08], legL: 0.3, legK: 1.0, shoe: [0.93, 0.93, 0.9], sole: [0.12, 0.12, 0.13], bare: 0, shoeAcc: [0.07, 0.07, 0.08] },
  };
  const mixOut = (a, b, t) => ({
    top: mix3(a.top, b.top, t), sleeve: null, sleeveL: lerp(a.sleeveL, b.sleeveL, t), bot: mix3(a.bot, b.bot, t), legL: lerp(a.legL, b.legL, t), legK: lerp(a.legK, b.legK, t),
    shoe: mix3(a.shoe, b.shoe, t), sole: mix3(a.sole, b.sole, t), bare: t > 0.5 ? b.bare : a.bare, sock: t > 0.5 ? b.sock || a.sock : a.sock || b.sock, shoeAcc: (t > 0.5 ? b.shoeAcc : a.shoeAcc) || null,
  });
  const outfitAt = (pos) => {
    if (pos < 0.4) return OUT.casual;
    if (pos < 0.62) return mixOut(OUT.casual, OUT.pt, sm(0.4, 0.62, pos));
    if (pos < 1.6) return OUT.pt;
    if (pos < 2.4) return mixOut(OUT.pt, OUT.pil, sm(1.6, 2.4, pos));
    if (pos < 3.6) return OUT.pil;
    if (pos < 4.4) return mixOut(OUT.pil, OUT.fun, sm(3.6, 4.4, pos));
    return OUT.fun;
  };
  const client = PE.createPerson({ id: 'client', face: 'cliente', skin: sk('cliente', [0.93, 0.76, 0.66]), seed: 1, hair: { kind: 'short', col: [0.2, 0.13, 0.08], hi: [0.3, 0.2, 0.12] }, build: { w: 1.0, torso: 1.0, arm: 1.0, leg: 1.0, h: 1.0 } });
  const valerio = [0, 1].map(() => PE.createPerson({
    id: 'valerio', face: 'valerio', skin: sk('valerio', [0.85, 0.61, 0.51]), seed: 2, hair: { kind: 'curly', col: [0.045, 0.035, 0.03], hi: [0.12, 0.09, 0.07] },
    build: { w: 1.13, torso: 1.15, arm: 1.3, leg: 1.12, h: 1.02, hip: 1.0 }, logo: [0.2, 0.86], watch: true,
    outfit: { top: [0.035, 0.035, 0.04], sleeveL: 0.4, bot: [0.05, 0.05, 0.06], legL: 0.34, legK: 1.0, shoe: [0.06, 0.06, 0.07], sole: [0.92, 0.92, 0.9], shoeAcc: [0.91, 0.38, 0.14] },
  }));
  const chiara = [0, 1].map(() => PE.createPerson({
    id: 'chiara', face: 'chiara', skin: sk('chiara', [0.9, 0.66, 0.5]), seed: 3, hair: { kind: 'long', col: [0.36, 0.22, 0.13], hi: [0.62, 0.42, 0.22] },
    build: { w: 0.88, torso: 0.92, arm: 0.8, leg: 0.9, h: 0.95, hip: 1.12 }, logo: [0.18, 0.84],
    outfit: { top: [0.94, 0.93, 0.91], sleeve: [0.27, 0.15, 0.13], sleeveL: 1.0, bot: [0.27, 0.15, 0.13], legL: 2, legK: 0.0, shoe: [0.5, 0.4, 0.35], sole: [0.9, 0.87, 0.8], bare: 1, sock: [0.92, 0.89, 0.83] },
  }));
  const GS = [
    { face: 'g1', seed: 11, hair: { kind: 'pony', col: [0.08, 0.05, 0.04], hi: [0.16, 0.1, 0.08] }, build: { w: 0.9, torso: 0.95, arm: 0.85, leg: 0.95, h: 0.96, hip: 1.1 }, outfit: { top: [0.93, 0.93, 0.9], sleeveL: 0.0, bot: [0.08, 0.08, 0.1], legL: 2, legK: 0, shoe: [0.9, 0.9, 0.88], shoeAcc: [0.91, 0.38, 0.14] } },
    { face: 'g2', seed: 12, hair: { kind: 'bun', col: [0.5, 0.34, 0.18], hi: [0.6, 0.42, 0.24] }, build: { w: 0.88, torso: 0.92, arm: 0.8, leg: 0.92, h: 0.94, hip: 1.12 }, outfit: { top: [0.55, 0.62, 0.5], sleeveL: 0.38, bot: [0.12, 0.12, 0.14], legL: 0.3, legK: 0.2, shoe: [0.12, 0.12, 0.13], shoeAcc: [0.91, 0.38, 0.14] } },
    { face: 'g3', seed: 13, hair: { kind: 'buzz', col: [0.04, 0.03, 0.03], hi: [0.08, 0.06, 0.06] }, build: { w: 1.12, torso: 1.1, arm: 1.25, leg: 1.1, h: 1.04, hip: 1.0 }, outfit: { top: [0.08, 0.08, 0.1], sleeveL: 0.0, bot: [0.12, 0.14, 0.2], legL: 0.3, legK: 1.0, shoe: [0.92, 0.92, 0.9], shoeAcc: [0.91, 0.38, 0.14] } },
    { face: 'g4', seed: 14, hair: { kind: 'short', col: [0.22, 0.14, 0.08], hi: [0.3, 0.2, 0.12] }, build: { w: 1.04, torso: 1.05, arm: 1.1, leg: 1.04, h: 1.0, hip: 1.0 }, outfit: { top: [0.7, 0.72, 0.74], sleeveL: 0.4, bot: [0.07, 0.07, 0.08], legL: 0.3, legK: 1.0, shoe: [0.08, 0.08, 0.09], shoeAcc: [0.91, 0.38, 0.14] } },
    { face: 'g5', seed: 15, hair: { kind: 'afro', col: [0.05, 0.04, 0.04], hi: [0.1, 0.08, 0.08] }, build: { w: 0.94, torso: 1.0, arm: 0.9, leg: 1.0, h: 0.98, hip: 1.05 }, outfit: { top: [0.84, 0.76, 0.62], sleeveL: 0.4, bot: [0.1, 0.1, 0.12], legL: 2, legK: 0.2, shoe: [0.95, 0.95, 0.93], shoeAcc: [0.91, 0.38, 0.14] } },
  ].map((g) => ({ ...g, skin: sk(g.face, [0.8, 0.6, 0.5]) }));
  const group = GS.map((g) => PE.createPerson(g));
  const groupFin = GS.map((g) => PE.createPerson(g));

  /* ---------- helpers di posa ---------- */
  const rot = (a, l) => { const c = Math.cos(a.yaw), s = Math.sin(a.yaw); return [c * l[0] + s * l[2], l[1], -s * l[0] + c * l[2]]; };
  const Wp = (a, l) => { const r = rot(a, l); return [a.x + r[0], r[1], a.z + r[2]]; };
  const lookAtP = (a, from, to, k = 1) => {
    const d = v.sub(to, from), wrap = (q) => Math.atan2(Math.sin(q), Math.cos(q));
    const yw = wrap(Math.atan2(d[0], d[2]) - a.yaw), pt = Math.atan2(-d[1], Math.hypot(d[0], d[2]));
    return [cl(yw, -0.95, 0.95) * k, cl(pt, -0.6, 0.7) * k, 0];
  };
  function basePose(a, o = {}) {
    const hy = o.hipY ?? 2.0, st = o.stance ?? 0.24;
    return {
      root: [a.x, a.z], yaw: a.yaw, hip: Wp(a, [o.hx || 0, hy, o.hz || 0]), pitch: o.pitch || 0, lean: o.lean || 0, twist: o.twist || 0, roll: o.roll || 0, head: o.head || [0, 0, 0],
      hR: Wp(a, [-0.58, 1.05, 0.06]), hL: Wp(a, [0.58, 1.05, 0.06]), eR: rot(a, [-1, -0.25, -0.5]), eL: rot(a, [1, -0.25, -0.5]), nR: rot(a, [1, 0, 0.25]), nL: rot(a, [-1, 0, 0.25]),
      cR: [0.4, 0.45, 0.4], cL: [0.4, 0.45, 0.4],
      aR: Wp(a, [-st, 0.12, 0]), aL: Wp(a, [st, 0.12, 0]), fyR: a.yaw - 0.1, fyL: a.yaw + 0.1, fpR: 0, fpL: 0, breath: 0,
    };
  }
  const blendP = (A, B, k) => {
    if (k <= 0) return A; if (k >= 1) return B;
    const out = {};
    for (const key of Object.keys(A)) {
      const a = A[key], b = B[key];
      if (Array.isArray(a)) out[key] = a.map((x, j) => lerp(x, b[j], k));
      else if (typeof a === 'number') out[key] = lerp(a, b, k);
      else out[key] = k < 0.5 ? a : b;
    }
    if (B.kneePole && !A.kneePole) out.kneePole = B.kneePole;
    return out;
  };
  const standIdle = (a, t, o = {}) => {
    const P0 = basePose(a, o), s = Math.sin(t * 1.3 + (o.ph || 0));
    P0.hip[0] += rot(a, [s * 0.02, 0, 0])[0]; P0.roll = s * 0.01; P0.breath = 1;
    P0.head = o.head || [Math.sin(t * 0.5 + (o.ph || 0)) * 0.05, 0.02, 0];
    return P0;
  };
  // camminata: dist = metri percorsi (il passo segue la distanza, quindi si cammina scorrendo e il passo si riavvolge all'indietro)
  function walk(a, dist, amt, t, o = {}) {
    const P0 = standIdle(a, t, o), ph = dist * TAU / 3.5, w = amt;
    const side = (sd) => { const p = ph + (sd > 0 ? Math.PI : 0); return { f: Math.sin(p) * 0.9 * w, lift: Math.max(0, Math.cos(p)) * 0.5 * w, c: Math.sin(p) }; };
    const R = side(-1), L = side(1), st = o.stance ?? 0.22;
    P0.aR = Wp(a, [-st, 0.12 + R.lift, R.f]); P0.aL = Wp(a, [st, 0.12 + L.lift, L.f]);
    P0.fpR = -R.lift * 0.5; P0.fpL = -L.lift * 0.5; P0.fyR = a.yaw; P0.fyL = a.yaw;
    const bob = Math.abs(Math.sin(ph)) * 0.1 * w; P0.hip = Wp(a, [0, 2.0 - bob, 0]); P0.pitch = 0.05 * w;
    P0.hR = Wp(a, [-0.5, 1.05 + Math.abs(R.c) * 0.05, -R.c * 0.55 * w + 0.06]); P0.hL = Wp(a, [0.5, 1.05 + Math.abs(L.c) * 0.05, -L.c * 0.55 * w + 0.06]);
    P0.twist = -Math.sin(ph) * 0.12 * w; P0.cR = [0.5, 0.5, 0.4]; P0.cL = [0.5, 0.5, 0.4];
    return P0;
  }

  /* ---------- il cammino del cliente: posizione, direzione e distanza percorsa in funzione di pos ---------- */
  const SPOT = { pt: [19.4, 0.5], pil: [42.4, 1.7], fun: [69.4, 1.1], fin: [94, 0.9] };
  // tratti: [pos0, pos1, da, a]
  const SEGS = [
    [0.1, 0.3, [0, -4.2], [0, -0.4], 0.25], [0.3, 0.62, [0, -0.4], SPOT.pt, 0.55],
    [1.38, 2.62, SPOT.pt, SPOT.pil, 0.55], [3.38, 4.62, SPOT.pil, SPOT.fun, 0.55], [5.3, 5.8, SPOT.fun, SPOT.fin, 0.5],
  ];
  const easeW = (u, k) => lerp(u, u * u * (3 - 2 * u), k);
  function cpath(pos) {
    let x = 0, z = -4.2, d = 0, yaw = 0, moving = 0;
    let acc = 0;
    for (const [p0, p1, A, B, k] of SEGS) {
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
      if (pos >= p1) { acc += len; x = B[0]; z = B[1]; continue; }
      if (pos > p0) { const u = easeW((pos - p0) / (p1 - p0), k); x = lerp(A[0], B[0], u); z = lerp(A[1], B[1], u); acc += len * u; moving = 1; yaw = Math.atan2(B[0] - A[0], B[1] - A[1]); }
      else if (pos <= p0) { x = A[0]; z = A[1]; }
      break;
    }
    d = acc;
    // direzione: davanti (verso la camera) nel primo tratto, poi gira verso la sala successiva
    const heading = (p0, p1, yA, yB, pos2) => lerp(yA, yB, sm(p0, p1, pos2));
    if (pos < 0.3) yaw = 0; else if (pos < 0.62) yaw = heading(0.3, 0.4, 0, Math.PI / 2, pos);
    else if (pos < 1.38) yaw = 0.62;                                                      // verso Valerio, di tre quarti
    else if (pos < 1.5) yaw = heading(1.38, 1.5, 0.62, Math.PI / 2, pos);
    else if (pos < 2.62) yaw = Math.PI / 2;
    else if (pos < 3.38) yaw = Math.PI / 2;
    else if (pos < 3.5) yaw = Math.PI / 2;
    else if (pos < 4.62) yaw = Math.PI / 2;
    else if (pos < 5.3) yaw = 0.0;
    else if (pos < 5.65) yaw = heading(5.3, 5.4, 0, Math.PI / 2, pos);
    else yaw = heading(5.65, 5.85, Math.PI / 2, 0, pos);
    const walking = SEGS.some(([p0, p1]) => pos > p0 && pos < p1) ? 1 : 0;
    // al primo avvio: il cliente entra dalla porta (tempo)
    return { x, z, d, yaw, walking, moving };
  }
  const ptStand = (pos) => sm(0.56, 0.64, pos) * (1 - sm(1.36, 1.44, pos));
  void ptStand;

  /* ---------- esercizi ---------- */
  const handsGrip = (P0, c = 0.92) => { P0.cR = [c, c, 0.9]; P0.cL = [c, c, 0.9]; };
  // goblet squat con manubrio
  function squat(a, u, o = {}) {
    const hy = lerp(2.0, 1.2, u), hz = -0.55 * u, p = 0.6 * u;
    const P0 = basePose(a, { hipY: hy, hz, pitch: p, stance: 0.36 });
    P0.fyR = a.yaw - 0.28; P0.fyL = a.yaw + 0.28; P0.aR = Wp(a, [-0.36, 0.12, 0.0]); P0.aL = Wp(a, [0.36, 0.12, 0.0]);
    const chest = [0, hy + 0.95 * Math.cos(p) - 0.42 * Math.sin(p) + 0.0, hz + 0.95 * Math.sin(p) + 0.42 * Math.cos(p)];
    P0.hR = Wp(a, [-0.17, chest[1] - 0.12, chest[2] + 0.24]); P0.hL = Wp(a, [0.17, chest[1] - 0.12, chest[2] + 0.24]);
    P0.eR = rot(a, [-1, -0.9, -0.2]); P0.eL = rot(a, [1, -0.9, -0.2]); P0.nR = rot(a, [1, 0, 0.1]); P0.nL = rot(a, [-1, 0, 0.1]); handsGrip(P0, 0.9);
    P0.head = [o.hy || 0, -p * 0.7 + 0.04, 0]; P0.breath = 1;
    return P0;
  }
  // swing con kettlebell: u 0 (in basso, tra le gambe) → 1 (in alto, braccia tese davanti)
  function swing(a, u, o = {}) {
    const hy = lerp(1.5, 2.0, u), hz = lerp(-0.6, 0, u), p = lerp(0.95, 0.02, u);
    const P0 = basePose(a, { hipY: hy, hz, pitch: p, stance: 0.4 });
    P0.fyR = a.yaw - 0.3; P0.fyL = a.yaw + 0.3; P0.aR = Wp(a, [-0.4, 0.12, 0]); P0.aL = Wp(a, [0.4, 0.12, 0]);
    const bell = [0, lerp(1.0, 2.9, Math.pow(u, 0.8)), lerp(0.45, 1.75, Math.pow(u, 1.1))];
    P0.hR = Wp(a, [-0.1, bell[1], bell[2]]); P0.hL = Wp(a, [0.1, bell[1], bell[2]]);
    P0.eR = rot(a, [-0.3, -0.5, 0]); P0.eL = rot(a, [0.3, -0.5, 0]); P0.nR = rot(a, [1, 0, 0]); P0.nL = rot(a, [-1, 0, 0]); handsGrip(P0, 0.95);
    P0.head = [0, -p * 0.6, 0];
    P0.bell = Wp(a, [0, bell[1] - 0.45, bell[2] + 0.05]);
    return P0;
  }
  function ropes(a, t, ph) {
    const P0 = basePose(a, { hipY: 1.55, hz: -0.3, pitch: 0.38, stance: 0.42 });
    P0.fyR = a.yaw - 0.25; P0.fyL = a.yaw + 0.25; P0.aR = Wp(a, [-0.42, 0.12, 0]); P0.aL = Wp(a, [0.42, 0.12, 0]);
    const w = Math.sin(t * 9 + ph);
    P0.hR = Wp(a, [-0.5, 2.0 + w * 0.55, 1.15]); P0.hL = Wp(a, [0.5, 2.0 - w * 0.55, 1.15]);
    P0.eR = rot(a, [-1, -0.4, -0.2]); P0.eL = rot(a, [1, -0.4, -0.2]); handsGrip(P0, 0.95); P0.head = [0, -0.15, 0];
    return P0;
  }
  function jacks(a, t, ph) {
    const u = 0.5 - 0.5 * Math.cos(t * 5 + ph), hop = Math.abs(Math.sin(t * 5 + ph)) * 0.16;
    const P0 = basePose(a, { hipY: 2.0 + hop * 0.6, stance: lerp(0.18, 0.62, u) });
    P0.aR = Wp(a, [-lerp(0.2, 0.7, u), 0.12 + hop, 0]); P0.aL = Wp(a, [lerp(0.2, 0.7, u), 0.12 + hop, 0]);
    P0.hR = Wp(a, [-lerp(0.5, 1.0, u), lerp(1.0, 3.9, u), 0]); P0.hL = Wp(a, [lerp(0.5, 1.0, u), lerp(1.0, 3.9, u), 0]);
    P0.eR = rot(a, [-1, 0.3, -0.2]); P0.eL = rot(a, [1, 0.3, -0.2]); handsGrip(P0, 0.3);
    return P0;
  }
  function lunge(a, t, ph) {
    const u = 0.5 - 0.5 * Math.cos(t * 2.6 + ph), sw = Math.sin(t * 1.3 + ph) > 0 ? 1 : -1;
    const P0 = basePose(a, { hipY: lerp(2.0, 1.4, u), hz: 0, stance: 0.24, pitch: 0.05 });
    const f = lerp(0.2, 0.95, u), b = lerp(0.2, -0.95, u);
    P0.aR = Wp(a, [-0.25, 0.12, sw > 0 ? f : b]); P0.aL = Wp(a, [0.25, 0.12 + (sw > 0 ? 0.0 : 0), sw > 0 ? b : f]);
    P0.hR = Wp(a, [-0.3, 2.6, 0.45]); P0.hL = Wp(a, [0.3, 2.6, 0.45]); P0.eR = rot(a, [-1, -0.2, -0.2]); P0.eL = rot(a, [1, -0.2, -0.2]); handsGrip(P0, 0.9);
    return P0;
  }
  function boxJump(a, t, ph) { // saltello: piedi uniti, ginocchia piegate in atterraggio
    const c = (t * 2.2 + ph) % 1, air = Math.sin(Math.PI * Math.min(1, c / 0.55)) * (c < 0.55 ? 1 : 0), crouch = c < 0.55 ? 0 : Math.sin(Math.PI * (c - 0.55) / 0.45);
    const P0 = basePose(a, { hipY: 2.0 - crouch * 0.6 + air * 1.0, pitch: crouch * 0.3, stance: 0.2 });
    P0.aR = Wp(a, [-0.2, 0.12 + air * 1.4, 0]); P0.aL = Wp(a, [0.2, 0.12 + air * 1.4, 0]);
    P0.hR = Wp(a, [-0.45, 1.3 + air * 1.4 + crouch * 0.2, 0.7 - air * 0.7]); P0.hL = Wp(a, [0.45, 1.3 + air * 1.4 + crouch * 0.2, 0.7 - air * 0.7]);
    handsGrip(P0, 0.6); return P0;
  }

  /* ---------- reformer ---------- */
  const REF = { x: ZX[2] - 0.2, z: 0.4, Hy: 1.05, L: 6.4 };
  const refSlide = (t) => 0.34 + 0.3 * (0.5 - 0.5 * Math.cos(t * 1.5));     // 0,04–0,64: carrello tra piegato e disteso
  const refCarriage = (s) => REF.x + (REF.L / 2 - 1.9) + ((-REF.L / 2 + 2.9) - (REF.L / 2 - 1.9)) * s;
  function lying(t, pos) {
    const s = refSlide(t), cx = refCarriage(s), hipX = cx + 0.8, hipY = 2.12;
    const a = { x: hipX, z: REF.z, yaw: Math.PI / 2 };
    const P0 = basePose(a, {});
    P0.hip = [hipX, hipY, REF.z]; P0.yaw = Math.PI / 2; P0.pitch = -Math.PI / 2; P0.roll = 0; P0.lean = 0; P0.twist = 0;
    P0.root = [hipX, REF.z]; P0.head = [-0.5, 0.0, 0]; P0.breath = 1;
    const bx = REF.x + REF.L / 2 - 0.35 - 0.3, by = 2.55;
    P0.aR = [bx, by, REF.z - 0.32]; P0.aL = [bx, by, REF.z + 0.32]; P0.fpR = Math.PI / 2 - 0.2; P0.fpL = Math.PI / 2 - 0.2; P0.fyR = Math.PI / 2; P0.fyL = Math.PI / 2;
    P0.kneePole = [0, 1, 0];
    // mani: lungo i fianchi, polsi che pulsano (cento)
    const pul = Math.sin(t * 7) * 0.12;
    P0.hR = [hipX - 0.9 + pul * 0.0, 2.0 + pul * 0.5, REF.z - 0.68]; P0.hL = [hipX - 0.9, 2.0 - pul * 0.5, REF.z + 0.68];
    P0.eR = [0, -1, -0.4]; P0.eL = [0, -1, 0.4]; P0.nR = [0, 1, 0]; P0.nL = [0, 1, 0]; P0.cR = [0.2, 0.25, 0.2]; P0.cL = [0.2, 0.25, 0.2];
    return P0;
  }
  void lying;

  /* ---------- gli attori in funzione di pos ---------- */
  const eN = (x) => (x * 0.9) % 1;
  void eN;
  function actors(pos, t, intro) {
    const list = []; // { person, P, outfit, lod, extra }
    const c = cpath(pos), O = outfitAt(pos);
    const ph0 = pos * 7;
    /* ---- cliente ---- */
    let CP; let held = null;
    const walkAmt = c.walking;
    // entrata dalla porta (tempo): il cliente arriva da fuori fino al punto 0
    const introU = pos < 0.1 ? 1 - intro : 0;
    const pz = c.z - introU * 5.2;
    const a = { x: c.x, z: pz, yaw: c.yaw };
    if (pos < 0.1 && introU > 0) {
      CP = walk(a, 9 - introU * 5.2, 1, t);
    } else if (walkAmt > 0.5 || (pos > 0.1 && pos < 0.62) || (pos > 1.38 && pos < 2.62) || (pos > 3.38 && pos < 4.62) || (pos > 5.3 && pos < 5.8)) {
      // camminata, con l'arrivo che rallenta
      CP = walk(a, c.d, walkAmt, t);
    } else if (pos >= 0.62 && pos <= 1.38) { // Personal: goblet squat con manubrio guidato da Valerio
      const rep = 0.5 - 0.5 * Math.cos(t * 2.1); const hold = 1 - sm(1.24, 1.34, pos); const prep = sm(0.62, 0.7, pos);
      CP = squat(a, rep * hold, {}); CP.head = [-0.35, CP.head[1], 0];
      if (hold < 0.999) { // posa il manubrio: abbassa le mani lungo il corpo
        const d = Wp(a, [0.0, 0.85, 0.45]); CP.hR = v.mix(CP.hR, [d[0] - 0.4, 0.4, d[2]], 1 - hold); CP.hL = v.mix(CP.hL, [d[0] + 0.4, 0.4, d[2]], 1 - hold);
      }
      void prep; held = { kind: 'db', hold };
    } else if (pos > 2.62 && pos < 3.38) { // Pilates: dal bordo del reformer si sdraia e fa il footwork
      const st = standIdle({ x: SPOT.pil[0], z: SPOT.pil[1], yaw: Math.PI / 2 }, t);
      const L = lying(t, pos);
      const lie = sm(2.74, 2.98, pos) * (1 - sm(3.18, 3.3, pos));
      CP = blendP(st, L, lie); if (lie > 0.02 && lie < 0.98) { CP.hip[1] += Math.sin(Math.PI * lie) * 0.5; }
      CP.root = [lerp(st.root[0], L.root[0], lie), lerp(st.root[1], L.root[1], lie)];
    } else if (pos >= 4.62 && pos <= 5.3) { // Functional: kettlebell swing con il gruppo
      const u = 0.5 - 0.5 * Math.cos(t * 3.2 + 0.3); CP = swing(a, u); CP.head = [0, CP.head[1], 0]; held = { kind: 'kb', pos: CP.bell, hold: 1 };
    } else if (pos > 5.8) { // finale: pugni al cielo
      CP = standIdle(a, t); const up = sm(5.9, 5.98, pos); CP.hR = Wp(a, [-0.5, lerp(1.1, 3.9, up), 0.1]); CP.hL = Wp(a, [0.5, lerp(1.1, 3.9, up), 0.1]); CP.eR = rot(a, [-1, 0.2, -0.2]); CP.eL = rot(a, [1, 0.2, -0.2]); handsGrip(CP, 0.9);
    } else { CP = standIdle(a, t); }
    // posa del cliente: dopo il Pilates si rialza e cammina
    list.push({ p: client, P: CP, out: O, lod: 0, held });
    void ph0;

    /* ---- Valerio nella sala Personal ---- */
    if (Math.abs(c.x - 24.4) < 40) {
      const va = { x: 24.4, z: 0.5, yaw: -0.75 };
      const VP = standIdle(va, t, { ph: 1 });
      const cp = [c.x, 3.6, c.z];
      const count = pos > 0.62 && pos < 1.4 ? 1 : 0;
      const rep = 0.5 - 0.5 * Math.cos(t * 2.1);
      // mano destra: indica il cliente e conta le ripetizioni; sinistra: cronometro
      const gest = count ? Math.pow(rep, 1.5) : 0;
      VP.hR = Wp(va, [-0.62, 3.0 + 0.55 * gest, 1.0]); VP.eR = rot(va, [-1, -0.1, -0.2]); VP.nR = rot(va, [0, 1, 0.2]); VP.cR = [0.05, 0.9, 0.35];
      VP.hL = Wp(va, [0.45, 2.55, 0.85]); VP.eL = rot(va, [1, -0.5, -0.1]); VP.nL = rot(va, [0, 1, 0.3]); VP.cL = [0.9, 0.9, 0.8];
      VP.head = lookAtP(va, [24.4, 4.0, 0.5], cp, 0.8); VP.twist = -0.15; VP.pitch = 0.04;
      list.push({ p: valerio[0], P: VP, out: null, lod: 0, stop: Wp(va, [0.45, 2.72, 0.9]) });
    }
    /* ---- Chiara nella sala Pilates ---- */
    if (Math.abs(c.x - ZX[2] - 2) < 40) {
      const ca = { x: 47.2, z: -2.3, yaw: 0.2 };
      const CHP = standIdle(ca, t, { ph: 2 });
      const s = refSlide(t), kneeX = refCarriage(s) + 0.8 + 0.7, kneeW = [kneeX, 3.0, REF.z - 0.3];
      const lieK = sm(2.8, 2.98, pos) * (1 - sm(3.2, 3.3, pos));
      CHP.pitch = 0.12 * lieK; CHP.lean = 0.14 * lieK;
      // una mano guida il ginocchio, l'altra tocca il fianco; sguardo al cliente
      const h1 = v.mix(Wp(ca, [-0.55, 1.1, 0.1]), [kneeW[0] - 0.1, 3.0, REF.z - 0.55], lieK), h2 = v.mix(Wp(ca, [0.55, 1.1, 0.1]), [REF.x + refCarriage(s) - REF.x + 0.3, 2.6, REF.z - 0.65], lieK);
      CHP.hR = h1; CHP.hL = h2; CHP.eR = rot(ca, [-1, -0.5, -0.2]); CHP.eL = rot(ca, [1, -0.5, -0.2]); CHP.nR = [0, -1, 0]; CHP.nL = [0, -1, 0]; CHP.cR = [0.1, 0.1, 0.1]; CHP.cL = [0.12, 0.12, 0.12];
      CHP.head = lookAtP(ca, [47.2, 3.9, -2.3], [REF.x + 1.5, 2.2, REF.z], 0.8 * lieK + 0.2);
      if (lieK < 0.5) CHP.head = [0.0, 0.03, 0];
      list.push({ p: chiara[0], P: CHP, out: null, lod: 0 });
    }
    /* ---- gruppo Functional ---- */
    if (Math.abs(c.x - ZX[3]) < 40) {
      const POS = [[62.8, -1.2, 0.45], [66.0, -3.6, 0.25], [75.6, -1.4, -0.45], [73.0, -3.7, -0.25], [72.6, -0.1, -0.3]];
      POS.forEach(([x, z, yw], i) => {
        const ga = { x, z, yaw: yw }, ph = i * 1.3;
        let GP;
        if (i === 0) { const u = 0.5 - 0.5 * Math.cos(t * 3.2 + ph); GP = swing(ga, u); GP.bell = GP.bell; }
        else if (i === 1) GP = ropes(ga, t, ph);
        else if (i === 2) { const u = 0.5 - 0.5 * Math.cos(t * 3.2 + 0.3 + 0.2); GP = swing(ga, u); }
        else if (i === 3) GP = lunge(ga, t, ph);
        else GP = jacks(ga, t, ph);
        list.push({ p: group[i], P: GP, out: null, lod: 1, bell: (i === 0 || i === 2) ? GP.bell : null, rope: i === 1 ? { ph } : null });
      });
    }
    /* ---- finale: Valerio, Chiara e il gruppo arrivano e si mettono in posa ---- */
    if (pos > 5.2) {
      const arr = sm(5.3, 5.82, pos), gaze = (x) => x;
      void gaze;
      const place = (p, tx, tz, yaw, fromDx, ph, lod, idx) => {
        const x = tx + (1 - arr) * fromDx, a2 = { x, z: tz, yaw: lerp(-Math.PI / 2, yaw, sm(0.78, 1, arr)) };
        const wk = (1 - sm(0.86, 1, arr)) * (arr > 0.001 ? 1 : 0);
        let Q = wk > 0.02 ? walk(a2, (1 - arr) * fromDx * -1 + ph, wk, t) : standIdle(a2, t, { ph });
        if (arr > 0.99 || pos > 5.9) { const up = sm(5.92, 6.0, pos); const wv = Math.sin(t * 6 + ph) * 0.15; Q.hR = Wp(a2, [lerp(-0.55, -1.0, up), lerp(1.1, 4.3, up) + wv * up, 0.1]); Q.hL = Wp(a2, [lerp(0.55, 1.0, up), lerp(1.1, 4.3, up) - wv * up, 0.1]); Q.eR = rot(a2, [-1, 0.3, -0.2]); Q.eL = rot(a2, [1, 0.3, -0.2]); handsGrip(Q, 0.5); }
        list.push({ p, P: Q, out: null, lod, idx });
      };
      place(valerio[1], 97.3, 0.3, -0.15, 16, 0, 0);
      place(chiara[1], 90.7, 0.3, 0.15, 14, 0.7, 0);
      const FP = [[88.4, -2.5, 0.25], [91.8, -3.5, 0.12], [96.2, -3.5, -0.12], [99.6, -2.5, -0.25], [94, -4.3, 0]];
      FP.forEach(([x, z, yw], i) => place(groupFin[i], x, z, yw, 18 + i * 2, i * 0.9, 1, i));
    }
    return list;
  }

  /* =============================== SALE =============================== */
  const clientX = { x: 0 };
  // gli arredi crescono quando il cliente si avvicina e si ritirano quando è lontano (la sala si ricompone intorno a lui)
  const appear = (x) => { const d = x - clientX.x; return sm(34, 14, d) * sm(-30, -16, d); };
  const place = (x, z, ry = 0, s = 1) => { const ap = appear(x) * s; return ap < 0.01 ? null : Mx(x, 0, z, ap, ap, ap, 0, ry, 0); };
  const rp = (x, z, ry, s, fn) => { const m = place(x, z, ry, s); if (m) fn(m); };
  const gateOpen = (gx, cx) => sm(-5, -1.5, cx - gx) * (1 - sm(1.5, 5, cx - gx)); // aperto quando il cliente è vicino al cancello
  void gateOpen;

  function floorAndWall(pos, cx, t) {
    const zs = -7, ze = 48, zl = ze - zs, zc = (zs + ze) / 2;
    // pavimenti per sala: da un cancello all'altro
    const bounds = [-16, ...GATE, 112];
    const FL = [
      { c: [0.17, 0.17, 0.18], o: { spec: 0.14, shin: 36, rim: 0.03 } },                         // hero: cemento lucido grafite
      { c: [0.055, 0.055, 0.06], o: { spec: 0.07, shin: 20, rim: 0.03 } },                        // personal: gomma nera
      { c: [0.82, 0.68, 0.5], o: { spec: 0.18, shin: 26, rim: 0.03 } },                          // pilates: rovere chiaro
      { c: [0.07, 0.08, 0.075], o: { spec: 0.07, shin: 20, rim: 0.03 } },                        // functional: gomma scura
      { c: [0.04, 0.04, 0.045], o: { spec: 0.8, shin: 120, rim: 0.03 } },                        // finale: nero lucido
    ];
    for (let i = 0; i < 5; i++) {
      const x0 = bounds[i], x1 = bounds[i + 1]; if (x1 < cx - 70 || x0 > cx + 70) continue;
      mesh(G.box, Mx((x0 + x1) / 2, -0.15, zc, x1 - x0, 0.3, zl), FL[i].c, FL[i].o);
    }
    // dettagli del pavimento
    // Personal: righe arancio e zona di lavoro
    for (let i = 0; i < 3; i++) mesh(G.box, Mx(ZX[1] + (i - 1) * 6.5, 0.005, 3.4, 0.07, 0.01, 12), K.orange, { ...PAINT, glow: [0.08, 0.03, 0.01] });
    mesh(G.box, Mx(ZX[1], 0.004, 3.9, 20, 0.008, 0.07), K.orange, PAINT);
    // Pilates: doghe di rovere
    for (let i = 0; i < 22; i++) mesh(G.box, Mx(ZX[2], 0.003, zs + 0.5 + i * 0.7, 21.6, 0.004, 0.045), [0.62, 0.48, 0.3], MATT);
    // Functional: corsia di erba sintetica e linee
    mesh(G.box, Mx(ZX[3], 0.01, 0.2, 22, 0.02, 9.5), [0.05, 0.2, 0.09], { spec: 0.05, shin: 10, rim: 0.4, mat: X.MAT.cloth });
    [-4.5, 4.9].forEach((zz) => mesh(G.box, Mx(ZX[3], 0.025, zz + 0.2, 22, 0.01, 0.09), K.orange, PAINT));
    // finale: pedana rotonda con anello arancio
    mesh(G.disc, Mx(ZX[4], 0.04, -0.2, 17, 0.08, 17), [0.05, 0.05, 0.055], { spec: 0.22, shin: 70, rim: 0.03 });
    mesh(G.ring, M.mul(M.T(ZX[4], 0.1, -0.2), M.S(8.3, 1, 8.3)), K.orange, { ...PAINT, glow: [0.3, 0.12, 0.03] });
    // parete di fondo: nera, divisa in zone con finiture diverse
    const WC = [0.045, 0.045, 0.05], WO = { spec: 0.1, shin: 14, rim: 0.04 };
    mesh(G.box, Mx((-16 - 3.4) / 2, 7, BZ - 0.3, 12.6, 14, 0.6), WC, WO);       // a sinistra della porta
    mesh(G.box, Mx((3.4 + 112) / 2, 7, BZ - 0.3, 108.6, 14, 0.6), WC, WO);      // a destra, fino in fondo
    mesh(G.box, Mx(0, 12.4, BZ - 0.3, 6.8, 3.6, 0.6), WC, WO);                   // sopra la porta
    // fascia di luce a pavimento lungo il fondo
    mesh(G.box, Mx(48, 0.05, BZ + 0.15, 128, 0.12, 0.06), [1, 0.9, 0.78], { spec: 0, shin: 1, rim: 0, glow: [0.35, 0.28, 0.2] });
    // fasce di luce al soffitto (si vedono dall'alto come strisce che scorrono)
    for (let i = -1; i < 11; i++) { const x = i * 11 + 5.5; if (Math.abs(x - cx) > 40) continue; P.strip(M.chain(M.T(x, 12.4, -4.0), M.Ry(0)), 6.5, i % 2 ? [1, 0.94, 0.84] : [1, 0.9, 0.78], 0.8); }
  }

  /* ---- hero: reception, logo, porta d'ingresso ---- */
  function hero(pos, cx, t, intro) {
    const x0 = 0;
    // luce esterna dietro la porta
    mesh(G.box, Mx(x0, 6, BZ - 1.2, 14, 14, 0.2), [0.28, 0.32, 0.4], { spec: 0, shin: 1, rim: 0, glow: [0.1, 0.14, 0.22] });
    // cornice della porta (acciaio nero) e battenti in vetro che si aprono quando il cliente arriva
    const frame = [0.03, 0.03, 0.035];
    [-1, 1].forEach((s) => mesh(G.box, Mx(x0 + s * 3.3, 5, BZ + 0.05, 0.4, 10.2, 0.7), frame, BLACK));
    mesh(G.box, Mx(x0, 10.1, BZ + 0.05, 7.0, 0.4, 0.7), frame, BLACK);
    mesh(G.box, Mx(x0, 0.1, BZ + 0.05, 7.0, 0.2, 0.7), frame, BLACK);
    const open = pos < 0.2 ? sm(0.0, 1.0, intro) : 1 - sm(0.3, 0.42, pos) * 0.0;
    const ang = open * 1.25;
    [-1, 1].forEach((s) => {
      const hinge = M.chain(M.T(x0 + s * 3.0, 0, BZ + 0.3), M.Ry(s * ang));
      mesh(G.box, M.mul(hinge, Mx(-s * 1.45, 4.9, 0, 0.14, 9.6, 0.14)), K.steel, STEEL);
      mesh(G.box, M.mul(hinge, Mx(-s * 2.95, 4.9, 0, 0.14, 9.6, 0.14)), K.steel, STEEL);
      mesh(G.box, M.mul(hinge, Mx(-s * 1.5, 0.3, 0, 2.9, 0.4, 0.16)), K.steel, STEEL);
      mesh(G.box, M.mul(hinge, Mx(-s * 1.5, 9.6, 0, 2.9, 0.3, 0.16)), K.steel, STEEL);
      glass(G.box, M.mul(hinge, Mx(-s * 1.5, 4.9, 0, 2.8, 9.3, 0.05)), [0.7, 0.8, 0.86], 0.18);
      mesh(G.cyl12, M.mul(hinge, Mx(-s * 0.35, 4.6, 0.22, 0.09, 2.2, 0.09)), K.chrome, CHROME);
    });
    // wordmark e simbolo K LAB sulla parete a destra e sinistra della porta
    rp(x0 + 6.4, BZ + 0.2, 0, 1, (m) => P.kLogo(M.mul(m, Mx(0, 7.4, 0, 0.8, 0.8, 0.8)), K.orange, 0.3));
    rp(x0 - 8.8, BZ + 0.25, 0, 1, (m) => mesh(G.box, M.mul(m, Mx(0, 5.2, 0, 5.6, 6.2, 0.15)), [0.07, 0.07, 0.08], MATT));
    // banco della reception, chiaro come nello studio vero, con il chevron sul fronte
    rp(x0 - 8.8, -4.2, 0, 1, (m) => {
      mesh(G.box, M.mul(m, Mx(0, 1.2, 0, 6.2, 2.4, 1.7)), [0.84, 0.84, 0.83], { spec: 0.3, shin: 40, rim: 0.4 });
      mesh(G.box, M.mul(m, Mx(0, 2.45, 0, 6.35, 0.18, 1.85)), [0.3, 0.3, 0.31], { spec: 0.4, shin: 50, rim: 0.4 });
      mesh(G.box, M.mul(m, Mx(0, 0.15, 0.9, 6.0, 0.14, 0.04)), [1, 0.95, 0.85], { spec: 0, shin: 1, rim: 0, glow: [0.9, 0.85, 0.75] });
      P.kLogo(M.mul(m, Mx(-0.55, 1.3, 0.9, 0.3, 0.3, 0.3)), K.orange, 0.12);
    });
    rp(x0 - 4.6, -5.4, 0.3, 1.2, (m) => P.plant(m, 0, 1.4));
    rp(x0 + 5.0, -5.6, 1.2, 1.3, (m) => P.plant(m, 1, 1.5));
    // lampade a sospensione
    for (let i = 0; i < 3; i++) rp(x0 - 6 + i * 6, -2.0 - i * 0.4, 0, 1, (m) => P.pendant(M.mul(m, M.T(0, 9.8, 0)), [1, 0.82, 0.58], 1));
  }

  /* ---- sala Personal Training ---- */
  function salaPT(pos, cx, t) {
    const X0 = ZX[1];
    // parete: specchi grandi e strisce di luce verticali arancio
    for (let i = 0; i < 3; i++) mesh(G.box, Mx(X0 - 7.4 + i * 7.4, 5.3, BZ + 0.2, 6.7, 8.4, 0.1), [0.14, 0.15, 0.17], { spec: 0.95, shin: 160, rim: 0.2, mat: X.MAT.metal });
    for (let i = 0; i < 4; i++) mesh(G.box, Mx(X0 - 11 + i * 7.4, 5.3, BZ + 0.22, 0.12, 9.2, 0.1), K.orange, { ...PAINT, glow: [0.9, 0.35, 0.1] });
    // montanti e barre
    rp(X0 - 9.5, -3.4, 0, 1, (m) => { P.rack(m); P.barbell(M.mul(m, M.T(0, 4.6, -1.9)), 1); });
    rp(X0 + 8.6, -3.8, 0, 1, (m) => P.rack(m));
    rp(X0 + 8.6, -0.2, Math.PI / 2, 1, (m) => P.bench(m));
    rp(X0 - 0.4, -5.8, 0, 1, (m) => P.dumbbellRack(m));
    rp(X0 + 3.6, -6.0, 0, 1, (m) => P.cable(m, t));
    // pesi a terra e piccoli attrezzi (quelli con la coreografia sono più sotto, nello sciame)
    rp(X0 - 10.0, 3.0, 0, 1, (m) => P.mat(m, K.charcoal, 1.5, 4.2));
    rp(X0 + 11.6, 1.6, 0.2, 1, (m) => P.mat(m, K.charcoal, 1.5, 4.2));
    rp(X0 + 6.2, 2.4, 0.5, 1, (m) => P.stopwatch(M.mul(m, M.T(0, 0.4, 0))));
    rp(X0 - 3.8, -2.6, 0.3, 1, (m) => P.weightTree(m));
    rp(X0 + 5.2, -5.6, 0, 1, (m) => { for (let i = 0; i < 4; i++) P.kettlebell(M.mul(m, M.T(i * 1.3 - 2, 0, 0)), K.black, 0.8 + i * 0.1); });
    rp(X0 - 7.8, 0.8, 0, 1, (m) => { P.bottle(M.mul(m, M.T(0, 0, 0)), K.sky); P.bottle(M.mul(m, M.T(0.7, 0, 0.3)), K.orange); });
    // timer a parete
    mesh(G.box, Mx(X0 + 6.2, 8.4, BZ + 0.35, 3.8, 1.5, 0.2), [0.03, 0.03, 0.035], BLACK);
    if (T.timer) quadTex(T.timer, X0 + 6.2, 8.4, BZ + 0.47, 3.5, 1.2, {});
    // faretti
    for (let i = 0; i < 5; i++) rp(X0 - 10 + i * 5, -1.5, 0, 1, (m) => mesh(G.disc, M.mul(m, Mx(0, 11.6, 0, 0.7, 0.1, 0.7)), [1, 0.95, 0.85], { spec: 0, shin: 1, rim: 0, glow: [1.5, 1.35, 1.1] }));
  }

  /* ---- sala Pilates ---- */
  function salaPil(pos, cx, t) {
    const X0 = ZX[2];
    // parete a doghe di rovere (come nella foto di Chiara) su feltro scuro e grande finestra luminosa
    mesh(G.box, Mx(X0, 5.3, BZ + 0.12, 22, 9.6, 0.06), [0.09, 0.08, 0.07], MATT);
    for (let i = 0; i < 44; i++) { const x = X0 - 10.7 + i * 0.5; if (x > X0 - 2 && x < X0 + 4.5) continue; mesh(G.box, Mx(x, 5.3, BZ + 0.24, 0.3, 9.6, 0.18), i % 7 === 3 ? [0.66, 0.5, 0.32] : K.oak, WOOD); }
    mesh(G.box, Mx(X0 + 1.2, 5.3, BZ + 0.2, 6.2, 8.6, 0.1), [0.86, 0.78, 0.62], { spec: 0, shin: 1, rim: 0, glow: [0.32, 0.26, 0.18] });
    [-1, 0, 1].forEach((i) => mesh(G.box, Mx(X0 + 1.2 + i * 2.05, 5.3, BZ + 0.3, 0.1, 8.6, 0.1), [0.92, 0.9, 0.85], PAINT));
    mesh(G.box, Mx(X0 + 1.2, 5.3, BZ + 0.3, 6.3, 0.1, 0.1), [0.92, 0.9, 0.85], PAINT);
    // reformer (quello del cliente) e altri due sullo sfondo
    const m0 = Mx(REF.x, 0, REF.z, appear(X0) + 0.0001 > 0 ? 1 : 1, 1, 1);
    P.reformer(m0, refSlide(t));
    rp(X0 - 2.6, -3.9, 0, 1, (m) => P.reformer(m, 0.3, K.white, false));
    rp(X0 + 5.2, -4.6, 0, 1, (m) => P.reformer(m, 0.55, K.white, false));
    rp(X0 - 10.6, -4.4, 0.3, 1, (m) => P.cadillac(m));
    rp(X0 + 9.6, 0.4, -0.6, 1, (m) => P.wunda(m));
    rp(X0 + 9.8, -1.6, 0.2, 1, (m) => P.spineCorrector(m));
    // tappetini a colori, palloni, piante
    rp(X0 + 4.3, 4.5, 0.1, 1, (m) => P.mat(m, K.sage, 1.4, 4.2));
    rp(X0 + 7.8, 4.0, -0.2, 1, (m) => P.mat(m, K.terracotta, 1.4, 4.2));
    rp(X0 - 3.0, 5.2, 0, 1, (m) => P.mat(m, K.blush, 1.4, 4.2));
    rp(X0 + 10.8, 3.0, 0, 1, (m) => P.fitball(m, K.sage, 1.2));
    rp(X0 + 12.5, 1.0, 0, 1, (m) => P.fitball(m, K.blush, 1.0));
    [[X0 - 10.6, -5.2, 0, 1.9], [X0 + 10.2, -5.8, 1, 2.2], [X0 + 0.8, -6.0, 0, 1.6]].forEach(([x, z, k, s]) => rp(x, z, 0.4, 1, (m) => P.plant(m, k, s)));
    // lampade tonde, morbide
    for (let i = 0; i < 4; i++) rp(X0 - 8 + i * 5.5, -1.8, 0, 1, (m) => P.pendant(M.mul(m, M.T(0, 9.6, 0)), [1, 0.84, 0.62], 0.9));
  }

  /* ---- sala Functional ---- */
  function salaFun(pos, cx, t) {
    const X0 = ZX[3];
    // parete: diagonali arancio, timer grande e scritta (disegni sulla parete nera)
    for (let i = 0; i < 5; i++) mesh(G.box, Mx(X0 - 11 + i * 5.5, 5.5, BZ + 0.2, 1.2, 14, 0.1, 0, 0, 0.5), i % 2 ? K.orange : [0.12, 0.12, 0.13], { ...PAINT, glow: i % 2 ? [0.16, 0.06, 0.015] : [0, 0, 0] });
    mesh(G.box, Mx(X0 + 0.2, 7.0, BZ + 0.35, 4.6, 1.8, 0.2), [0.03, 0.03, 0.035], BLACK);
    if (T.timer) quadTex(T.timer, X0 + 0.2, 7.0, BZ + 0.47, 4.3, 1.62, {});
    rp(X0, -5.0, 0, 1, (m) => P.rig(m, 20));
    rp(X0 - 6, -4.9, 0, 1, (m) => P.trx(M.mul(m, M.T(0, 11, 0)), t, 1));
    rp(X0 + 6, -4.9, 0, 1, (m) => P.trx(M.mul(m, M.T(0, 11, 0)), t + 1, 1));
    // box pliometrici a gradini
    rp(X0 - 10.5, -2.8, 0.2, 1, (m) => { P.plyo(m, 1.6); P.plyo(M.mul(m, M.T(0, 0, 2.1)), 1.1); });
    rp(X0 + 10.5, -3.2, -0.2, 1, (m) => { P.plyo(m, 2.4); P.plyo(M.mul(m, M.T(-2.3, 0, 0.6)), 1.6); });
    rp(X0 - 9.0, 3.4, 0.1, 1, (m) => { P.sandbag(m); P.sandbag(M.mul(m, M.chain(M.T(1.6, 0, 0.5), M.Ry(0.5)))); });
    rp(X0 + 9.4, 3.4, 0, 1, (m) => { for (let i = 0; i < 5; i++) P.cone(M.mul(m, M.T(i * 1.3 - 2.6, 0, i % 2 * 0.6)), i % 2 ? K.orange : K.yellow, 0.8); });
    rp(X0 + 3.0, 5.0, 0.5, 1, (m) => P.mat(m, K.charcoal, 1.4, 3.6));
    // corde da battaglia: ancorate alla parete, in mano a un partecipante
    const g = group[1]; void g;
    const rope = ropeHand;
    if (rope.on) {
      [rope.L, rope.R].forEach((h, i) => P.rope([X0 - 4.6 + i * 1.0 - 0, 1.0, -6.0], h, t, 1, i * 1.2));
    }
    // lampade
    for (let i = 0; i < 5; i++) rp(X0 - 10 + i * 5, -2.0, 0, 1, (m) => mesh(G.disc, M.mul(m, Mx(0, 11.7, 0, 0.8, 0.1, 0.8)), [1, 0.92, 0.82], { spec: 0, shin: 1, rim: 0, glow: [1.6, 1.4, 1.1] }));
  }
  const ropeHand = { on: false, L: [0, 0, 0], R: [0, 0, 0] };

  /* ---- finale: pedana con il grande K LAB e gli oggetti delle tre sale in cerchio ---- */
  function sala0(pos, cx, t) {
    const X0 = ZX[4];
    mesh(G.box, Mx(X0, 6.5, BZ + 0.2, 26, 13, 0.1), [0.035, 0.035, 0.04], MATT);
    const k = sm(5.2, 5.9, pos);
    if (k > 0.01) P.kLogo(M.mul(M.T(X0 - 1.4, 5.6, BZ + 0.45), M.S(2.4 * k)), K.orange, 0.3);
    for (let i = 0; i < 4; i++) P.pendant(M.mul(M.T(X0 - 9 + i * 6, 0, -1.5), M.T(0, 9.6, 0)), [1, 0.82, 0.6], 1);
  }

  /* =============================== SCIAME (oggetti che si trasformano) =============================== */
  // 12 oggetti: nel corridoio sono gli attrezzi di una sala; tra una sala e l'altra si alzano, diventano forme geometriche,
  // orbitano attorno al cliente e si ricompongono come gli attrezzi della sala successiva.
  const KINDS = {
    dumbbell: (m, s) => P.hexDumbbell(M.mul(m, M.S(s * 1.3))), kettlebell: (m, s) => P.kettlebell(M.mul(m, M.S(s * 1.1)), K.black), plate: (m, s) => P.plate(M.mul(m, Mx(0, 0.5 * s, 0, s * 0.6, s * 0.6, s * 0.6, 0, 0, 0)), 1, K.rubber),
    ball: (m, s) => P.ball(M.mul(m, Mx(0, 0.5 * s, 0, s, s, s)), 0.5, K.red), band: (m, s) => P.band(M.mul(m, M.T(0, 0.4 * s, 0)), K.orange, 0.7 * s), bottle: (m, s) => P.bottle(M.mul(m, M.S(s)), K.sky),
    stopwatch: (m, s) => P.stopwatch(M.mul(m, Mx(0, 0.4 * s, 0, s, s, s))), ring: (m, s) => P.magicCircle(M.mul(m, Mx(0, 0.8 * s, 0, s * 1.3, s * 1.3, s * 1.3, 0, 0, 0))), softball: (m, s) => P.softBall(M.mul(m, M.S(s)), K.terracotta),
    block: (m, s) => P.block(M.mul(m, M.S(s)), K.sand), fitball: (m, s) => P.fitball(M.mul(m, M.S(s * 0.8)), K.blush, 1.0), roll: (m, s) => P.rolledMat(M.mul(m, M.S(s)), K.sage),
    slam: (m, s) => P.ball(M.mul(m, Mx(0, 0.5 * s, 0, s * 1.1, s * 1.1, s * 1.1)), 0.5, [0.1, 0.1, 0.11]), cone: (m, s) => P.cone(m, K.orange, s), sandbag: (m, s) => P.sandbag(M.mul(m, M.S(s * 0.8)), K.olive),
  };
  const SLOTS = [];
  const KS = [
    ['dumbbell', 'ring', 'kettlebell'], ['kettlebell', 'softball', 'slam'], ['plate', 'block', 'cone'], ['ball', 'fitball', 'sandbag'], ['band', 'band', 'band'], ['bottle', 'bottle', 'bottle'],
    ['dumbbell', 'ring', 'kettlebell'], ['kettlebell', 'softball', 'slam'], ['plate', 'block', 'cone'], ['band', 'roll', 'sandbag'], ['bottle', 'softball', 'cone'], ['stopwatch', 'block', 'kettlebell'],
  ];
  const HOME = [ // [x offset, z] per sala (Personal, Pilates, Functional) e finale (anello)
    [[1.0, 1.3], [-6.2, 4.8], [-7.4, 2.2]], [[-9.4, 2.2], [11.0, 5.6], [-3.4, 4.4]], [[-5.2, 4.0], [-1.6, 5.8], [3.0, 5.6]], [[4.4, 3.2], [9.2, 5.8], [-5.8, 4.6]],
    [[10.2, 3.0], [-0.4, 6.4], [7.6, 6.2]], [[-8.6, 1.6], [6.6, 6.2], [0.6, 6.7]], [[-8.2, 4.4], [-8.4, 5.4], [-1.8, 6.6]], [[8.8, 5.2], [3.2, 4.8], [-11.4, 4.8]],
    [[3.4, 5.6], [-11.2, 5.0], [9.8, 6.0]], [[11.2, 4.2], [8.4, 3.4], [11.6, 5.4]], [[-6.0, 6.0], [10.8, 4.4], [-2.0, 6.8]], [[7.0, 2.6], [-4.6, 6.4], [5.5, 6.4]],
  ];
  for (let i = 0; i < 12; i++) SLOTS.push({ kinds: KS[i], home: [0, 1, 2].map((z) => [ZX[z + 1] + HOME[i][z][0], Math.min(HOME[i][z][1], 2.2)]), fin: [ZX[4] + Math.cos(i / 12 * TAU + 0.4) * 8.6, Math.sin(i / 12 * TAU + 0.4) * 3.2 + 1.0], d: (i % 4) * 0.045, th: i / 12 * TAU, R: 4.2 + (i % 3) * 1.6, H: 3.2 + (i % 5) * 1.0, sc: 0.8 });
  const geom = (i, kind, m, s, tt, glow) => { // forma geometrica: cubo, sfera o anello, in arancio acceso
    const col = [0.91, 0.38, 0.14], o = { spec: 0.4, shin: 60, rim: 1, glow: [glow * 0.55, glow * 0.2, glow * 0.05] };
    if (kind % 3 === 0) mesh(G.box, M.mul(m, Mx(0, 0.5 * s, 0, 0.7 * s, 0.7 * s, 0.7 * s, tt, tt * 0.7, 0)), col, o);
    else if (kind % 3 === 1) mesh(G.sphere, M.mul(m, Mx(0, 0.5 * s, 0, 0.42 * s, 0.42 * s, 0.42 * s)), col, o);
    else mesh(G.ringT, M.mul(m, Mx(0, 0.5 * s, 0, 0.6 * s, 0.6 * s, 0.6 * s, tt, 0, tt * 0.6)), col, o);
  };
  const SEGU = [[1.38, 2.62], [3.38, 4.62], [5.3, 5.85]];
  // sciame per un tratto j (0: Personal→Pilates, 1: Pilates→Functional, 2: Functional→finale); u = avanzamento 0→1
  function swarm(pos, t, cxPos) {
    for (let i = 0; i < SLOTS.length; i++) {
      const S = SLOTS[i];
      // in quale fase siamo: trovo il tratto attivo
      let seg = -1, u = 0;
      for (let j = 0; j < 3; j++) { if (pos >= SEGU[j][0] && pos <= SEGU[j][1]) { seg = j; u = (pos - SEGU[j][0]) / (SEGU[j][1] - SEGU[j][0]); } }
      let place0; // sala di partenza e arrivo
      if (seg < 0) {
        const room = pos < SEGU[0][0] ? 0 : pos < SEGU[1][0] ? 1 : pos < SEGU[2][0] ? 2 : 3;
        if (pos < 1.34 && i === 0) continue; // il manubrio è ancora in mano al cliente
        const h = room < 3 ? S.home[room] : S.fin;
        if (room === 3 && pos < 5.9) { /* durante il finale gli oggetti hanno già formato il cerchio */ }
        const ap = room < 3 ? appear(h[0]) : sm(5.7, 5.98, pos);
        if (ap < 0.02) continue;
        const k = room < 3 ? S.kinds[room] : S.kinds[2];
        const y = room === 3 ? 4.4 + Math.sin(t * 0.9 + i) * 0.35 + (i % 3) * 0.7 : 0;
        const spin = room === 3 ? t * (0.6 + i * 0.05) : 0;
        const m = Mx(h[0], y, h[1], ap, ap, ap, 0, spin + i, 0);
        KINDS[k](m, S.sc);
        continue;
      }
      const A = S.home[seg], Bh = seg < 2 ? S.home[seg + 1] : S.fin, kA = S.kinds[seg], kB = S.kinds[Math.min(2, seg + 1)];
      const v0 = cl((u - S.d) / (1 - 0.3)), lift = sm(0.0, 0.16, v0), land = sm(0.78, 1.0, v0);
      const m1 = sm(0.06, 0.26, v0), m2 = sm(0.7, 0.9, v0);
      const orb = sm(0.14, 0.34, v0) * (1 - sm(0.66, 0.86, v0));
      const spd = seg === 1 ? 4.0 : seg === 2 ? 3.2 : 2.0, ang = S.th + v0 * spd * 2.2 + (seg === 0 ? 0 : t * 0.4);
      const rr = S.R * (seg === 1 ? 1.0 : 0.9), hh = S.H + Math.sin(v0 * 9 + i) * 0.5;
      const c = [cxPos.x, 0, cxPos.z];
      // l'orbita passa dietro ai personaggi; quando gira verso la camera sale sopra le teste, così non copre mai i volti
      const sz = Math.sin(ang), front = Math.max(0, sz);
      const orbP = [c[0] + Math.cos(ang) * rr, hh + front * 3.4, c[2] - 1.8 + sz * rr * (sz < 0 ? 0.6 : 0.22)];
      const homeA = [A[0], 0.0, A[1]], homeB = Bh.length === 2 ? [Bh[0], seg === 2 ? 4.4 : 0.0, Bh[1]] : Bh;
      const from = v.mix(homeA, orbP, eo(orb * (1 - land) + (v0 < 0.5 ? lift : 0) * 0));
      let p;
      if (v0 < 0.5) p = v.mix(homeA, orbP, eo(sm(0.0, 0.34, v0))); else p = v.mix(orbP, homeB, eio(sm(0.66, 1.0, v0)));
      void from; void lift; void land;
      // movimento secondo la disciplina: Personal→Pilates morbido e circolare, Pilates→Functional veloce
      const sc = S.sc * (seg === 1 ? 1.1 : 1);
      const spin = seg === 0 ? v0 * 6.0 : seg === 1 ? v0 * 18 + t * 1.2 : v0 * 12;
      const mm = M.chain(M.T(p[0], p[1], p[2]), M.Ry(spin + i), M.Rz(Math.sin(v0 * 9 + i) * 0.4 * orb));
      const gl_ = Math.sin(Math.PI * v0) * 0.6;
      if (m1 < 0.999) KINDS[kA](M.mul(mm, M.S(1 - m1)), sc);
      if (m1 > 0.001 && m2 < 0.999) geom(i, i, mm, sc * Math.min(1, m1 * 1.2) * (1 - m2), v0 * 8 + i, gl_);
      if (m2 > 0.001) KINDS[kB](M.mul(mm, M.S(m2)), sc);
    }
  }

  /* =============================== CANCELLI A LAMELLE =============================== */
  // tra una sala e l'altra: lamelle verticali a due facce (una per sala) che girano quando il cliente si avvicina e lo lasciano passare
  function gates(pos, cx, t) {
    const FACES = [[[0.06, 0.06, 0.07], [0.82, 0.66, 0.46]], [[0.82, 0.66, 0.46], [0.07, 0.07, 0.08]], [[0.07, 0.07, 0.08], [0.06, 0.06, 0.07]], [[0.06, 0.06, 0.07], [0.06, 0.06, 0.07]]];
    GATE.forEach((gx, gi) => {
      if (Math.abs(gx - cx) > 34) return;
      const n = 14;
      for (let i = 0; i < n; i++) {
        const z = BZ + 0.5 + i * 0.62, dz = Math.abs(z - 0.5);
        // chiudono tutto il fondo; il cliente passa dove le lamelle sono aperte (girano di 90° man mano che si avvicina)
        const near = sm(-9.5 - dz * 0.7, -2.0 - dz * 0.7, cx - gx) * (1 - sm(1.0 + dz * 0.5, 9.0 + dz * 0.5, cx - gx));
        const a = near * (Math.PI / 2);
        const turn = sm(-1, 6, cx - gx);
        const m = M.chain(M.T(gx, 0, z), M.Ry(a));
        const ap = 1 - sm(0, 1, Math.abs(z - 4) / 30) * 0.0;
        void ap;
        mesh(G.box, M.mul(m, Mx(-0.07, 5.2, 0, 0.1, 10.4, 0.92)), turn > 0.5 ? FACES[gi][1] : FACES[gi][0], gi === 1 ? WOOD : BLACK);
        mesh(G.box, M.mul(m, Mx(0.07, 5.2, 0, 0.1, 10.4, 0.92)), FACES[gi][1], gi === 0 ? WOOD : BLACK);
        mesh(G.box, M.mul(m, Mx(0, 5.2, 0, 0.04, 10.5, 0.7)), K.orange, { ...PAINT, glow: [0.45, 0.18, 0.04] });
      }
      // binario a terra e al soffitto
      mesh(G.box, Mx(gx, 0.05, -2.0, 0.4, 0.1, 10.2), K.steel, STEEL);
      mesh(G.box, Mx(gx, 10.5, -2.0, 0.4, 0.2, 10.2), K.charcoal, BLACK);
    });
  }


  /* =============================== PROFESSIONISTI (sezione "Benessere a 360°") ===============================
     Servono solo per generare le immagini della sezione: la scena in pagina non li disegna.
     Con ?ritratti=nutrizionista|osteopata|fisioterapista (e ?cine=0&sfondo=000|fff) la scena mostra solo quella persona, ferma,
     su sfondo uniforme: scripts/percorso-professionisti.py ne ricava i ritagli con trasparenza. */
  const basisM = (o, x, y, z) => new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, o[0], o[1], o[2], 1]);
  function rod(A, B, r, col, mat) { // cilindro da A a B (raggio r)
    const d = v.sub(B, A), yn = v.nrm(d), ref = Math.abs(yn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], xn = v.nrm(v.cross(ref, yn)), zn = v.cross(xn, yn);
    mesh(G.cyl12, basisM(v.mix(A, B, 0.5), v.mul(xn, r), d, v.mul(zn, r)), col, mat);
  }
  const PLAIN = { spec: 0.22, shin: 30, rim: 0.6 }, SOFT = { spec: 0.08, shin: 12, rim: 0.5 };
  function makePros() {
    const pros = {};
    const mk = (id, spec) => PE.createPerson({ id, seed: 20 + Object.keys(pros).length, ...spec, skin: sk(spec.face, [0.85, 0.65, 0.54]) });
    pros.nutrizionista = {
      person: mk('nutrizionista', { face: 'calabro', hair: { kind: 'short', col: [0.065, 0.05, 0.04], hi: [0.13, 0.1, 0.08] }, build: { w: 1.04, torso: 1.04, arm: 1.05, leg: 1.04, h: 1.02, hip: 1.0 }, logo: [0.2, 0.86],
        outfit: { top: [0.95, 0.95, 0.93], sleeve: null, sleeveL: 1.0, bot: [0.13, 0.14, 0.18], legL: 2, legK: 0.55, shoe: [0.2, 0.15, 0.12], sole: [0.9, 0.88, 0.84], bare: 0 } }),
      yaw: 0.0,
      pose(a, t) { // la mela in una mano, l'altra aperta: "ecco cosa mangiare"
        const P0 = standIdle(a, t, { ph: 1 });
        P0.head = [0.1, 0.0, 0.05];
        P0.hR = Wp(a, [-0.74, 2.38, 0.86]); P0.eR = rot(a, [-1, -0.9, -0.1]); P0.nR = rot(a, [0.15, 1, 0]); P0.cR = [0.5, 0.55, 0.5];
        P0.hL = Wp(a, [0.78, 2.3, 0.76]); P0.eL = rot(a, [1, -0.9, -0.1]); P0.nL = rot(a, [-0.2, 1, 0]); P0.cL = [0.1, 0.12, 0.3];
        return P0;
      },
      props(J) {
        const h = J.hands.R, ap = [h[0] - 0.01, h[1] + 0.16, h[2] + 0.12];
        mesh(G.sphere, M.chain(M.T(ap[0], ap[1], ap[2]), M.S(0.17, 0.155, 0.17)), [0.78, 0.09, 0.07], { spec: 0.4, shin: 50, rim: 0.6, mat: X.MAT.organic });
        mesh(G.sphere, M.chain(M.T(ap[0], ap[1] + 0.15, ap[2]), M.S(0.045, 0.04, 0.045)), [0.3, 0.2, 0.1], PLAIN);
        mesh(G.sphere, M.chain(M.T(ap[0] + 0.07, ap[1] + 0.17, ap[2]), M.Rz(-0.5), M.S(0.1, 0.03, 0.05)), [0.25, 0.55, 0.2], PLAIN);
      },
    };
    pros.osteopata = {
      person: mk('osteopata', { face: 'osteo', hair: { kind: 'short', col: [0.1, 0.07, 0.05], hi: [0.18, 0.13, 0.1] }, build: { w: 1.08, torso: 1.07, arm: 1.12, leg: 1.06, h: 1.03, hip: 1.0 }, logo: [0.2, 0.86],
        outfit: { top: [0.13, 0.36, 0.38], sleeve: null, sleeveL: 0.4, bot: [0.9, 0.9, 0.88], legL: 2, legK: 0.6, shoe: [0.93, 0.93, 0.9], sole: [0.84, 0.84, 0.82], bare: 0 } }),
      yaw: 0.0,
      pose(a, t) { // regge un modello di colonna vertebrale e lo indica con l'altra mano
        const P0 = standIdle(a, t, { ph: 2 });
        P0.head = [-0.1, 0.02, -0.04];
        P0.hL = Wp(a, [0.66, 2.38, 0.82]); P0.eL = rot(a, [1, -0.8, 0]); P0.nL = rot(a, [-0.3, 1, 0]); P0.cL = [0.5, 0.5, 0.45];
        P0.hR = Wp(a, [-0.12, 3.12, 1.02]); P0.eR = rot(a, [-1, -0.2, -0.4]); P0.nR = rot(a, [1, 0, 0.3]); P0.cR = [0.22, 0.25, 0.3];
        return P0;
      },
      props(J) {
        const h = J.hands.L, b = [h[0] + 0.02, h[1] + 0.12, h[2] + 0.14];
        mesh(G.cyl12, M.chain(M.T(b[0], b[1] - 0.01, b[2]), M.S(0.2, 0.035, 0.2)), [0.18, 0.18, 0.2], PLAIN); // base
        const n = 15;
        for (let k = 0; k < n; k++) {
          const u = k / (n - 1), y = b[1] + 0.05 + k * 0.1, bend = 0.1 * Math.sin(u * 5.4 + 0.5), z = b[2] + bend;
          const w = 0.062 + 0.034 * u * (1 - 0.35 * u);
          mesh(G.cyl12, M.chain(M.T(b[0], y, z), M.S(w, 0.045, w * 0.88)), [0.93, 0.89, 0.8], PLAIN); // vertebra
          mesh(G.sphere, M.chain(M.T(b[0], y, z - w * 0.95), M.S(0.026, 0.034, 0.05)), [0.9, 0.85, 0.74], PLAIN); // apofisi
          if (k < n - 1) mesh(G.cyl12, M.chain(M.T(b[0], y + 0.05, z + 0.004), M.S(w * 0.8, 0.02, w * 0.7)), [0.72, 0.5, 0.36], SOFT); // disco
        }
        mesh(G.sphere, M.chain(M.T(b[0], b[1] + 0.05 + n * 0.1 + 0.06, b[2] + 0.04), M.S(0.11, 0.1, 0.11)), [0.93, 0.89, 0.8], PLAIN); // cranio
        mesh(G.cyl12, M.chain(M.T(b[0], b[1] + 0.05 + (n - 1) * 0.05, b[2] - 0.075), M.S(0.012, 0.76, 0.012)), K.chrome, CHROME); // asta dietro
      },
    };
    pros.fisioterapista = {
      person: mk('fisioterapista', { face: 'fisio', hair: { kind: 'pony', col: [0.3, 0.19, 0.11], hi: [0.46, 0.3, 0.17] }, build: { w: 0.9, torso: 0.94, arm: 0.82, leg: 0.93, h: 0.97, hip: 1.1 }, logo: [0.18, 0.84],
        outfit: { top: [0.86, 0.91, 0.95], sleeve: null, sleeveL: 0.4, bot: [0.12, 0.16, 0.27], legL: 2, legK: 0.35, shoe: [0.93, 0.93, 0.9], sole: [0.88, 0.88, 0.86], shoeAcc: [0.91, 0.38, 0.14], bare: 0 } }),
      yaw: 0.0,
      pose(a, t) { // allunga una fascia elastica davanti al petto
        const P0 = standIdle(a, t, { ph: 3 });
        P0.head = [0.08, 0.0, -0.05];
        P0.hR = Wp(a, [-0.82, 2.72, 0.76]); P0.eR = rot(a, [-1, -0.7, -0.2]); P0.nR = rot(a, [0.2, -1, 0]); P0.cR = [0.9, 0.9, 0.7];
        P0.hL = Wp(a, [0.82, 2.72, 0.76]); P0.eL = rot(a, [1, -0.7, -0.2]); P0.nL = rot(a, [-0.2, -1, 0]); P0.cL = [0.9, 0.9, 0.7];
        return P0;
      },
      props(J) {
        const A = [J.hands.R[0] + 0.05, J.hands.R[1] - 0.06, J.hands.R[2] + 0.1], B = [J.hands.L[0] - 0.05, J.hands.L[1] - 0.06, J.hands.L[2] + 0.1];
        const sag = 0.14, mid = v.mix(A, B, 0.5);
        const C = [mid[0], mid[1] - sag, mid[2] + 0.02];
        const col = [0.91, 0.38, 0.14], mat = { spec: 0.3, shin: 30, rim: 0.7 };
        rod(A, C, 0.032, col, mat); rod(C, B, 0.032, col, mat);
        rod([A[0], A[1] + 0.06, A[2]], [C[0], C[1] + 0.06, C[2]], 0.02, col, mat); rod([C[0], C[1] + 0.06, C[2]], [B[0], B[1] + 0.06, B[2]], 0.02, col, mat);
      },
    };
    return pros;
  }
  const PROS = X.portrait ? makePros() : null;
  function portraitHook(t) {
    const d = PROS[X.portrait]; if (!d) return;
    const a = { x: 0, z: 0, yaw: d.yaw || 0 };
    const J = d.person.draw(d.pose(a, 0.4), 0.4, { lod: 0, face: true });
    d.props(J);
  }

  /* =============================== HOOKS =============================== */
  const cache = { pos: 0 };
  hooks.opaque.push((pos, t, R) => {
    if (PROS) { portraitHook(t); return; }
    const c = cpath(pos);
    clientX.x = c.x; clientX.z = c.z; cache.pos = pos;
    const cx = R.fx;
    clientX.x = cx; // gli arredi crescono rispetto al punto inquadrato
    floorAndWall(pos, cx, t);
    if (Math.abs(cx - ZX[0]) < 40) hero(pos, cx, t, R.intro);
    if (Math.abs(cx - ZX[1]) < 40) salaPT(pos, cx, t);
    if (Math.abs(cx - ZX[2]) < 40) salaPil(pos, cx, t);
    if (Math.abs(cx - ZX[3]) < 40) { ropeHand.on = false; salaFun(pos, cx, t); }
    if (Math.abs(cx - ZX[4]) < 44) sala0(pos, cx, t);
    gates(pos, cx, t);
    swarm(pos, t, { x: c.x, z: c.z });
    // persone
    const intro = R.intro;
    const acts = actors(pos, t, intro);
    for (const a of acts) {
      const o = a.out ? a.out : null;
      const J = a.p.draw(a.P, t, { lod: a.lod, outfit: o || undefined, face: a.lod === 1 });
      if (a.stop) P.stopwatch(M.mul(M.T(a.stop[0], a.stop[1], a.stop[2]), M.chain(M.Rx(-0.2), M.S(0.7))));
      if (a.held && a.held.kind === 'db') { const h = J.hands; const mid = v.mix(h.R, h.L, 0.5); P.hexDumbbell(M.chain(M.T(mid[0], mid[1] - 0.05, mid[2] + 0.02), M.Ry(0), M.Rz(0), M.S(0.9)), K.black); }
      if (a.held && a.held.kind === 'kb') { const h = J.hands; const mid = v.mix(h.R, h.L, 0.5); P.kettlebell(M.mul(M.T(mid[0], mid[1] - 1.0, mid[2]), M.S(0.9)), K.black, 1); }
      if (a.bell) { const h = J.hands; const mid = v.mix(h.R, h.L, 0.5); P.kettlebell(M.mul(M.T(mid[0], mid[1] - 0.95, mid[2]), M.S(0.8)), K.black, 1); }
      if (a.rope) { const h = J.hands; ropeHand.on = true; ropeHand.L = h.R; ropeHand.R = h.L; }
    }
    // manubrio posato a terra dal cliente (poi diventa lo sciame 0)
    if (pos >= 1.22 && pos < 1.38) {
      const hold = 1 - sm(1.24, 1.34, pos), c2 = cpath(pos), h = SLOTS[0].home[0];
      const a0 = acts[0].P, mid = v.mix(a0.hR, a0.hL, 0.5), k = 1 - hold;
      void c2;
      const p = [lerp(mid[0], h[0], eo(k)), lerp(mid[1], 0, eo(k)), lerp(mid[2], h[1], eo(k))];
      P.hexDumbbell(M.chain(M.T(p[0], p[1] + 0.2, p[2]), M.S(1.3)), K.black);
    }
  });
  return { cpath, ZX, GATE, actors, clientX, SPOT, REF, refSlide, OUT, outfitAt, SLOTS };
}
