// Regia del filmato "tutti gli attrezzi": la telecamera attraversa le tre sale e si ferma sugli attrezzi.
// Ogni tappa è una inquadratura (bersaglio, distanza, giro, altezza, campo visivo) con un tempo di sosta; tra una tappa e la successiva la camera scivola
// (Hermite con tangenti ai vicini, ferma nelle soste). Lo stesso file serve a chi disegna i fotogrammi (scripts/filmato-attrezzi.mjs) e alla pagina
// (le etichette seguono gli attrezzi: si ricavano dalla stessa regia).
export const FPS = 24;
const D2R = Math.PI / 180;

// unità del mondo: una persona è alta 4. Sale: Personal x≈22, Pilates x≈46, Functional x≈70 (parete di fondo a z = -7, il fronte è verso +z).
// bersaglio [x,y,z], d = distanza, yaw = giro intorno al bersaglio in gradi (0 = da davanti, + = da destra), el = altezza dell'occhio in gradi, fov in gradi,
// vert = cambi per il formato verticale (telefono): stessa tappa, inquadratura più stretta
// lift = quanto sale la camera a metà del passaggio verso la tappa dopo (per scavalcare le persone)
// pos = posizione del cliente nel percorso (decide cosa fanno le persone), hold = secondi di sosta, dr = quanto gira durante la sosta (gradi)
// et: le etichette dell'inquadratura. id = chiave stabile, n = nome dell'attrezzo, at = punto del mondo a cui punta (la pagina lo segue sullo schermo), lato = da che parte esce la scritta
export const TAPPE = [
  { id: 'ingresso', stanza: 'Ingresso', t: 0.5, hold: 1.0, tgt: [2, 4.4, -3], d: 25, yaw: 6, el: 5, fov: 36, pos: 0.16, dr: -4, et: [] },
  { id: 'pt-rack', stanza: 'Personal Training', t: 3.0, hold: 1.2, tgt: [13.0, 5.2, -3.6], d: 20, yaw: 20, el: 6, fov: 34, pos: 0.9, dr: 8, et: [
    { id: 'rack', n: 'Power rack', at: [12.5, 9.4, -1.2], lato: 'd' },
    { id: 'bilanciere', n: 'Bilanciere e dischi', at: [12.5, 4.6, -5.3], lato: 's' },
  ] },
  { id: 'pt-manubri', stanza: 'Personal Training', t: 5.0, hold: 1.4, tgt: [23.0, 3.8, -5.0], d: 17, yaw: 0, el: 6, fov: 34, pos: 1.0, dr: -6, et: [
    { id: 'albero', n: 'Albero dei dischi', at: [18.2, 3.2, -2.6], lato: 's' },
    { id: 'rastrelliera', n: 'Rastrelliera manubri', at: [21.6, 2.7, -5.8], lato: 's' },
    { id: 'cavi', n: 'Torre a cavi', at: [25.6, 4.4, -5.4], lato: 'd' },
    { id: 'kettlebell-pt', n: 'Kettlebell', at: [27.8, 1.0, -5.6], lato: 'd' },
  ] },
  { id: 'pt-panca', stanza: 'Personal Training', t: 7.0, hold: 1.0, tgt: [30.4, 4.2, -2.0], d: 17, yaw: -42, el: 9, fov: 36, pos: 1.1, dr: 6, et: [
    { id: 'panca', n: 'Panca', at: [30.6, 1.6, -0.2], lato: 's' },
    { id: 'rack2', n: 'Rack per squat', at: [30.6, 9.4, -3.8], lato: 'd' },
    { id: 'elastici', n: 'Elastici', at: [32.2, 0.7, 2.2], lato: 'd' },
  ] },
  { id: 'pt-terra', stanza: 'Personal Training', t: 8.9, hold: 1.2, tgt: [26, 0.9, 2.0], d: 9.5, yaw: 5, el: 13, fov: 32, pos: 1.2, dr: -5, et: [
    { id: 'manubrio', n: 'Manubri esagonali', at: [23, 0.4, 1.3], lato: 's' },
    { id: 'dischi', n: 'Dischi', at: [25.4, 0.7, 2.2], lato: 's' },
    { id: 'palla-medica', n: 'Palla medica', at: [26.4, 1.1, 2.2], lato: 'd' },
    { id: 'cronometro', n: 'Cronometro', at: [29, 0.7, 2.2], lato: 'd' },
  ] },
  { id: 'pil-reformer', stanza: 'Pilates', t: 12.0, hold: 1.6, tgt: [45.8, 1.9, 0.4], d: 12, yaw: 20, el: 14, fov: 32, pos: 3.0, dr: -8, et: [
    { id: 'reformer', n: 'Reformer', at: [45, 2.5, 0.4], lato: 'd' },
    { id: 'blocchi', n: 'Blocchi in schiuma', at: [44.4, 0.7, 2.2], lato: 's' },
    { id: 'pallina', n: 'Pallina soft', at: [49.2, 0.7, 2.2], lato: 'd' },
  ] },
  { id: 'pil-cadillac', stanza: 'Pilates', t: 14.0, hold: 1.2, tgt: [36.2, 3.8, -4.4], d: 16, yaw: 20, el: 8, fov: 34, pos: 3.0, dr: -6, et: [
    { id: 'cadillac', n: 'Cadillac', at: [35.6, 8.2, -4.4], lato: 'd' },
  ] },
  { id: 'pil-sedia', stanza: 'Pilates', t: 16.0, hold: 1.2, tgt: [55.4, 1.7, -0.2], d: 11, yaw: -62, el: 16, fov: 32, pos: 3.05, dr: 6, vert: { tgt: [55.4, 2.0, -0.4], d: 10, yaw: -20, el: 18, alpha: 0.5 }, et: [
    { id: 'wunda', n: 'Wunda chair', at: [55.6, 3.1, 0.4], lato: 's' },
    { id: 'spine', n: 'Spine corrector', at: [55.8, 1.4, -1.6], lato: 'd' },
    { id: 'fitball', n: 'Fitball', at: [56.8, 1.8, 3.0], lato: 'd' },
    { id: 'rotolo', n: 'Rullo', at: [54.4, 0.6, 2.2], lato: 's' },
  ] },
  { id: 'pil-terra', stanza: 'Pilates', t: 18.0, hold: 1.2, tgt: [44, 0.9, 3.4], d: 13, yaw: 6, el: 11, fov: 34, pos: 3.1, dr: -6, vert: { tgt: [42, 1.1, 3.6], d: 10, yaw: 6, el: 17 }, et: [
    { id: 'magic-circle', n: 'Magic circle', at: [39.8, 1.4, 2.2], lato: 's' },
    { id: 'tappetino', n: 'Tappetini', at: [43, 0.2, 5.2], lato: 's' },
  ] },
  { id: 'fun-trx', stanza: 'Functional', t: 21.0, hold: 1.4, tgt: [70, 6.2, -5], d: 24, yaw: 0, el: 4, fov: 36, pos: 4.9, dr: 4, et: [
    { id: 'rig', n: 'Rig a traversa', at: [70, 11, -5], lato: 'd' },
    { id: 'trx', n: 'TRX', at: [64, 8, -4.9], lato: 's' },
  ] },
  { id: 'fun-box', stanza: 'Functional', t: 23.0, hold: 1.2, lift: 6.5, tgt: [79.6, 1.7, -2.6], d: 12, yaw: -20, el: 9, fov: 32, pos: 5.0, dr: 6, vert: { tgt: [80.0, 2.2, -3.0], d: 14, yaw: -8, el: 6 }, et: [
    { id: 'plyo', n: 'Box pliometrici', at: [80.5, 2.4, -3.2], lato: 'd' },
    { id: 'coni', n: 'Coni', at: [79.4, 0.7, 3.7], lato: 's' },
  ] },
  { id: 'fun-corde', stanza: 'Functional', t: 25.0, hold: 1.2, tgt: [65.9, 1.9, -4.4], d: 6.6, yaw: 24, el: 8, fov: 32, pos: 5.1, dr: -10, et: [
    { id: 'corde', n: 'Corde da battaglia', at: [65.9, 1.6, -4.6], lato: 'd' },
  ] },
  { id: 'fun-terra', stanza: 'Functional', t: 27.0, hold: 1.2, tgt: [64.5, 0.9, 3.2], d: 9, yaw: 14, el: 11, fov: 30, pos: 5.2, dr: -5, et: [
    { id: 'sandbag', n: 'Sacchi di sabbia', at: [61.6, 1.0, 3.5], lato: 's' },
    { id: 'slam', n: 'Slam ball', at: [66.6, 0.9, 2.2], lato: 'd' },
  ] },
];

