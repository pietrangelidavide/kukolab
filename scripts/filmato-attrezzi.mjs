// Filmato «tutti gli attrezzi»: la telecamera attraversa le tre sale del percorso 3D e si ferma su ogni attrezzo.
// I fotogrammi li disegna lo stesso motore 3D della pagina (public/percorso/js), uno alla volta, con una telecamera libera e il tempo deciso da qui,
// quindi il risultato è identico a quello che si vede in pagina ma senza dipendere dalla scheda grafica di chi guarda.
// La regia (tappe, tempi, etichette) sta in scripts/lib/regia-attrezzi.mjs.
//
// Serve Playwright (con Chromium) e ffmpeg. Uso:
//   node scripts/filmato-attrezzi.mjs disegna  [--formato orizzontale|verticale] [--da 0] [--a 9999] [--passo 1] [--cartella .tmp/filmato]
//   node scripts/filmato-attrezzi.mjs etichette [--formato ...]   (dove cade ogni etichetta su ogni fotogramma: veloce, non disegna immagini)
//   node scripts/filmato-attrezzi.mjs codifica [--formato orizzontale|verticale] [--cartella .tmp/filmato] [--solo-dati]   (mp4 + immagine di copertina + dati delle etichette)
//   node scripts/filmato-attrezzi.mjs anteprima [--formato ...]   (un fotogramma per tappa, piccolo, per controllare le inquadrature)
// Per disegnare su più processi: lancia più volte «disegna» con intervalli diversi (--da / --a); i fotogrammi già fatti vengono saltati.
// Ordine: anteprima (controllo) → disegna → etichette → codifica.
// Senza scheda grafica (server, CI) il motore gira sul processore: circa 6 s a fotogramma a 1280×720. Con una scheda grafica vera aggiungi --gpu.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FPS, cameraAt, durata, etichetteAttive, tappePer } from './lib/regia-attrezzi.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const cmd = process.argv[2] || 'disegna';
const verticale = arg('formato', 'orizzontale') === 'verticale';
const W = +arg('larghezza', verticale ? 540 : 1280), H = +arg('altezza', verticale ? 960 : 720);
const cartella = path.resolve(root, arg('cartella', '.tmp/filmato'), verticale ? 'verticale' : 'orizzontale');
const nFrame = Math.ceil(durata() * FPS) + 1;
const da = +arg('da', 0), a = Math.min(+arg('a', nFrame - 1), nFrame - 1), passo = Math.max(1, +arg('passo', 1));
const TAPPE = tappePer(verticale);
const nome = verticale ? 'attrezzi-verticale' : 'attrezzi';

// campo visivo: le inquadrature sono pensate in orizzontale (16:9). In verticale la camera tiene più o meno la stessa larghezza di scena,
// quindi il campo verticale cresce (limitato, per non deformare troppo ai bordi)
function fovPer(s, asp) {
  const aspO = 16 / 9; if (asp >= 1.2) return s.fov;
  const alpha = s.alpha ?? 0.56, tanO = Math.tan(s.fov * Math.PI / 360);
  return Math.min(64, Math.max(s.fov, 2 * Math.atan(tanO * aspO / asp * alpha) * 180 / Math.PI));
}

