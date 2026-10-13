// Anteprima a file unico (senza server): crea in .tmp/preview/ sito.html e app.html con font e immagini incorporati.
// L'app è sempre in modalità demo (dati nel browser). Per far puntare i pulsanti "Prenota" della vetrina all'app: KUKO_APP_URL=https://...
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
const appFragment = `<title>KUKO LAB Prenotazioni</title>
<style>${css}</style>
<div id="root"></div>
<script>window.KUKO_ASSETS=${JSON.stringify({ logo: dataUri('img/logo-cerchio.png') })};</script>
<script>${safeScript(js)}</script>
`;
writeFileSync(join(out, 'app.html'), appFragment);
writeFileSync(join(out, 'app-page.html'), frame('KUKO LAB Prenotazioni', appFragment));

// ------------------------------------------------------------------ vetrina
const appUrl = process.env.KUKO_APP_URL || '#';
let style = readFileSync(pub('style.css'), 'utf8').replace(/url\((['"]?)(fonts\/[^'")]+)\1\)/g, (_m, _q, p) => `url('${dataUri(p)}')`);
const html = readFileSync(pub('index.html'), 'utf8');
const title = html.match(/<title>([^<]+)<\/title>/)[1];
let body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
body = body
  .replace(/(src|href)="(img\/[^"]+)"/g, (_m, a, p) => `${a}="${dataUri(p)}"`)
  .replace(/url\((['"]?)(img\/[^'")]+)\1\)/g, (_m, _q, p) => `url('${dataUri(p)}')`)
  .replace(/href="\/app\/"/g, `href="${appUrl}"${appUrl === '#' ? '' : ' target="_blank" rel="noopener"'}`);
style = style.replace(/url\((['"]?)(img\/[^'")]+)\1\)/g, (_m, _q, p) => `url('${dataUri(p)}')`);
const siteFragment = `<title>${title}</title>\n<style>${style}</style>\n${body}`;
writeFileSync(join(out, 'sito.html'), siteFragment);
writeFileSync(join(out, 'sito-page.html'), frame(title, siteFragment));

const kb = (f) => `${Math.round(readFileSync(join(out, f)).length / 1024)} KB`;
console.log(`Anteprime in .tmp/preview: sito.html (${kb('sito.html')}), app.html (${kb('app.html')}); *-page.html = con la cornice del visualizzatore`);
