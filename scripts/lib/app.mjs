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

export const appHtml = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>KUKO LAB | Prenotazioni</title>
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#070707">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="KUKO LAB">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="/img/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="preload" href="/fonts/montserrat.woff" as="font" type="font/woff" crossorigin>
<link rel="stylesheet" href="app.css">
</head>
<body>
<div id="root"></div>
<noscript>Per prenotare serve JavaScript.</noscript>
<script type="module" src="app.js"></script>
</body>
</html>
`;

export const manifest = JSON.stringify({
  name: 'KUKO LAB Prenotazioni', short_name: 'KUKO LAB', lang: 'it', start_url: '/app/', scope: '/app/', display: 'standalone',
  background_color: '#070707', theme_color: '#070707',
  icons: [{ src: '/img/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/img/icon-512.png', sizes: '512x512', type: 'image/png' }],
}, null, 2);

/** Configurazione per il modulo della vetrina (prova gratuita): con Supabase le richieste vanno al database, senza restano in una coda locale (demo). La chiave anon è pubblica per natura. */
export const siteConfig = () => `window.KUKO_SITE=${JSON.stringify({ supabaseUrl: process.env.KUKO_SUPABASE_URL ?? '', supabaseKey: process.env.KUKO_SUPABASE_ANON_KEY ?? '' })};\n`;
