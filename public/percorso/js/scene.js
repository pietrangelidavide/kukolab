// La scena del percorso: un solo piano sequenza. La camera segue il cliente da una sala all'altra (porta d'ingresso, Personal Training,
// Pilates, Functional, finale). Tutto è una funzione di `pos` (0 → 6, la posizione nello scorrimento) e del tempo: scorrendo all'indietro
// la sequenza si riavvolge identica. Il motore è lo stesso già usato altrove (WebGL2 scritto a mano, senza librerie): niente da compilare.
import { createGL, texFromBitmap, M, PAL, mixc, sphere, cyl, torus, box, upload, lathe, smooth } from './engine.js';
import { createCine } from './cine.js';
import { setLight, MAT } from './light.js';

const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lin = (a, b, x) => cl((x - a) / (b - a));
const sm = (a, b, x) => { const t = lin(a, b, x); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const eo = (t) => 1 - Math.pow(1 - t, 3);
const pop = (t) => { t = cl(t); const c1 = 1.9, c3 = c1 + 1; return t <= 0 ? 0 : 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
let sd = 11; const rnd = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };

export const STEPS = 6;
const FOV = 28 * Math.PI / 180, TANH = Math.tan(FOV / 2);

/* ---------- inquadrature: [pos, ox, oy, oz, dist, yaw, elev, shx, need(mezza larghezza su telefono), tyf(telefono: quanto sale la scena)] ---------- */
// ox = scarto in x rispetto al cliente (nei tratti a piedi la camera lo segue), oy/oz = punto guardato, dist = distanza (unità: una persona è alta 4),
// yaw = giro intorno al punto, shx = quanto il soggetto sta a destra del centro (a sinistra c'è il testo), need = larghezza minima su telefono
const CAM = [
  [0.00, 0.5, 4.7, -2.6, 23.5, 0.00, 0.03, 0.12, 4.6, 0.36],
  [0.12, 0.4, 3.8, -2.2, 20.0, 0.06, 0.03, 0.10, 4.2, 0.34],
  [0.30, 1.6, 3.0, -0.6, 16.5, 0.30, 0.05, 0.06, 4.0, 0.30],
  [0.62, 2.7, 2.8, 0.4, 17.0, 0.08, 0.04, 0.20, 4.2, 0.26],
  [1.38, 2.7, 2.8, 0.4, 17.0, 0.08, 0.04, 0.20, 4.2, 0.26],
  [2.00, 3.2, 2.7, 0.2, 14.5, 0.42, 0.05, 0.05, 4.0, 0.22],
  [2.62, 2.6, 2.3, 0.0, 16.5, 0.12, 0.17, 0.19, 4.8, 0.22],
  [3.38, 2.6, 2.3, 0.0, 16.5, 0.12, 0.17, 0.19, 4.8, 0.22],
  [4.00, 3.4, 2.7, 0.2, 14.5, 0.42, 0.05, 0.05, 4.0, 0.22],
  [4.62, 1.2, 2.9, -0.8, 19.5, 0.04, 0.05, 0.20, 5.6, 0.22],
  [5.30, 1.2, 2.9, -0.8, 19.5, 0.04, 0.05, 0.20, 5.6, 0.22],
  [5.62, 2.6, 3.0, -0.6, 17.0, 0.30, 0.05, 0.04, 4.4, 0.22],
  [5.88, 0.0, 3.0, -1.4, 24.0, 0.0, 0.04, 0.28, 6.9, 0.46],
  [6.00, 0.0, 3.0, -1.4, 24.0, 0.0, 0.04, 0.28, 6.9, 0.46],
];
function camAt(pos) {
  const n = CAM.length; let i = 0; while (i < n - 2 && pos > CAM[i + 1][0]) i++;
  const a = CAM[i], b = CAM[i + 1], h = b[0] - a[0], u = cl((pos - a[0]) / h);
  const out = [];
  for (let k = 1; k < a.length; k++) {
    // Hermite con tangenti ai vicini (e fermo nei tratti piatti): la camera accompagna senza scatti
    const p0 = a[k], p1 = b[k];
    const tg = (idx) => { const pp = CAM[Math.max(0, idx - 1)], nn = CAM[Math.min(n - 1, idx + 1)], c = CAM[idx]; const dt = nn[0] - pp[0]; return dt > 1e-6 ? (nn[k] - pp[k]) / dt : 0; };
    const m0 = tg(i) * h * (a[k] === p1 && CAM[Math.max(0, i - 1)][k] === a[k] ? 0 : 1), m1 = tg(i + 1) * h * (b[k] === p0 && CAM[Math.min(n - 1, i + 2)][k] === b[k] ? 0 : 1);
    const u2 = u * u, u3 = u2 * u;
    out.push((2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1);
  }
  return out;
}

/* ---------- atmosfera di ogni sala (valori lineari) ---------- */
const MOOD = [
  { key: [0.86, 0.8, 0.72], aT: [0.2, 0.22, 0.26], aB: [0.1, 0.1, 0.11], rim: [0.95, 0.5, 0.3], top: [0.055, 0.055, 0.065], bot: [0.12, 0.115, 0.115], fog: [0.08, 0.08, 0.09], glow: [0.5, 0.3, 0.2], dark: 0.7 },
  { key: [0.95, 0.97, 1.0], aT: [0.17, 0.19, 0.23], aB: [0.08, 0.08, 0.09], rim: [1.0, 0.42, 0.16], top: [0.04, 0.045, 0.055], bot: [0.09, 0.09, 0.1], fog: [0.07, 0.075, 0.085], glow: [0.2, 0.25, 0.35], dark: 0.7 },
  { key: [1.0, 0.9, 0.74], aT: [0.42, 0.4, 0.36], aB: [0.3, 0.25, 0.18], rim: [1.0, 0.85, 0.65], top: [0.7, 0.66, 0.58], bot: [0.8, 0.72, 0.6], fog: [0.72, 0.66, 0.56], glow: [1.0, 0.9, 0.75], dark: 0.0 },
  { key: [1.0, 0.82, 0.66], aT: [0.15, 0.15, 0.16], aB: [0.07, 0.06, 0.06], rim: [1.0, 0.3, 0.1], top: [0.05, 0.04, 0.04], bot: [0.12, 0.07, 0.05], fog: [0.09, 0.06, 0.05], glow: [0.7, 0.25, 0.1], dark: 0.85 },
  { key: [1.0, 0.9, 0.78], aT: [0.13, 0.13, 0.15], aB: [0.05, 0.05, 0.06], rim: [1.0, 0.45, 0.2], top: [0.03, 0.03, 0.035], bot: [0.07, 0.065, 0.065], fog: [0.05, 0.05, 0.055], glow: [0.7, 0.3, 0.15], dark: 1.0 },
];
const ZXC = [0, 22, 46, 70, 94];

export async function createScene(canvas, { base = '' } = {}) {
  const C = createGL(canvas); if (!C) return null;
  const { gl, P } = C;
  const QS = new URLSearchParams(location.search);
  let cine = null;
  if (QS.get('cine') !== '0') { try { cine = createCine(C); } catch (e) { console.warn('[cinema] non disponibile:', e.message); } }
  const FX = { tier: 0, shadows: QS.get('ombre') !== '0' };
  const dummySM = cine ? null : (() => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, 1, 1, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    return t;
  })();

  /* ---------- risorse ---------- */
  const visi = await (await fetch(base + 'img/visi.json')).json();
  try { await Promise.all([document.fonts.load('700 200px "Big Shoulders"'), document.fonts.load('400 40px "Instrument Sans"')]); } catch (e) { /* font di riserva */ }
  const T = {};
  const cv = (w, h, fn, o = { mip: true }) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); fn(g, w, h); const tx = texFromBitmap(gl, c, { mip: o.mip, premul: true }); tx.canvas = c; return tx; };
  const DISP = '700 {S}px "Big Shoulders", "Arial Narrow", Impact, sans-serif';
  const word = (txt, S = 330, col = '#fff') => cv(2048, 512, (g, W, H) => { g.fillStyle = col; g.font = DISP.replace('{S}', S); g.textAlign = 'center'; g.textBaseline = 'middle'; if ('letterSpacing' in g) g.letterSpacing = (S * 0.04) + 'px'; g.fillText(txt, W / 2, H / 2 + S * 0.04); });
  T.z0 = word('KUKO LAB', 340); T.z1 = word('PERSONAL', 340); T.z2 = word('PILATES', 340); T.z3 = word('FUNCTIONAL', 340);
  // timer di parete: cifre arancioni che scorrono (si aggiorna una volta al secondo)
  T.timer = cv(768, 288, () => { }, { mip: false });
  let timerSec = -1;
  function timerDraw(sec) {
    const g = T.timer.canvas.getContext('2d'), W = 768, H = 288;
    g.clearRect(0, 0, W, H); g.fillStyle = 'rgba(8,8,10,1)'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e86028'; g.font = DISP.replace('{S}', 220); g.textAlign = 'center'; g.textBaseline = 'middle';
    const left = 45 - (sec % 46), mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0');
    g.fillText(`${mm}:${ss}`, W / 2, H / 2 + 10);
    g.fillStyle = 'rgba(255,255,255,.7)'; g.font = DISP.replace('{S}', 40); g.textAlign = 'left'; g.fillText('WORK', 34, 40); g.textAlign = 'right'; g.fillText('ROUND 3/5', W - 34, 40);
    gl.bindTexture(gl.TEXTURE_2D, T.timer.t); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, T.timer.canvas);
  }
  timerDraw(0);

  /* ---------- geometrie ---------- */
  const up = (g) => upload(gl, g);
  const G = {
    sphere: up(sphere(28)), box: up(box()), cyl: up(cyl(40)), torus: up(torus(1, 0.22, 48, 14)), ring: up(torus(1, 0.035, 72, 8)), ringT: up(torus(1, 0.09, 48, 10)),
    bottle: up(lathe([[0, -1], [0.55, -1], [0.55, -1], [0.6, -0.92], [0.6, 0.25], [0.5, 0.45], [0.28, 0.62], [0.18, 0.74], [0.17, 1.1], [0.17, 1.1], [0.22, 1.12], [0.22, 1.28], [0, 1.28]], 36)),
    limb: up(lathe(smooth([[0, 0], [0.55, 0.004], [0.92, 0.04], [1, 0.1], [0.93, 0.72], [0.8, 0.93], [0.5, 0.99], [0, 1]], 4), 20)),
  };
  const defM = { spec: 0.14, shin: 26, rim: 0.7 };

  /* ---------- stato ---------- */
  const S = { w: 1, h: 1, dpr: 1, asp: 1.6, mobile: false };
  const vp = new Float32Array(16);
  let eye = [0, 0, 10], time = 0;
  const mvpQuad = (x, y, z, w, h, rz = 0) => M.mul(vp, M.chain(M.T(x, y, z), M.Rz(rz), M.S(w, h, 1)));

  /* ---------- disegno ---------- */
  function setMesh(m, col, o = {}) {
    const u = P.mesh.u;
    gl.uniformMatrix4fv(u.uM, false, m); gl.uniform3fv(u.uCol, col);
    gl.uniform4f(u.uP, o.spec ?? defM.spec, o.shin ?? defM.shin, o.rim ?? defM.rim, o.mat || 0);
    gl.uniform1f(u.uAlpha, o.alpha ?? 1);
    gl.uniform3fv(u.uGlow, o.glow || [0, 0, 0]);
  }
  let REC = null, GLASS = [];
  let DRAWS = 0;
  function drawMesh(g, m, col, o) { DRAWS++; setMesh(m, col, o); gl.bindVertexArray(g.vao); gl.drawElements(gl.TRIANGLES, g.n, gl.UNSIGNED_INT, 0); }
  function mesh(g, m, col, o) { if (REC) REC.push({ g, m, col, o }); else drawMesh(g, m, col, o); }
  function later(fn) { if (REC) REC.push({ fn }); else fn(); }
  const glass = (g, m, col, alpha = 0.2, o = {}) => GLASS.push({ g, m, col, o: { spec: 0.9, shin: 120, rim: 1, ...o, alpha } });
  function replay(list, shadow) {
    if (shadow) {
      const su = P.shadow.u;
      for (const r of list) {
        if (r.fn || (r.o && ((r.o.alpha != null && r.o.alpha < 0.5) || r.o.noShadow))) continue;
        gl.uniformMatrix4fv(su.uM, false, r.m); gl.bindVertexArray(r.g.vao); gl.drawElements(gl.TRIANGLES, r.g.n, gl.UNSIGNED_INT, 0);
      }
    } else for (const r of list) { if (r.fn) r.fn(); else drawMesh(r.g, r.m, r.col, r.o); }
  }
  function quadFX(kind, x, y, z, w, h, col, alpha, o = {}) {
    if (alpha <= 0.002) return;
    const u = P.fx.u;
    gl.uniformMatrix4fv(u.uMVP, false, mvpQuad(x, y, z, w, h, o.rz || 0));
    gl.uniform1f(u.uKind, kind); gl.uniform1f(u.uAlpha, alpha); gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uA, o.a ?? 2); gl.uniform1f(u.uB, o.b ?? 1); gl.uniform1f(u.uC, o.c ?? 0);
    gl.uniform3fv(u.uCol, col); gl.uniform3fv(u.uCol2, o.col2 || col);
    gl.bindVertexArray(C.qv); gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  function quadTexNow(tx, x, y, z, w, h, o = {}) {
    const a = o.alpha ?? 1; if (a <= 0.002) return;
    const u = P.tex.u;
    gl.uniformMatrix4fv(u.uMVP, false, mvpQuad(x, y, z, w, h, o.rz || 0));
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tx.t); gl.uniform1i(u.uTex, 0);
    gl.uniform1f(u.uAlpha, a); gl.uniform1f(u.uMode, o.mode ?? 0); gl.uniform1f(u.uBias, o.bias ?? 0);
    gl.uniform1f(u.uPIn, 1); gl.uniform1f(u.uPOut, 0); gl.uniform1f(u.uAsp, w / h);
    gl.uniform3fv(u.uTint, o.tint || [1, 1, 1]); gl.uniform3fv(u.uPink, PAL.pink); gl.uniform3fv(u.uRim, PAL.sandL || [1, 1, 1]); gl.uniform2f(u.uRes, S.w, S.h);
    gl.bindVertexArray(C.qv); gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  // adesivo su una parete dentro al passaggio opaco (timer, scritte): si disegna nel suo punto, con la mescola corretta
  function decal(tx, x, y, z, w, h, o = {}) {
    later(() => {
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      gl.useProgram(P.tex.p); quadTexNow(tx, x, y, z, w, h, o);
      gl.depthMask(true); gl.disable(gl.BLEND); gl.useProgram(P.mesh.p);
    });
  }

  /* ---------- particelle: pulviscolo nella luce, scintille nella sala Functional ---------- */
  const NP = 150, pa = new Float32Array(NP * 4), pb = new Float32Array(NP * 4);
  const PS = Array.from({ length: NP }, () => ({ x: rnd(), y: rnd(), z: rnd(), s: rnd(), ph: rnd() * 6.28, k: rnd(), sp: 0.4 + rnd() }));

  let ptrS = [0, 0], WRL = null, camCache = null, camOv = null;
  const LT0 = { lvp: M.id(), smOn: false, smSize: 2048, bias: 0.0008, nOff: 0.035, keyC: [1, 1, 1], ambT: [0.3, 0.3, 0.3], ambB: [0.2, 0.2, 0.2], rimC: [1, 1, 1], smTex: dummySM };
  const ctxObj = {
    gl, P, G, T, PAL, mesh, later, glass, MAT, quadFX, quadTex: decal, M, cl, lin, sm, lerp, eo, pop, mixc, S, base, visi,
    get time() { return time; }, hooks: { opaque: [], titles: [], front: [] },
  };
  const hooks = ctxObj.hooks;

  const mixArr = (key, w) => [0, 1, 2].map((c) => MOOD.reduce((a, m, i) => a + m[key][c] * w[i], 0));
  function zoneW(x) {
    const wts = ZXC.map((z) => sm(0.12, 0.9, Math.max(0, 1 - Math.abs(x - z) / 23)));
    const s = wts.reduce((a, b) => a + b, 0) || 1; return wts.map((v) => v / s);
  }

  function render(pos, t, pointer = [0, 0], intro = 1) {
    time = t; pos = cl(pos, 0, STEPS);
    ptrS[0] += (pointer[0] - ptrS[0]) * 0.05; ptrS[1] += (pointer[1] - ptrS[1]) * 0.05;
    const sec = Math.floor(t); if (sec !== timerSec) { timerSec = sec; timerDraw(sec); }
    const c = WRL.cpath(pos);
    const w = zoneW(c.x);
    const [ox, oy, oz, dist0, yaw0, el, shx0, need, tyf] = camAt(pos);
    let dist = dist0;
    if (S.asp < 1.25) dist = Math.max(dist, need / (S.asp * TANH));
    dist *= lerp(1.28, 1, eo(intro)); // dolly d'ingresso
    const Hv = TANH * dist, Wv = Hv * S.asp;
    const yaw = yaw0 + ptrS[0] * 0.05 + Math.sin(t * 0.33) * 0.008;
    const shx = S.mobile ? 0 : shx0 * cl((S.asp - 1.1) / 0.5);
    // su computer, nella sala Personal la scena sale un po': sotto a destra c'è il ritaglio di Valerio e non deve coprire i piedi dei personaggi
    const dsh = S.mobile ? 0 : 0.17 * (sm(0.5, 0.7, pos) - sm(1.3, 1.5, pos));
    const ty = S.mobile ? -tyf * Hv : -dsh * Hv;
    // su telefono la scena sale inclinando lo sguardo (non abbassando l'occhio): da lontano l'occhio non finisce sotto il pavimento
    const ty0 = oy + ptrS[1] * -0.1;
    const tgt = [c.x + ox - Math.cos(yaw) * shx * Wv, ty0 + ty, oz + Math.sin(yaw) * shx * Wv];
    eye = [tgt[0] + Math.sin(yaw) * dist * Math.cos(el), Math.max(1.6, ty0 + Math.sin(el) * dist), tgt[2] + Math.cos(yaw) * dist * Math.cos(el)];
    if (camOv) { eye = camOv.slice(0, 3); tgt[0] = camOv[3]; tgt[1] = camOv[4]; tgt[2] = camOv[5]; }
    vp.set(M.mul(M.persp(FOV, S.asp, 0.5, 170), M.look(eye, tgt)));
    const R = { Wv, Hv, ty, dist, intro, fx: c.x, tgt };
    camCache = R;

    // ---- luce di sala: cambia con la posizione del cliente
    const lt = cine ? cine.light : LT0;
    lt.keyC = mixArr('key', w); lt.ambT = mixArr('aT', w); lt.ambB = mixArr('aB', w); lt.rimC = mixArr('rim', w);
    const dark = MOOD.reduce((a, m, i) => a + m.dark * w[i], 0);
    const FOGM = mixArr('fog', w);
    const fogK = [dist * 1.25, dist * 3.6];
    ctxObj.U = { vp, eye, fogC: FOGM, fog: fogK, light3: lt };

    // ---- oggetti 3D: registrati una volta, disegnati per le ombre e per l'immagine
    DRAWS = 0; GLASS = []; REC = []; hooks.opaque.forEach((f) => f(pos, t, R)); const list = REC; REC = null;
    const useC = !!(cine && cine.ok && FX.tier < 2);
    lt.smOn = false;
    if (useC && FX.shadows) { cine.shadowBegin([c.x + 1.5, 1.6, Math.min(0.5, c.z)], 12.5); replay(list, true); cine.shadowEnd(); }
    if (useC) cine.sceneBegin(); else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, S.w, S.h); }
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(true);
    gl.clearColor(0.05, 0.05, 0.06, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // ---- sfondo (si vede solo sopra la parete di fondo)
    gl.useProgram(P.bg.p); const U = P.bg.u;
    gl.uniform3fv(U.uTop, mixArr('top', w)); gl.uniform3fv(U.uBot, mixArr('bot', w)); gl.uniform3fv(U.uGlow, mixArr('glow', w)); gl.uniform3fv(U.uVig, FOGM);
    gl.uniform2f(U.uGlowPos, 0.5, 0.35); gl.uniform1f(U.uGlowK, 0.35); gl.uniform1f(U.uAsp, S.asp); gl.uniform1f(U.uTime, t); gl.uniform1f(U.uVigK, 0.5);
    gl.bindVertexArray(C.bv); gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ---- passaggio opaco
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.useProgram(P.mesh.p); const mu = P.mesh.u;
    gl.uniformMatrix4fv(mu.uVP, false, vp); gl.uniform3fv(mu.uEye, eye);
    gl.uniform3fv(mu.uFogC, FOGM); gl.uniform2f(mu.uFog, fogK[0], fogK[1]);
    setLight(gl, mu, ctxObj.U);
    replay(list, false);

    // ---- vetri (traslucidi, da lontano a vicino)
    gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(P.mesh.p);
    GLASS.sort((a, b) => a.m[14] - b.m[14]);
    for (const r of GLASS) drawMesh(r.g, r.m, r.col, r.o);

    // ---- scritte e aloni
    gl.useProgram(P.tex.p); hooks.titles.forEach((f) => f(pos, t, R, w, quadTexNow));
    gl.useProgram(P.fx.p); hooks.front.forEach((f) => f(pos, t, R, w, quadFX));
    drawParticles(pos, t, R, w, dark);
    gl.depthMask(true); gl.disable(gl.BLEND);

    // ---- post-produzione: bagliore, profondità di campo, curva filmica, grana
    if (useC) {
      const hk = S.h / 1000;
      cine.sceneEnd({
        time: t, thr: [1.02, 1.5], bloom: 0.3 + dark * 0.1, streak: FX.tier < 1 ? 0.04 + dark * 0.1 : 0,
        dof: FX.tier < 1, dofPx: 5 * hk, focus: dist - 0.2, near: 0.5, far: 170,
        sat: 1.06, vig: 0.34 + dark * 0.14, grain: 0.03, ca: 0.007,
        shT: [-0.012, 0.004, 0.016], hiT: [1.03, 1.0, 0.96], vigT: [0.8, 0.62, 0.62],
      });
    }
  }

  function drawParticles(pos, t, R, w, dark) {
    const fun = w[3], span = R.Wv * 1.3 + 6, lightC = mixc([1, 0.95, 0.85], [1, 0.85, 0.7], dark);
    for (let i = 0; i < NP; i++) {
      const p = PS[i];
      const x0 = R.tgt[0] - span, W2 = span * 2;
      const x = x0 + ((((p.x * W2 - x0 + t * 0.12 * p.sp) % W2) + W2) % W2);
      const y = ((p.y + t * (0.02 + fun * 0.16) * p.sp) % 1) * 11 + 0.2;
      const z = R.tgt[2] + (p.z - 0.5) * 12 - 1;
      const spark = p.k < fun * 0.8;
      const size = (0.03 + p.s * 0.06) * (spark ? 1.5 : 1);
      const col = spark ? PAL.pink : lightC;
      const a = (spark ? 0.8 : 0.22 + dark * 0.1) * (0.5 + 0.5 * Math.sin(t * 0.9 + p.ph));
      pa.set([x, y, z, size * 80], i * 4); pb.set([col[0], col[1], col[2], a], i * 4);
    }
    gl.useProgram(P.pt.p);
    gl.uniformMatrix4fv(P.pt.u.uVP, false, vp); gl.uniform1f(P.pt.u.uPx, S.h * 0.5 / TANH * 0.0125);
    gl.uniform1f(P.pt.u.uSoft, 0.55);
    gl.bindVertexArray(C.pv);
    gl.bindBuffer(gl.ARRAY_BUFFER, C.pa); gl.bufferData(gl.ARRAY_BUFFER, pa, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, C.pb); gl.bufferData(gl.ARRAY_BUFFER, pb, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.POINTS, 0, NP);
  }

  /* ---------- il mondo ---------- */
  const { addWorld } = await import('./world.js');
  WRL = await addWorld(ctxObj);

  // scritte giganti sulla parete di fondo, nella sala in cui si trova il cliente (le lettere sono l'unico "testo" della scena)
  // (niente scritte giganti sulle pareti: il testo sta nella pagina, la scena resta libera)

  function resize(w, h, dpr) {
    S.dpr = dpr; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    S.w = canvas.width; S.h = canvas.height; S.asp = w / h; S.mobile = S.asp < 0.9;
    if (cine) cine.resize(S.w, S.h);
  }
  function lower() { if (FX.tier < 2) { FX.tier++; console.info('[cinema] livello', FX.tier); return true; } return false; }
  return { render, resize, lower, S, FX, world: WRL, stats: () => ({ draws: DRAWS }), setCam(a) { camOv = a; }, get cine() { return cine; }, destroy() { const e = gl.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); } };
}
