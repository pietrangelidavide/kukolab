// Genera le pagine dei corsi (personal-training, functional, pilates) in public/ a partire da vetrina/. La pagina principale (public/index.html, il percorso 3D) è scritta a mano.
//   vetrina/site.json      dati comuni (WhatsApp, telefono, Instagram, indirizzo, Maps)
//   vetrina/partials.json  pezzi riusati ({{contatti}}, {{play}})
//   vetrina/layout.html    testata con menu, piede, meta tag (uguali per tutte le pagine)
//   vetrina/pages/*.html   una pagina ciascuna: un commento iniziale con un blocco JSON (file, nav, title, description, preload) + il contenuto
// Macro: {{strip:Etichetta|foto1,foto2,...}} (striscia di foto di public/img, senza .jpg, che scorre in orizzontale; testi alternativi in photos.json) {{wa}} {{wa:Testo del messaggio}} {{ig}} {{igname}} {{tel}} {{telShow}} {{address}} {{maps}} {{play}} {{contatti}}
// Si ferma (con errore) se una macro non esiste, se manca un'immagine, se un'àncora non porta da nessuna parte o se una pagina non ha un solo <h1>.
// Uso: npm run site   (lo lancia anche build-site.mjs)
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const src = (...p) => join(root, 'vetrina', ...p);
const pub = (...p) => join(root, 'public', ...p);
const json = (f) => JSON.parse(readFileSync(src(f), 'utf8'));

const site = json('site.json');
const partials = json('partials.json');
const photos = json('photos.json');
const layout = readFileSync(src('layout.html'), 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const igUrl = `https://www.instagram.com/${site.instagram}/`;
const wa = (text) => `https://wa.me/${site.wa}?text=${encodeURIComponent(text)}`;
const vars = {
  wa: esc(wa(site.waText)),
  ig: igUrl,
  igname: site.instagram,
  tel: site.tel,
  telShow: site.telShow,
  address: site.address,
  maps: esc(site.maps),
  play: partials.play,
  contatti: partials.contatti,
};

// voci del menu: key = pagina corrente (aria-current)
const NAV = [
  { key: 'personal-training', label: 'Personal training', href: '/personal-training' },
  { key: 'functional', label: 'Functional', href: '/functional' },
  { key: 'pilates', label: 'Pilates', href: '/pilates' },
  { key: 'contatti', label: 'Contatti', href: '#contatti' },
];
// «Il percorso» (la pagina principale, public/index.html) è solo nel menu da telefono: sul computer c'è il logo
const MENU = [{ key: 'home', label: 'Il percorso', href: '/' }, ...NAV];

// misure di un JPEG (legge il marcatore SOF)
const jpegSize = (file) => {
  const b = readFileSync(file);
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error(`${file}: misure non trovate`);
};
// striscia di foto che scorre piano in orizzontale: la sequenza è scritta due volte (la seconda copia è nascosta ai lettori di schermo) così il giro non ha stacchi
const strip = (label, list) => {
  const files = list.split(',').map((f) => f.trim()).filter(Boolean).map((f) => (f.endsWith('.jpg') ? f : `${f}.jpg`));
  const item = (f, copy) => {
    const alt = photos[f];
    if (alt === undefined) throw new Error(`photos.json: manca la foto ${f}`);
    if (!existsSync(pub('img', f))) throw new Error(`striscia: immagine mancante img/${f}`);
    const [w, h] = jpegSize(pub('img', f));
    return `<li${copy ? ' aria-hidden="true"' : ''}><img src="img/${f}" width="${w}" height="${h}" loading="lazy" alt="${copy ? '' : esc(alt)}"></li>`;
  };
  return `<div class="strip" role="group" aria-label="${esc(label)}">\n    <ul class="strip-track">\n      ${[...files.map((f) => item(f, false)), ...files.map((f) => item(f, true))].join('\n      ')}\n    </ul>\n  </div>`;
};

const expand = (html) => {
  let out = html;
  for (let i = 0; i < 6; i++) {
    const next = out
      .replace(/\{\{strip:([^|}]+)\|([^}]+)\}\}/g, (_m, label, list) => strip(label.trim(), list))
      .replace(/\{\{wa:([^}]+)\}\}/g, (_m, t) => esc(wa(t.trim())))
      .replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
    if (next === out) break;
    out = next;
  }
  return out;
};