async function disegna(modo) {
  const anteprima = modo === 'anteprima', soloEtichette = modo === 'etichette';
  const require = createRequire(process.env.KUKO_PLAYWRIGHT_DA || import.meta.url);
  let chromium; try { ({ chromium } = require('playwright')); } catch { throw new Error('Serve Playwright: installalo (npm i -D playwright) o indica un progetto che lo ha con KUKO_PLAYWRIGHT_DA=/percorso/del/progetto/file.mjs'); }
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
  const pub = path.join(root, 'public');
  const srv = http.createServer((q, r) => {
    let u = decodeURIComponent(q.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
    const f = path.join(pub, u);
    if (!f.startsWith(pub) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('404'); }
    r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const args = arg('gpu', false) ? [] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const br = await chromium.launch({ args });
  // per le sole etichette basta un'immagine minuscola della stessa proporzione: le posizioni sono frazioni dello schermo
  const vw = soloEtichette ? Math.round(W / 20) : W, vh = soloEtichette ? Math.round(H / 20) : H;
  const ctx = await br.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
  const pg = await ctx.newPage();
  const errori = []; pg.on('pageerror', (e) => errori.push(String(e)));
  await pg.goto(base + '/index.html?live', { waitUntil: 'load' });
  await pg.waitForFunction(() => window.__story && window.__story.shoot, null, { timeout: 120000 });
  await pg.waitForTimeout(400);
  fs.mkdirSync(cartella, { recursive: true });
  const asp = vw / vh;
  const elenco = anteprima ? TAPPE.map((s) => ({ f: Math.round(s.t * FPS), nome: s.id })) : Array.from({ length: Math.floor((a - da) / passo) + 1 }, (_, i) => ({ f: da + i * passo }));
  const pins = {};
  const t0 = Date.now(); let fatti = 0;
  for (const { f, nome: nm } of elenco) {
    const t = f / FPS;
    const file = path.join(cartella, anteprima ? `anteprima-${nm}.jpg` : `f${String(f).padStart(5, '0')}.jpg`);
    if (!anteprima && !soloEtichette && fs.existsSync(file)) { fatti++; continue; } // già fatto
    const sosta = TAPPE.find((s) => t >= s.t - s.hold / 2 - 1e-6 && t <= s.t + s.hold / 2 + 1e-6) || TAPPE.reduce((p, s) => (Math.abs(s.t - t) < Math.abs(p.t - t) ? s : p));
    const c = cameraAt(t, TAPPE);
    const fov = fovPer(sosta, asp);
    const et = etichetteAttive(t, 0.6, TAPPE);
    const r = await pg.evaluate(({ c, fov, t, et, senzaImmagine }) => {
      window.__story.shoot({ pos: c.pos, t: 3 + t, cam: [...c.eye, ...c.tgt, fov], tour: { x: c.tgt[0], z: 0 } });
      const pn = et.map((e) => window.__story.project(...e.at));
      return { img: senzaImmagine ? null : document.getElementById('gl').toDataURL('image/jpeg', 0.93), pn };
    }, { c, fov, t, et: et.map((e) => ({ at: e.at })), senzaImmagine: soloEtichette });
    if (anteprima || soloEtichette) pins[anteprima ? nm : f] = et.map((e, i) => [e.id, ...r.pn[i].map((v) => +v.toFixed(4))]);
    if (!soloEtichette) fs.writeFileSync(file, Buffer.from(r.img.split(',')[1], 'base64'));
    fatti++;
    if (fatti % 10 === 0 || anteprima) console.log(`${nm || f}  ${fatti}/${elenco.length}  ${((Date.now() - t0) / 1000 / fatti).toFixed(1)} s a fotogramma`);
  }
  if (anteprima || soloEtichette) fs.writeFileSync(path.join(cartella, anteprima ? 'anteprima.json' : 'etichette.json'), JSON.stringify(pins));
  if (errori.length) console.warn('Errori nella pagina:', errori.slice(0, 3));
  await br.close(); srv.close();
}

function codifica() {
  const files = fs.readdirSync(cartella).filter((x) => /^f\d{5}\.jpg$/.test(x));
  if (files.length < nFrame) console.warn(`Attenzione: ci sono ${files.length} fotogrammi su ${nFrame}.`);
  const out = path.join(root, 'public', 'percorso', 'video'); fs.mkdirSync(out, { recursive: true });
  const crf = String(arg('crf', 28));
  // un fotogramma chiave ogni 6 e niente B-frame: scorrendo la pagina il video salta avanti e indietro e deve ricostruire l'immagine in fretta
  const soloDati = !!arg('solo-dati', false); // rifà solo il file delle etichette (il filmato resta quello che c'è)
  const r = soloDati ? { status: 0 } : spawnSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(cartella, 'f%05d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-g', '6', '-keyint_min', '6', '-sc_threshold', '0', '-bf', '0',
    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', '-an', path.join(out, nome + '.mp4')], { stdio: 'inherit' });
  if (r.status) throw new Error('ffmpeg non è riuscito a codificare');
  if (!soloDati) fs.copyFileSync(path.join(cartella, 'f00000.jpg'), path.join(out, nome + '-copertina.jpg'));
  // etichette: unisco i pezzi. Per ogni fotogramma: [indice dell'etichetta, x, y] in frazioni dell'immagine (0-1); le etichette e le tappe stanno in testa al file
  const fp = path.join(cartella, 'etichette.json'); if (!fs.existsSync(fp)) throw new Error('Manca etichette.json: lancia prima «etichette»');
  const pins = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const etichette = []; TAPPE.forEach((s) => (s.et || []).forEach((e) => etichette.push({ id: e.id, n: e.n, lato: e.lato, tappa: s.id })));
  const indice = Object.fromEntries(etichette.map((e, i) => [e.id, i]));
  const compatti = {}; Object.keys(pins).forEach((f) => { compatti[f] = pins[f].filter((p) => p[3] > 0).map((p) => [indice[p[0]], +p[1].toFixed(3), +p[2].toFixed(3)]); });
  const tappe = TAPPE.map((s) => ({ id: s.id, stanza: s.stanza, t: s.t, hold: s.hold }));
  fs.writeFileSync(path.join(out, nome + '-etichette.json'), JSON.stringify({ fps: FPS, frames: nFrame, w: W, h: H, tappe, etichette, pins: compatti }));
  console.log('Scritti in', out);
}

if (cmd === 'disegna') await disegna('disegna');
else if (cmd === 'anteprima') await disegna('anteprima');
else if (cmd === 'etichette') await disegna('etichette');
else if (cmd === 'codifica') codifica();
else console.log('Comandi: anteprima | disegna | etichette | codifica');
