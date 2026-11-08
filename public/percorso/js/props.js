// Gli attrezzi e gli arredi, modellati con le forme del motore (cilindri, sfere, scatole, anelli, solidi di rivoluzione).
// Ogni funzione disegna un oggetto nel suo sistema locale (origine a terra, centro dell'oggetto) con la matrice m.
// Unità: 1 = circa 44 cm (una persona è alta circa 4).
import { lathe, smooth, sweep, upload, extrude, halfDisc, rrect, cyl as cylG, torus } from './engine.js';

export function addProps(X) {
  const { gl, G, M, mesh, MAT, mixc, PAL } = X;
  const up = (g) => upload(gl, g);
  const Mx = (x, y, z, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) => M.chain(M.T(x, y, z), M.Ry(ry), M.Rx(rx), M.Rz(rz), M.S(sx, sy, sz));
  // materiali
  const STEEL = { spec: 0.8, shin: 100, rim: 1, mat: MAT.metal }, CHROME = { spec: 0.95, shin: 140, rim: 1, mat: MAT.metal };
  const BLACK = { spec: 0.3, shin: 40, rim: 0.8, mat: MAT.metal }, MATT = { spec: 0.05, shin: 12, rim: 0.5 }, RUB = { spec: 0.1, shin: 14, rim: 0.5 };
  const PAINT = { spec: 0.28, shin: 40, rim: 0.7 }, WOOD = { spec: 0.14, shin: 22, rim: 0.5, mat: MAT.wood }, UPH = { spec: 0.1, shin: 18, rim: 0.7, mat: MAT.cloth };
  const GLOSS = { spec: 0.6, shin: 80, rim: 0.9 };
  const K = {
    steel: [0.74, 0.76, 0.8], chrome: [0.86, 0.88, 0.92], black: [0.045, 0.045, 0.05], charcoal: [0.13, 0.13, 0.15], graphite: [0.2, 0.21, 0.23],
    rubber: [0.05, 0.05, 0.055], orange: [0.91, 0.38, 0.14], red: [0.78, 0.09, 0.08], white: [0.93, 0.93, 0.92], cream: [0.9, 0.86, 0.78],
    oak: [0.78, 0.6, 0.38], oakL: [0.86, 0.72, 0.5], walnut: [0.36, 0.23, 0.14], birch: [0.84, 0.7, 0.48], upholstery: [0.06, 0.06, 0.07],
    sage: [0.58, 0.67, 0.56], sand: [0.84, 0.76, 0.62], terracotta: [0.76, 0.42, 0.3], blush: [0.9, 0.72, 0.68], sky: [0.62, 0.74, 0.8], olive: [0.28, 0.32, 0.18],
    yellow: [0.95, 0.78, 0.1], plant: [0.12, 0.34, 0.14], plant2: [0.2, 0.46, 0.18], turf: [0.1, 0.24, 0.12],
  };
  Object.assign(X, { K, Mx, MATS: { STEEL, CHROME, BLACK, MATT, RUB, PAINT, WOOD, UPH, GLOSS } });
  // geometrie dedicate
  G.hex = up(cylG(6)); G.cyl12 = up(cylG(12));
  G.cone = up(lathe([[0, -0.5], [1, -0.5], [1, -0.5], [0.08, 0.5], [0, 0.5]], 24));
  G.pill = up(lathe(smooth([[0, -1], [0.7, -0.96], [1, -0.7], [1, 0.7], [0.7, 0.96], [0, 1]], 4), 20));
  G.semi = up(extrude(halfDisc(1, 30), 1));                                  // mezzo disco (barile della spine corrector)
  G.coil = up(sweep(Array.from({ length: 49 }, (_, i) => { const a = i * 0.9; return [i * 0.04 - 0.96, Math.cos(a) * 0.11, Math.sin(a) * 0.11]; }), Array(49).fill(0.018), 6));
  G.disc = up(lathe([[0, -0.5], [0.94, -0.5], [1, -0.44], [1, 0.44], [0.94, 0.5], [0, 0.5]], 40));
  G.dome = up(lathe(smooth([[0, 0], [1, 0], [1, 0.2], [0.8, 0.7], [0.45, 0.96], [0, 1]], 5), 32));
  G.vase = up(lathe(smooth([[0, 0], [0.72, 0], [0.9, 0.25], [0.8, 0.8], [0.96, 1], [0, 1]], 4), 26));
  G.frond = up((() => { // foglia lunga di palma: nastro incurvato
    const path = Array.from({ length: 12 }, (_, i) => { const t = i / 11; return [Math.sin(t * 1.2) * 1.3, t * 2.4 - t * t * 0.9, 0]; });
    return sweep(path, path.map((_, i) => 0.14 * Math.sin(Math.PI * Math.min(1, (i + 0.5) / 12 * 1.05)) + 0.01), 3);
  })());

  const P = {};

  /* ---------- Personal training ---------- */
  P.hexDumbbell = (m, col = K.black, len = 1) => {
    mesh(G.cyl12, M.mul(m, Mx(0, 0, 0, 0.06, 0.62 * len, 0.06, 0, 0, Math.PI / 2)), K.chrome, CHROME);
    [-1, 1].forEach((s) => { mesh(G.hex, M.mul(m, Mx(s * 0.36 * len, 0, 0, 0.3, 0.2, 0.3, 0, 0, Math.PI / 2)), col, { ...BLACK, spec: 0.35 }); });
  };
  P.plate = (m, r = 1, col = K.rubber, ring = true) => { // disco da bilanciere con asse lungo x
    mesh(G.disc, M.mul(m, Mx(0, 0, 0, r * 1.0, 0.12, r * 1.0, 0, 0, Math.PI / 2)), col, RUB);
    if (ring) mesh(G.disc, M.mul(m, Mx(0, 0, 0, r * 0.62, 0.135, r * 0.62, 0, 0, Math.PI / 2)), mixc(col, K.orange, 0.18), RUB);
    mesh(G.cyl12, M.mul(m, Mx(0, 0, 0, r * 0.2, 0.15, r * 0.2, 0, 0, Math.PI / 2)), K.chrome, CHROME);
  };
  P.barbell = (m, loaded = 1, plateCol = K.rubber) => { // lunghezza 5.4 lungo x
    mesh(G.cyl12, M.mul(m, Mx(0, 0, 0, 0.055, 5.4, 0.055, 0, 0, Math.PI / 2)), K.chrome, CHROME);
    [-1, 1].forEach((s) => {
      mesh(G.cyl12, M.mul(m, Mx(s * 2.05, 0, 0, 0.1, 1.2, 0.1, 0, 0, Math.PI / 2)), K.steel, STEEL);
      if (loaded > 0.01) {
        P.plate(M.mul(m, M.T(s * 1.72, 0, 0)), 0.98 * loaded, plateCol);
        P.plate(M.mul(m, M.T(s * 1.55, 0, 0)), 0.8 * loaded, plateCol, false);
        mesh(G.cyl12, M.mul(m, Mx(s * 1.42, 0, 0, 0.14, 0.12, 0.14, 0, 0, Math.PI / 2)), K.orange, PAINT);
      }
    });
  };
  P.kettlebell = (m, col = K.black, s = 1) => {
    mesh(G.sphere, M.mul(m, Mx(0, 0.5 * s, 0, 0.42 * s, 0.4 * s, 0.42 * s)), col, { spec: 0.35, shin: 40, rim: 0.8 });
    mesh(G.ring, M.mul(m, Mx(0, 1.0 * s, 0, 0.27 * s, 0.27 * s, 0.27 * s, Math.PI / 2, 0, 0)), col, { spec: 0.35, shin: 40, rim: 0.8 });
    mesh(G.ringT, M.mul(m, Mx(0, 0.98 * s, 0, 0.24 * s, 0.24 * s, 0.24 * s, Math.PI / 2, 0, 0)), col, { spec: 0.35, shin: 40, rim: 0.8 });
    mesh(G.sphere, M.mul(m, Mx(0, 0.43 * s, 0.38 * s, 0.1 * s, 0.1 * s, 0.03 * s)), K.orange, PAINT); // numero del peso
  };
  P.ball = (m, r = 0.5, col = K.red, seam = true) => { // palla medica / slam ball
    mesh(G.sphere, M.mul(m, M.S(r)), col, { spec: 0.18, shin: 20, rim: 0.7 });
    if (seam) mesh(G.ring, M.mul(m, Mx(0, 0, 0, r * 1.01, r * 1.01, r * 1.01, 0, 0, 0)), mixc(col, [0, 0, 0], 0.55), RUB);
  };
  P.bench = (m) => {
    mesh(G.box, M.mul(m, Mx(0, 1.1, 0, 3.2, 0.34, 1.05)), K.upholstery, UPH);
    mesh(G.box, M.mul(m, Mx(0, 0.92, 0, 3.0, 0.1, 0.9)), K.graphite, BLACK);
    [-1, 1].forEach((s) => { mesh(G.box, M.mul(m, Mx(s * 1.2, 0.45, 0, 0.18, 0.9, 0.9)), K.charcoal, BLACK); mesh(G.box, M.mul(m, Mx(s * 1.2, 0.04, 0, 0.18, 0.08, 1.2)), K.charcoal, BLACK); });
  };
  P.rack = (m, open = 1) => { // power rack 4 montanti, barra per trazioni, ganci arancio
    const W = 5.2, D = 4.4, Hh = 9.6;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      mesh(G.box, M.mul(m, Mx(sx * W / 2, Hh * open / 2, sz * D / 2, 0.32, Hh * open, 0.32)), K.charcoal, BLACK);
      for (let i = 0; i < 9 * open; i++) mesh(G.cyl12, M.mul(m, Mx(sx * W / 2, 0.8 + i * 1.0, sz * D / 2 + 0.17, 0.07, 0.04, 0.07, Math.PI / 2, 0, 0)), K.black, MATT); // fori
    });
    [[-1], [1]].forEach(([sz]) => mesh(G.box, M.mul(m, Mx(0, Hh * open, sz * D / 2, W + 0.3, 0.3, 0.32)), K.charcoal, BLACK));
    [-1, 1].forEach((sx) => mesh(G.box, M.mul(m, Mx(sx * W / 2, Hh * open, 0, 0.32, 0.3, D)), K.charcoal, BLACK));
    mesh(G.cyl12, M.mul(m, Mx(0, Hh * open - 0.1, -D / 2 - 0.5, 0.12, W + 0.8, 0.12, 0, 0, Math.PI / 2)), K.chrome, CHROME);     // barra trazioni
    [-1, 1].forEach((sx) => { mesh(G.box, M.mul(m, Mx(sx * (W / 2 - 0.4), 4.5 * open, D / 2 - 0.3, 0.36, 0.14, 0.7)), K.orange, PAINT); });
    mesh(G.box, M.mul(m, Mx(0, 2.6 * open, D / 2, 0.8, 0.05, 0.02)), K.orange, PAINT);
  };
  P.dumbbellRack = (m, n = 5) => {
    mesh(G.box, M.mul(m, Mx(0, 1.2, 0, 7.2, 0.14, 1.5)), K.charcoal, BLACK);
    mesh(G.box, M.mul(m, Mx(0, 2.4, 0, 7.2, 0.14, 1.5)), K.charcoal, BLACK);
    [-1, 1].forEach((s) => mesh(G.box, M.mul(m, Mx(s * 3.5, 1.2, 0, 0.2, 2.4, 1.4)), K.charcoal, BLACK));
    for (let i = 0; i < n; i++) { const s = 0.7 + i * 0.07; P.hexDumbbell(M.mul(m, M.chain(M.T(-2.7 + i * 1.3, 1.45 + 0.09 * s, 0), M.S(s))), K.black); P.hexDumbbell(M.mul(m, M.chain(M.T(-2.7 + i * 1.3, 2.7 + 0.09 * s, 0), M.S(s * 0.85))), K.black); }
  };
  P.cable = (m, t = 0) => { // torre a cavi con pila di pesi
    mesh(G.box, M.mul(m, Mx(0, 5.2, 0, 0.5, 10.4, 0.5)), K.charcoal, BLACK);
    mesh(G.box, M.mul(m, Mx(0, 0.35, 0.3, 2.2, 0.7, 2.2)), K.charcoal, BLACK);
    for (let i = 0; i < 10; i++) mesh(G.box, M.mul(m, Mx(0, 1.0 + i * 0.5 + (i > 5 ? 0.3 + 0.2 * Math.sin(t * 1.5) : 0), 0.32, 1.5, 0.4, 0.04)), i === 5 ? K.orange : K.steel, i === 5 ? PAINT : STEEL);
    mesh(G.cyl12, M.mul(m, Mx(0, 8.2, 0.55, 0.22, 0.2, 0.22, Math.PI / 2, 0, 0)), K.steel, STEEL);
    mesh(G.box, M.mul(m, Mx(0, 5.2, 0.28, 0.08, 7.2, 0.06)), K.orange, PAINT);
  };
  P.band = (m, col = K.orange, r = 0.7) => mesh(G.ringT, M.mul(m, M.chain(M.S(r), M.Rx(Math.PI / 2))), col, { spec: 0.15, shin: 20, rim: 0.7 });
  P.mat = (m, col = K.sage, w = 1.4, l = 4.0, th = 0.09) => mesh(G.box, M.mul(m, Mx(0, th / 2, 0, w, th, l)), col, { spec: 0.1, shin: 16, rim: 0.7, mat: MAT.cloth });
  P.rolledMat = (m, col = K.sage) => { mesh(G.cyl12, M.mul(m, Mx(0, 0.28, 0, 0.5, 1.5, 0.5, 0, 0, Math.PI / 2)), col, { spec: 0.1, shin: 16, rim: 0.7 }); mesh(G.disc, M.mul(m, Mx(0.76, 0.28, 0, 0.3, 0.02, 0.3, 0, 0, Math.PI / 2)), mixc(col, [0, 0, 0], 0.3), MATT); };
  P.bottle = (m, col = K.sky) => {
    mesh(G.bottle, M.mul(m, Mx(0, 0.52, 0, 0.17, 0.4, 0.17)), col, { spec: 0.5, shin: 70, rim: 0.9 });
    mesh(G.cyl12, M.mul(m, Mx(0, 1.1, 0, 0.1, 0.1, 0.1)), K.black, MATT);
  };
  P.cone = (m, col = K.orange, s = 1) => mesh(G.cone, M.mul(m, Mx(0, 0.5 * s, 0, 0.5 * s, 1.0 * s, 0.5 * s)), col, { spec: 0.15, shin: 20, rim: 0.7 });
  P.sandbag = (m, col = K.olive) => { mesh(G.pill, M.mul(m, Mx(0, 0.5, 0, 0.5, 0.5, 0.5, 0, 0, Math.PI / 2)), col, { spec: 0.05, shin: 10, rim: 0.7, mat: MAT.cloth }); mesh(G.box, M.mul(m, Mx(0, 0.82, 0, 1.3, 0.06, 0.1)), K.black, MATT); };
  P.plyo = (m, h = 2.2) => { // box pliometrico in legno con bordi neri
    mesh(G.box, M.mul(m, Mx(0, h / 2, 0, 2.0, h, 1.8)), K.birch, WOOD);
    [-1, 1].forEach((s) => { mesh(G.box, M.mul(m, Mx(s * 1.0, h / 2, 0, 0.06, h + 0.02, 1.82)), K.black, MATT); mesh(G.box, M.mul(m, Mx(0, h / 2, s * 0.9, 2.02, h + 0.02, 0.06)), K.black, MATT); });
    mesh(G.box, M.mul(m, Mx(0, h + 0.01, 0, 2.02, 0.05, 1.84)), K.black, MATT);
    mesh(G.box, M.mul(m, Mx(0, h * 0.55, 0.91, 0.9, 0.16, 0.02)), K.orange, PAINT);
  };
  P.stopwatch = (m) => { mesh(G.cyl12, M.mul(m, Mx(0, 0, 0, 0.35, 0.12, 0.35, Math.PI / 2, 0, 0)), K.black, GLOSS); mesh(G.disc, M.mul(m, Mx(0, 0, 0.07, 0.28, 0.02, 0.28, Math.PI / 2, 0, 0)), K.orange, { ...PAINT, spec: 0.6 }); };

  /* ---------- Pilates ---------- */
  // reformer: telaio lungo 6,4 lungo x. slide ∈ [0,1] = posizione del carrello (0 vicino al poggiapiedi, 1 lontano)
  P.reformer = (m, slide = 0.5, frame = K.white, strap = true) => {
    const L = 6.4, Wd = 1.7, Hy = 1.05;
    // gambe e telaio (rovere chiaro + bianco)
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => mesh(G.box, M.mul(m, Mx(sx * (L / 2 - 0.2), Hy / 2, sz * (Wd / 2 - 0.1), 0.2, Hy, 0.2)), K.oakL, WOOD));
    [-1, 1].forEach((sz) => { mesh(G.box, M.mul(m, Mx(0, Hy + 0.1, sz * (Wd / 2 - 0.1), L, 0.22, 0.22)), K.oakL, WOOD); mesh(G.box, M.mul(m, Mx(0, Hy + 0.24, sz * (Wd / 2 - 0.05), L - 0.1, 0.06, 0.06)), K.steel, STEEL); });
    // piattaforma fissa (testa) e poggiapiedi
    mesh(G.box, M.mul(m, Mx(-L / 2 + 0.7, Hy + 0.3, 0, 1.3, 0.2, Wd - 0.3)), K.upholstery, UPH);
    mesh(G.box, M.mul(m, Mx(L / 2 - 0.1, Hy + 1.0, 0, 0.14, 1.9, Wd)), frame, PAINT);
    mesh(G.cyl12, M.mul(m, Mx(L / 2 - 0.35, Hy + 1.6, 0, 0.09, Wd + 0.1, 0.09, Math.PI / 2, 0, 0)), K.chrome, CHROME);   // poggiapiedi (barra cromata)
    // carrello scorrevole con cuscino
    const cx = -L / 2 + 1.7 + (1 - slide) * 0 + slide * 0; void cx;
    const x0 = L / 2 - 1.9, x1 = -L / 2 + 2.9, cxs = x0 + (x1 - x0) * slide;
    mesh(G.box, M.mul(m, Mx(cxs, Hy + 0.46, 0, 2.9, 0.18, Wd - 0.35)), K.graphite, BLACK);
    mesh(G.box, M.mul(m, Mx(cxs, Hy + 0.64, 0, 2.8, 0.22, Wd - 0.4)), K.upholstery, UPH);
    [-1, 1].forEach((s) => mesh(G.box, M.mul(m, Mx(cxs + 1.0, Hy + 0.86, s * (Wd / 2 - 0.45), 0.4, 0.34, 0.3)), K.upholstery, UPH));   // spalliere
    // molle: arancio e nere tra carrello e poggiapiedi
    for (let i = 0; i < 4; i++) { const zz = -0.6 + i * 0.4, a = M.T(0, 0, 0); void a; const len = (L / 2 - 0.4) - (cxs + 1.4); mesh(G.coil, M.mul(m, Mx(cxs + 1.4 + len / 2, Hy + 0.2, zz, len / 1.0 * 0.5, 1.0, 1.0)), i === 0 ? K.orange : K.charcoal, i === 0 ? PAINT : BLACK); }
    if (strap) { // corde che salgono dalla puleggia e maniglie
      [-1, 1].forEach((s) => { mesh(G.limb, M.mul(m, M.chain(M.T(-L / 2 + 0.35, Hy + 1.95, s * 0.45), M.S(0.026, 0.3, 0.026))), K.charcoal, MATT); mesh(G.ringT, M.mul(m, Mx(-L / 2 + 0.35, Hy + 1.6, s * 0.45, 0.14, 0.14, 0.14, 0, 0, 0)), K.charcoal, MATT); });
    }
  };
  P.cadillac = (m) => { // lettino con struttura alta
    const L = 7.0, Wd = 2.6, Hh = 7.6;
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => mesh(G.cyl12, M.mul(m, Mx(sx * (L / 2 - 0.2), Hh / 2, sz * (Wd / 2 - 0.1), 0.2, Hh, 0.2)), K.chrome, CHROME));
    [-1, 1].forEach((sz) => mesh(G.cyl12, M.mul(m, Mx(0, Hh, sz * (Wd / 2 - 0.1), 0.14, L, 0.14, 0, 0, Math.PI / 2)), K.chrome, CHROME));
    [-1, 1].forEach((sx) => mesh(G.cyl12, M.mul(m, Mx(sx * (L / 2 - 0.2), Hh, 0, 0.14, Wd, 0.14, Math.PI / 2, 0, 0)), K.chrome, CHROME));
    mesh(G.box, M.mul(m, Mx(0, 3.0, 0, L, 0.3, Wd)), K.upholstery, UPH);
    mesh(G.box, M.mul(m, Mx(0, 2.7, 0, L - 0.2, 0.34, Wd - 0.2)), K.white, PAINT);
    for (let i = 0; i < 2; i++) mesh(G.coil, M.mul(m, Mx(-1.5 + i * 3, 5.4, 0, 1.2, 1, 1, 0, 0, Math.PI / 2)), i ? K.orange : K.charcoal, i ? PAINT : BLACK);
    mesh(G.cyl12, M.mul(m, Mx(L / 2 - 1.0, 5.0, 0, 0.09, Wd - 0.4, 0.09, Math.PI / 2, 0, 0)), K.chrome, CHROME);
  };
  P.wunda = (m) => { // chair con pedale
    mesh(G.box, M.mul(m, Mx(0, 1.8, 0, 1.9, 0.3, 1.9)), K.upholstery, UPH);
    mesh(G.box, M.mul(m, Mx(0, 0.9, 0, 2.0, 1.7, 2.0)), K.oakL, WOOD);
    mesh(G.box, M.mul(m, Mx(1.2, 0.9, 0, 0.1, 1.4, 1.4)), K.white, PAINT);
    mesh(G.box, M.mul(m, Mx(1.45, 1.35, 0, 1.0, 0.12, 1.4)), K.upholstery, UPH);
    [-1, 1].forEach((s) => mesh(G.cyl12, M.mul(m, Mx(-0.6, 3.1, s * 0.6, 0.1, 2.4, 0.1)), K.chrome, CHROME));
  };
  P.spineCorrector = (m, col = K.oakL) => { // barile ad arco
    mesh(G.semi, M.mul(m, Mx(0, 0, 0, 2.2, 2.2, 3.6)), col, WOOD);
    mesh(G.semi, M.mul(m, Mx(0, 0.06, 0, 2.18, 2.18, 3.6)), K.upholstery, UPH);
    mesh(G.box, M.mul(m, Mx(0, 0.08, 0, 4.6, 0.16, 3.4)), K.oakL, WOOD);
  };
  P.magicCircle = (m, col = K.chrome) => { mesh(G.ring, M.mul(m, M.chain(M.S(0.78), M.Rx(Math.PI / 2))), col, CHROME); [-1, 1].forEach((s) => mesh(G.box, M.mul(m, Mx(s * 0.78, 0, 0, 0.12, 0.3, 0.3)), K.sage, UPH)); };
  P.fitball = (m, col = K.blush, r = 1.1) => mesh(G.sphere, M.mul(m, Mx(0, r, 0, r, r, r)), col, { spec: 0.32, shin: 40, rim: 0.8 });
  P.block = (m, col = K.sand) => mesh(G.box, M.mul(m, Mx(0, 0.35, 0, 1.6, 0.7, 1.0)), col, { spec: 0.1, shin: 16, rim: 0.6, mat: MAT.cloth });
  P.softBall = (m, col = K.terracotta) => mesh(G.sphere, M.mul(m, Mx(0, 0.5, 0, 0.5, 0.5, 0.5)), col, { spec: 0.25, shin: 30, rim: 0.8 });

  /* ---------- Functional ---------- */
  // fune da battaglia: da un ancoraggio (a) a una mano (b), con onda che si propaga lungo la fune
  P.rope = (a, b, t, amp = 1, ph = 0, col = K.black) => {
    const N = 14; let prev = a;
    for (let i = 1; i <= N; i++) {
      const u = i / N, wave = Math.sin(u * 7 - t * 9 + ph) * 0.55 * amp * Math.sin(Math.PI * Math.min(1, u * 1.1));
      const q = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u + wave - 0.45 * Math.sin(Math.PI * u), a[2] + (b[2] - a[2]) * u];
      mesh(G.limb, boneMrope(prev, q, 0.075), col, MATT); prev = q;
    }
  };
  const boneMrope = (A, B, r) => {
    const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], l = Math.hypot(...d) || 1, y = d.map((x) => x / l);
    const ref = Math.abs(y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let x = [ref[1] * y[2] - ref[2] * y[1], ref[2] * y[0] - ref[0] * y[2], ref[0] * y[1] - ref[1] * y[0]]; const xl = Math.hypot(...x); x = x.map((q) => q / xl);
    const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
    return new Float32Array([x[0] * r, x[1] * r, x[2] * r, 0, d[0], d[1], d[2], 0, z[0] * r, z[1] * r, z[2] * r, 0, A[0], A[1], A[2], 1]);
  };
  P.trx = (m, t = 0, sway = 0) => { // ancoraggio + due cinghie gialle con maniglie
    mesh(G.cyl12, M.mul(m, Mx(0, 0, 0, 0.3, 0.2, 0.3)), K.black, GLOSS);
    [-1, 1].forEach((s) => {
      const x = s * 0.35 + Math.sin(t * 1.3 + s) * 0.05 * sway;
      mesh(G.box, M.mul(m, Mx(x, -2.6, 0, 0.12, 5.2, 0.03)), K.yellow, { spec: 0.1, shin: 16, rim: 0.7, mat: MAT.cloth });
      mesh(G.cyl12, M.mul(m, Mx(x, -5.3, 0, 0.1, 0.55, 0.1, 0, 0, Math.PI / 2)), K.black, MATT);
    });
  };
  P.rig = (m, w = 18) => { // struttura funzionale: montanti e trave con ganci
    [-1, 1].forEach((s) => { mesh(G.box, M.mul(m, Mx(s * w / 2, 5.5, 0, 0.5, 11, 0.5)), K.charcoal, BLACK); mesh(G.box, M.mul(m, Mx(s * w / 2, 0.15, 0, 1.6, 0.3, 2.6)), K.charcoal, BLACK); });
    mesh(G.box, M.mul(m, Mx(0, 11, 0, w + 0.5, 0.5, 0.6)), K.charcoal, BLACK);
    mesh(G.cyl12, M.mul(m, Mx(0, 9.3, 0, 0.14, w, 0.14, 0, 0, Math.PI / 2)), K.chrome, CHROME);
    for (let i = 0; i < 6; i++) mesh(G.box, M.mul(m, Mx(-w / 2 + 1.5 + i * (w - 3) / 5, 11.0, 0.36, 0.22, 0.14, 0.14)), K.orange, PAINT);
  };
  P.weightTree = (m) => { mesh(G.box, M.mul(m, Mx(0, 2.4, 0, 0.3, 4.8, 0.3)), K.charcoal, BLACK); [0, 1, 2].forEach((i) => { mesh(G.cyl12, M.mul(m, Mx(0.5, 1.4 + i * 1.3, 0, 0.1, 1.0, 0.1, 0, 0, Math.PI / 2)), K.charcoal, BLACK); P.plate(M.mul(m, M.T(0.55, 1.4 + i * 1.3, 0)), 0.8 - i * 0.12, K.rubber); }); };

  /* ---------- arredi comuni ---------- */
  P.plant = (m, kind = 0, s = 1) => { // pianta in vaso: foglie lunghe che si aprono a raggiera
    mesh(G.vase, M.mul(m, Mx(0, 0, 0, 0.8 * s, 1.5 * s, 0.8 * s)), kind ? K.terracotta : K.charcoal, { spec: 0.2, shin: 30, rim: 0.7 });
    const n = 9; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + kind; mesh(G.frond, M.mul(m, Mx(0, 1.5 * s, 0, 0.8 * s * (1 + 0.2 * Math.sin(i * 2)), 1.25 * s * (0.8 + 0.3 * Math.cos(i * 1.7)), 0.8 * s, 0, a, 0)), i % 2 ? K.plant : K.plant2, { spec: 0.3, shin: 34, rim: 0.7 }); }
  };
  P.kLogo = (m, col = K.orange, glow = 0.5) => { // il simbolo K LAB: due chevron
    const o = { spec: 0.2, shin: 30, rim: 0.5 }, g = [col[0] * glow, col[1] * glow, col[2] * glow];
    [0, 1].forEach((i) => [1, -1].forEach((s) => mesh(G.box, M.mul(m, Mx(i * 1.1, s * 0.62, 0, 0.5, 1.9, 0.18, 0, 0, s * 0.72)), col, { ...o, glow: g })));
  };
  P.pendant = (m, col = [1, 0.86, 0.66], k = 1) => { // lampada a sospensione con luce che sfonda il bagliore
    mesh(G.cyl12, M.mul(m, Mx(0, 3, 0, 0.03, 6, 0.03)), K.black, MATT);
    mesh(G.dome, M.mul(m, Mx(0, -0.1, 0, 0.9, 0.55, 0.9)), K.black, BLACK);
    mesh(G.disc, M.mul(m, Mx(0, -0.12, 0, 0.7, 0.05, 0.7)), col, { spec: 0, shin: 1, rim: 0, glow: [col[0] * 1.6 * k, col[1] * 1.6 * k, col[2] * 1.6 * k] });
  };
  P.strip = (m, len, col = [1, 0.95, 0.85], k = 1) => mesh(G.box, M.mul(m, M.S(len, 0.12, 0.2)), col, { spec: 0, shin: 1, rim: 0, glow: [col[0] * 1.5 * k, col[1] * 1.5 * k, col[2] * 1.5 * k] });
  return P;
}
