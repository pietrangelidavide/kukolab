// Parti comuni agli script che compilano la web app (build, dev, preview).
import { join } from 'node:path';

export const root = new URL('../..', import.meta.url).pathname;

/** Impostazioni di esbuild. Con Supabase (KUKO_SUPABASE_URL e KUKO_SUPABASE_ANON_KEY) l'app usa il database vero, altrimenti la demo nel browser. */
export function appOptions(extra = {}) {
  return {
    entryPoints: { app: join(root, 'src', 'main.tsx') },
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022', jsx: 'automatic', logLevel: 'warning',
    define: {
      __KUKO_SUPABASE_URL__: JSON.stringify(process.env.KUKO_SUPABASE_URL ?? ''),
      __KUKO_SUPABASE_KEY__: JSON.stringify(process.env.KUKO_SUPABASE_ANON_KEY ?? ''),
      'process.env.NODE_ENV': '"production"',
    },
    ...extra,
  };
}

/** Le due porte della stessa web app. Il codice è uno solo (/app/app.js); cambia la pagina d'ingresso: titolo, icona installabile e `mode`. */
export const ENTRIES = {
  client: { dir: 'app', title: 'KUKO LAB | Prenotazioni', short: 'KUKO LAB', name: 'KUKO LAB Prenotazioni', noscript: 'Per prenotare serve JavaScript.' },
  staff: { dir: 'gestionale', title: 'KUKO LAB | Gestionale', short: 'Gestionale', name: 'KUKO LAB Gestionale', noscript: 'Per usare il gestionale serve JavaScript.' },
};

export const entryHtml = (mode = 'client') => {
  const e = ENTRIES[mode];
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${e.title}</title>
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#070707" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#eceef0" media="(prefers-color-scheme: light)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${e.short}">
<link rel="manifest" href="/${e.dir}/manifest.webmanifest">
<link rel="icon" href="/img/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="preload" href="/fonts/montserrat.woff" as="font" type="font/woff" crossorigin>
<link rel="stylesheet" href="/app/app.css">
</head>
<body>
<div id="root"></div>
<noscript>${e.noscript}</noscript>
<script>window.KUKO_ASSETS={mode:${JSON.stringify(mode)}};</script>
<script type="module" src="/app/app.js"></script>
</body>
</html>
`;
};

export const entryManifest = (mode = 'client') => {
  const e = ENTRIES[mode];
  return JSON.stringify({
    name: e.name, short_name: e.short, lang: 'it', start_url: `/${e.dir}/`, scope: `/${e.dir}/`, display: 'standalone',
    background_color: '#070707', theme_color: '#070707',
    icons: [{ src: '/img/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/img/icon-512.png', sizes: '512x512', type: 'image/png' }],
  }, null, 2);
};

/** Scrive le pagine d'ingresso (index.html e manifest) dell'app dei clienti e del gestionale. Il codice sta solo in public/app/. */
export function writeEntries(pubDir, fs) {
  for (const mode of Object.keys(ENTRIES)) {
    const dir = join(pubDir, ENTRIES[mode].dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(join(dir, 'index.html'), entryHtml(mode));
    fs.writeFileSync(join(dir, 'manifest.webmanifest'), entryManifest(mode));
  }
}

/** Configurazione per il modulo della vetrina (prova gratuita): con Supabase le richieste vanno al database, senza restano in una coda locale (demo). La chiave anon è pubblica per natura. */
export const siteConfig = () => `window.KUKO_SITE=${JSON.stringify({ supabaseUrl: process.env.KUKO_SUPABASE_URL ?? '', supabaseKey: process.env.KUKO_SUPABASE_ANON_KEY ?? '' })};\n`;