// etichette da disegnare al tempo t (secondi): quelle della tappa, con un margine prima e dopo per le dissolvenze
export function etichetteAttive(t, margine = 0.6, tappe = TAPPE) {
  const out = [];
  for (const s of tappe) if (t >= s.t - s.hold / 2 - margine && t <= s.t + s.hold / 2 + margine) for (const e of s.et || []) out.push({ ...e, tappa: s.id });
  return out;
}

const lerp = (a, b, t) => a + (b - a) * t;
const toRad = (a) => a * D2R;
export function pose(s, u = 0) { // u ∈ [-0.5, 0.5]: avanzamento nella sosta
  const yaw = toRad(s.yaw + (s.dr || 0) * u), el = toRad(s.el), d = s.d;
  const eye = [s.tgt[0] + Math.sin(yaw) * Math.cos(el) * d, s.tgt[1] + Math.sin(el) * d, s.tgt[2] + Math.cos(yaw) * Math.cos(el) * d];
  return { eye, tgt: s.tgt.slice(), fov: s.fov, pos: s.pos };
}
// chiavi: due per tappa (inizio e fine sosta)
function keys(tappe) {
  const K = [];
  tappe.forEach((s, i) => {
    const h = s.hold / 2;
    K.push({ t: s.t - h, p: pose(s, -0.5), stop: true }, { t: s.t + h, p: pose(s, 0.5), stop: true, lift: s.lift || 0 });
    void i;
  });
  return K;
}
const hermite = (p0, p1, m0, m1, u) => { const u2 = u * u, u3 = u2 * u; return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1; };
export function cameraAt(t, tappe = TAPPE) {
  const K = keys(tappe), n = K.length;
  if (t <= K[0].t) return flat(K[0].p);
  if (t >= K[n - 1].t) return flat(K[n - 1].p);
  let i = 0; while (i < n - 2 && t > K[i + 1].t) i++;
  const a = K[i], b = K[i + 1], h = b.t - a.t, u = (t - a.t) / h;
  const fa = flat(a.p), fb = flat(b.p), out = {};
  for (const k of Object.keys(fa)) {
    // le tappe sono ferme: tangente nulla agli estremi (partenza e arrivo dolci), quindi è un ease-in-out per ogni tratto
    out[k] = hermite(fa[k], fb[k], 0, 0, u);
  }
  // gru: nel passaggio alla tappa successiva l'occhio sale sopra le teste (lift, in unità del mondo) e poi riscende, per non attraversare le persone
  const gru = (a.lift || 0) * Math.sin(Math.PI * u);
  return { eye: [out.ex, out.ey + gru, out.ez], tgt: [out.tx, out.ty, out.tz], fov: out.fov, pos: out.pos };
}
function flat(p) { return { ex: p.eye[0], ey: p.eye[1], ez: p.eye[2], tx: p.tgt[0], ty: p.tgt[1], tz: p.tgt[2], fov: p.fov, pos: p.pos, eye: p.eye, tgt: p.tgt }; }
export const durata = (tappe = TAPPE) => { const l = tappe[tappe.length - 1]; return l.t + l.hold / 2; };

// le tappe per il formato verticale: stesse tappe con gli eventuali cambi di «vert»
export const tappePer = (verticale) => (verticale ? TAPPE.map((s) => ({ ...s, ...(s.vert || {}) })) : TAPPE);
