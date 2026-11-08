// Sviluppo: ricompila la web app a ogni modifica e serve tutto il sito su http://localhost:8800 (home, il percorso 3D, su /; pagine dei corsi su /personal-training, /functional, /pilates; app dei clienti su /app/, gestionale su /gestionale/).
// Uso: npm run dev   (PORT per cambiare porta; con KUKO_SUPABASE_URL e KUKO_SUPABASE_ANON_KEY usa Supabase)
import { context } from 'esbuild';
import { createServer } from 'node:http';
import * as fs from 'node:fs';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { appOptions, root, siteConfig, writeEntries } from './lib/app.mjs';

const out = join(root, 'public', 'app');
mkdirSync(out, { recursive: true });
writeEntries(join(root, 'public'), fs);
writeFileSync(join(root, 'public', 'site-config.js'), siteConfig());

const ctx = await context(appOptions({
  outdir: out, splitting: true, sourcemap: true,
  loader: { '.woff': 'dataurl', '.png': 'dataurl' },
  external: ['/fonts/*', '/img/*'],
}));
await ctx.watch();

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json' };
const pub = join(root, 'public');
const port = Number(process.env.PORT ?? 8800);
// rinvii di public/_redirects (solo percorsi esatti, come su Cloudflare): /percorso, /sito, /corsi, /chi-siamo → /
const redirects = existsSync(join(pub, '_redirects')) ? Object.fromEntries(fs.readFileSync(join(pub, '_redirects'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/))) : {};
createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (redirects[path]) { res.writeHead(302, { Location: redirects[path] + new URL(req.url, 'http://x').search }).end(); return; }
  let file = normalize(join(pub, path));
  if (!file.startsWith(pub)) { res.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  else if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`; // come fa Cloudflare: /pilates serve pilates.html
  if (!existsSync(file)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Non trovato'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Home su http://localhost:${port}  ·  corsi su /pilates, /functional, /personal-training  ·  app su /app/  ·  gestionale su /gestionale/`));