const files = readdirSync(src('pages')).filter((f) => f.endsWith('.html')).sort();
const built = [];
for (const f of files) {
  const raw = readFileSync(src('pages', f), 'utf8');
  const m = raw.match(/^<!--\s*(\{[\s\S]*?\})\s*-->\s*/);
  if (!m) throw new Error(`${f}: manca il blocco JSON iniziale`);
  const meta = JSON.parse(m[1]);
  const body = raw.slice(m[0].length).replace(/\s+$/, '');
  const links = (items, cls) => items.map((i) => `      <a href="${i.href}"${i.key === meta.nav ? ' aria-current="page"' : ''}${cls ? ` class="${cls}"` : ''}>${i.label}</a>`).join('\n');
  const preload = (meta.preload || []).map((p) => `<link rel="preload" href="${p.href}" as="image"${p.media ? ` media="${p.media}"` : ''}>`).join('\n');
  const page = expand(
    layout
      .replace('{{content}}', () => body)
      .replace('{{nav}}', () => links(NAV))
      .replace('{{menu}}', () => links(MENU, 'menu-link'))
      .replace('{{preload}}', () => preload)
      .replace(/\{\{title\}\}/g, () => esc(meta.title))
      .replace(/\{\{description\}\}/g, () => esc(meta.description)),
  ).replace(/\n{3,}/g, '\n\n');
  const left = page.match(/\{\{[^}]*\}\}/g);
  if (left) throw new Error(`${f}: macro sconosciute ${[...new Set(left)].join(', ')}`);
  built.push({ file: meta.file, page, name: f });
}

// controlli
const idsOf = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]));
const byFile = Object.fromEntries(built.map((b) => [b.file, b]));
const home = readFileSync(pub('index.html'), 'utf8');
const problems = [];
for (const b of built) {
  const h1 = (b.page.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) problems.push(`${b.name}: ${h1} <h1> (deve essere uno)`);
  const title = b.page.match(/<title>([^<]*)<\/title>/)[1];
  if (title.length > 65) problems.push(`${b.name}: title lungo (${title.length})`);
  for (const [tag] of b.page.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt="/.test(tag)) problems.push(`${b.name}: immagine senza alt: ${tag.slice(0, 80)}`);
    const s = tag.match(/\ssrc="([^"]+)"/)[1];
    if (!existsSync(pub(s))) problems.push(`${b.name}: immagine mancante ${s}`);
  }
  const ids = idsOf(b.page);
  for (const [, href] of b.page.matchAll(/\shref="([^"]+)"/g)) {
    const h = href.replace(/&amp;/g, '&');
    if (h.startsWith('#')) {
      if (h.length > 1 && !ids.has(h.slice(1))) problems.push(`${b.name}: àncora ${h} senza destinazione`);
    } else if (h === '/' || /^\/#/.test(h)) {
      // la pagina principale (il percorso 3D) è scritta a mano in public/index.html
      const hash = h.slice(2);
      if (hash && !idsOf(home).has(hash)) problems.push(`${b.name}: ${h} senza destinazione`);
    } else if (/^\/(personal-training|functional|pilates)(#.*)?$/.test(h)) {
      const [path, hash] = h.split('#');
      const target = byFile[path.slice(1)];
      if (!target) problems.push(`${b.name}: pagina ${path} inesistente`);
      else if (hash && !idsOf(target.page).has(hash)) problems.push(`${b.name}: ${h} senza destinazione`);
    }
  }
}
if (problems.length) throw new Error(`vetrina:\n  ${problems.join('\n  ')}`);

for (const b of built) writeFileSync(pub(`${b.file}.html`), b.page + '\n');
console.log(`vetrina: ${built.map((b) => b.file + '.html').join(', ')}`);
