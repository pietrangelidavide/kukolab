// Anteprima senza server, con font e immagini incorporati. L'app è sempre in modalità demo (dati nel browser).
// Crea in .tmp/preview/:
//   personal-training.html, functional.html, pilates.html, app.html, gestionale.html   pagine separate (collegamenti: KUKO_APP_URL per "Apri l'app", KUKO_STAFF_URL per il gestionale (non è collegato dal sito: si apre dal suo indirizzo), KUKO_SITE_URL per "Torna al sito")
//   multi/personal-training.html, multi/functional.html, multi/pilates.html, multi/app.html, multi/gestionale.html, multi/privacy.html   le stesse pagine da pubblicare insieme sotto un unico indirizzo
//   La pagina principale (public/index.html) usa più file (home.css, home.js): non è qui, si prova con «npm run dev» o sul sito pubblicato.
// Uso: npm run preview:build
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENTRIES, appOptions, root } from './lib/app.mjs';

const out = join(root, '.tmp', 'preview');
mkdirSync(out, { recursive: true });
const pub = (...p) => join(root, 'public', ...p);
const MIME = { png: 'image/png', jpg: 'image/jpeg', woff: 'font/woff' };
const dataUri = (rel) => `data:${MIME[rel.split('.').pop()]};base64,${readFileSync(pub(rel)).toString('base64')}`;
const safeScript = (js) => js.replace(/<\/script/gi, '<\\/script');
// stessa base che il browser mette attorno a una pagina pubblicata (per provarla in locale)
const frame = (title, body) => `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${body}</body></html>`;

