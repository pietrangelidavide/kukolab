// Anteprima senza server, con font e immagini incorporati. L'app è sempre in modalità demo (dati nel browser).
// Crea in .tmp/preview/:
//   ingresso.html, sito.html, app.html   tre pagine separate (collegamenti: KUKO_APP_URL per i pulsanti "Prenota"/"Apri l'app", KUKO_SITE_URL per "Il sito" e "Torna al sito")
//   multi/index.html (ingresso), multi/sito.html, multi/app.html, multi/privacy.html   le stesse pagine da pubblicare insieme sotto un unico indirizzo: così stanno
//                              nella stessa origine e la richiesta di prova gratuita lasciata sul sito compare nell'area owner dell'app (la coda è nel browser, vedi public/site.js)
// Uso: npm run preview:build
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appOptions, root } from './lib/app.mjs';

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
const appPage = (site) => `<title>KUKO LAB Prenotazioni</title>
<style>${css}</style>
<div id="root"></div>
<script>window.KUKO_ASSETS=${JSON.stringify({ logo, site })};</script>
<script>${safeScript(js)}</script>
`;
const appFragment = appPage(process.env.KUKO_SITE_URL ?? '');
writeFileSync(join(out, 'app.html'), appFragment);
writeFileSync(join(out, 'app-page.html'), frame('KUKO LAB Prenotazioni', appFragment));
const multi = join(out, 'multi');
mkdirSync(multi, { recursive: true });
writeFileSync(join(multi, 'app.html'), frame('KUKO LAB Prenotazioni', appPage('sito.html')));

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

// vetrina (sito.html). site.js va dentro la pagina; site-config.js no: l'anteprima è sempre in modalità demo (le richieste restano nel browser)
const siteStyle = withData(readFileSync(pub('style.css'), 'utf8'));
const siteHtml = readFileSync(pub('sito.html'), 'utf8');
const siteTitle = titleOf(siteHtml);
const siteJs = readFileSync(pub('site.js'), 'utf8');
const siteRaw = bodyOf(siteHtml)
  .replace('<script src="site-config.js"></script>', '')
  .replace('<script src="site.js"></script>', () => `<script>${safeScript(siteJs)}</script>`);
const siteSolo = relink(inline(siteRaw), [[/href="\/app\/"/g, ext(appUrl)], [/href="\/"/g, 'href="#"']]);
const siteFragment = `<title>${siteTitle}</title>\n<style>${siteStyle}</style>\n${siteSolo}`;
writeFileSync(join(out, 'sito.html'), siteFragment);
writeFileSync(join(out, 'sito-page.html'), frame(siteTitle, siteFragment));
const siteMulti = relink(inline(siteRaw), [[/href="\/app\/"/g, 'href="app.html"'], [/href="\/"/g, 'href="index.html"']]);
writeFileSync(join(multi, 'sito.html'), frame(siteTitle, `<title>${siteTitle}</title>\n<style>${siteStyle}</style>\n${siteMulti}`));

// pagina di ingresso (index.html): in "multi" è la pagina principale, senza cornice (la mette chi pubblica)
const landStyle = withData(readFileSync(pub('landing.css'), 'utf8'));
const landHtml = readFileSync(pub('index.html'), 'utf8');
const landTitle = titleOf(landHtml);
const landRaw = inline(bodyOf(landHtml));
const landSolo = relink(landRaw, [[/href="\/app\/"/g, ext(appUrl)], [/href="\/sito"/g, ext(siteUrl)], [/href="\/"/g, 'href="#"']]);
const landFragment = `<title>${landTitle}</title>\n<style>${landStyle}</style>\n${landSolo}`;
writeFileSync(join(out, 'ingresso.html'), landFragment);
writeFileSync(join(out, 'ingresso-page.html'), frame(landTitle, landFragment));
const landMulti = relink(landRaw, [[/href="\/app\/"/g, 'href="app.html"'], [/href="\/sito"/g, 'href="sito.html"'], [/href="\/"/g, 'href="index.html"'], [/href="installa\.html"/g, 'href="app.html"']]);
writeFileSync(join(multi, 'index.html'), `<title>${landTitle}</title>\n<style>${landStyle}</style>\n${landMulti}`);

// pagina privacy: documento completo, con gli stessi font e stili
const priv = readFileSync(pub('privacy.html'), 'utf8');
const privBody = priv.slice(priv.indexOf('<body'), priv.indexOf('</body>')).replace(/href="\/sito"/g, 'href="sito.html"');
const privHead = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${priv.match(/<title>([^<]+)<\/title>/)[1]}</title><meta name="robots" content="noindex, nofollow"><style>${siteStyle}</style></head>`;
writeFileSync(join(multi, 'privacy.html'), `${privHead}${privBody.replace(/(src|href)="(img\/[^"]+)"/g, (_m, a, p) => `${a}="${dataUri(p)}"`).replace(/<body[^>]*>/, '<body class="legal-page">')}</body></html>`);

const kb = (f) => `${Math.round(readFileSync(join(out, f)).length / 1024)} KB`;
console.log(`Anteprime in .tmp/preview: ingresso.html (${kb('ingresso.html')}), sito.html (${kb('sito.html')}), app.html (${kb('app.html')}); *-page.html = con la cornice del visualizzatore; multi/ = index (ingresso), sito, app e privacy da pubblicare insieme (${kb('multi/index.html')} + ${kb('multi/sito.html')} + ${kb('multi/app.html')} + ${kb('multi/privacy.html')})`);
