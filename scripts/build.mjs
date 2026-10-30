// Compila la web app: il codice in public/app/ (app.js, app.css) e le due pagine d'ingresso, app/ per i clienti e gestionale/ per lo staff. Per Supabase: KUKO_SUPABASE_URL e KUKO_SUPABASE_ANON_KEY.
import { build } from 'esbuild';
import * as fs from 'node:fs';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { appOptions, root, siteConfig, writeEntries } from './lib/app.mjs';

const out = join(root, 'public', 'app');
rmSync(out, { recursive: true, force: true });
rmSync(join(root, 'public', 'gestionale'), { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build(appOptions({
  outdir: out, splitting: true, minify: true,
  loader: { '.woff': 'dataurl', '.png': 'dataurl' },
  external: ['/fonts/*', '/img/*'],
}));

writeEntries(join(root, 'public'), fs);
writeFileSync(join(root, 'public', 'site-config.js'), siteConfig());
console.log(process.env.KUKO_SUPABASE_URL ? 'app compilata in public/app (con Supabase)' : 'app compilata in public/app (demo nel browser)');