// ------------------------------------------------------------------ app (demo)
const fontPlugin = {
  name: 'font-assoluti',
  setup(b) {
    b.onResolve({ filter: /^\/(fonts|img)\// }, (a) => ({ path: pub(a.path.slice(1)) }));
  },
};
const res = await build(appOptions({
  format: 'iife', splitting: false, minify: true, write: false, outdir: join(out, 'app'),
  loader: { '.woff': 'dataurl', '.png': 'dataurl' },
  plugins: [fontPlugin],
  define: { __KUKO_SUPABASE_URL__: '""', __KUKO_SUPABASE_KEY__: '""', 'process.env.NODE_ENV': '"production"' },
}));
const js = res.outputFiles.find((f) => f.path.endsWith('.js')).text;
const css = res.outputFiles.find((f) => f.path.endsWith('.css')).text;
const logo = dataUri('img/logo-cerchio.png');
// links: dove portano le uscite ("Torna al sito", "Apri l'app", "Apri il gestionale", "Torna all'ingresso"); stringa vuota = il link non compare
const appPage = (mode, links) => `<title>${ENTRIES[mode].name}</title>
<style>${css}</style>
<div id="root"></div>
<script>window.KUKO_ASSETS=${JSON.stringify({ logo, mode, ...links })};</script>
<script>${safeScript(js)}</script>
`;
const soloLinks = { site: process.env.KUKO_SITE_URL ?? '', app: process.env.KUKO_APP_URL ?? '', staff: process.env.KUKO_STAFF_URL ?? '', home: '' };
const multi = join(out, 'multi');
mkdirSync(multi, { recursive: true });
const multiLinks = { site: '', app: 'app.html', staff: 'gestionale.html', home: '' }; // la home non è nell'anteprima
for (const [mode, file] of [['client', 'app'], ['staff', 'gestionale']]) {
  const fragment = appPage(mode, soloLinks);
  writeFileSync(join(out, `${file}.html`), fragment);
  writeFileSync(join(out, `${file}-page.html`), frame(ENTRIES[mode].name, fragment));
  writeFileSync(join(multi, `${file}.html`), frame(ENTRIES[mode].name, appPage(mode, multiLinks)));
}

// ------------------------------------------------------------------ vetrina e pagina di ingresso
const appUrl = process.env.KUKO_APP_URL || '#';
const siteUrl = process.env.KUKO_SITE_URL || '#';
const withData = (css) => css
  .replace(/url\((['"]?)(fonts\/[^'")]+)\1\)/g, (_m, _q, p) => `url('${dataUri(p)}')`)
  .replace(/url\((['"]?)(img\/[^'")]+)\1\)/g, (_m, _q, p) => `url('${dataUri(p)}')`);
const inline = (b) => b
  .replace(/(src|href)="(img\/[^"]+)"/g, (_m, a, p) => `${a}="${dataUri(p)}"`)
  .replace(/url\((['"]?)(img\/[^'")]+)\1\)/g, (_m, _q, p) => `url('${dataUri(p)}')`);
const bodyOf = (html) => html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
const titleOf = (html) => html.match(/<title>([^<]+)<\/title>/)[1];
// collegamenti tra le pagine: [espressione, indirizzo]. Le pagine "sorelle" si chiamano per nome file; da sole, le uscite vanno a KUKO_APP_URL / KUKO_SITE_URL (o restano "#")
const relink = (b, map) => map.reduce((acc, [re, to]) => acc.replace(re, to), b);
const ext = (url) => `href="${url}"${url === '#' ? '' : ' target="_blank" rel="noopener"'}`;

// pagine dei corsi (personal-training, functional, pilates): solo HTML e CSS
const siteStyle = withData(readFileSync(pub('sito.css'), 'utf8'));
const SITE_PAGES = ['personal-training', 'functional', 'pilates'];
for (const name of SITE_PAGES) {
  const html = readFileSync(pub(`${name}.html`), 'utf8');
  const title = titleOf(html);
  const raw = inline(bodyOf(html));
  // da sola: le uscite vanno a KUKO_APP_URL / KUKO_SITE_URL (o restano "#"); le altre pagine non ci sono, quindi anche quei link restano "#"
  const solo = relink(raw, [[/href="\/app\/"/g, ext(appUrl)], [/href="\/(?:personal-training|functional|pilates)(#[^"]*)?"/g, (_m, h) => `href="${h || '#'}"`], [/href="\/(#[^"]*)?"/g, (_m, h) => `href="${siteUrl === '#' ? (h || '#') : siteUrl + (h || '')}"`]]);
  const fragment = `<title>${title}</title>\n<style>${siteStyle}</style>\n${solo}`;
  writeFileSync(join(out, `${name}.html`), fragment);
  writeFileSync(join(out, `${name}-page.html`), frame(title, fragment));
  // insieme alle altre: le pagine si chiamano per nome file; la home non c'è
  const together = relink(raw, [[/href="\/app\/"/g, 'href="app.html"'], [/href="\/(personal-training|functional|pilates)(#[^"]*)?"/g, (_m, n, h) => `href="${n}.html${h || ''}"`], [/href="\/(#[^"]*)?"/g, (_m, h) => `href="${h || '#'}"`]]);
  writeFileSync(join(multi, `${name}.html`), frame(title, `<title>${title}</title>\n<style>${siteStyle}</style>\n${together}`));
}

// pagina privacy: documento completo, con gli stessi font e stili
const priv = readFileSync(pub('privacy.html'), 'utf8');
const privBody = priv.slice(priv.indexOf('<body'), priv.indexOf('</body>')).replace(/href="\/"/g, 'href="#"');
const privHead = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${priv.match(/<title>([^<]+)<\/title>/)[1]}</title><meta name="robots" content="noindex, nofollow"><style>${siteStyle}</style></head>`;
writeFileSync(join(multi, 'privacy.html'), `${privHead}${privBody.replace(/(src|href)="(img\/[^"]+)"/g, (_m, a, p) => `${a}="${dataUri(p)}"`).replace(/<body[^>]*>/, '<body class="legal-page">')}</body></html>`);

const kb = (f) => `${Math.round(readFileSync(join(out, f)).length / 1024)} KB`;
console.log(`Anteprime in .tmp/preview: ${SITE_PAGES.map((n) => `${n}.html (${kb(n + '.html')})`).join(', ')}, app.html (${kb('app.html')}), gestionale.html (${kb('gestionale.html')}); *-page.html = con la cornice del visualizzatore; multi/ = le stesse pagine da pubblicare insieme.`);
