// Compila la web app in public/app/ (index.html, app.js, app.css, manifest). Per Supabase: KUKO_SUPABASE_URL e KUKO_SUPABASE_ANON_KEY.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { appHtml, appOptions, manifest, root, siteConfig } from './lib/app.mjs';

const out = join(root, 'public', 'app');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build(appOptions({
  outdir: out, splitting: true, minify: true,
  loader: { '.woff': 'dataurl', '.png': 'dataurl' },
  external: ['/fonts/*', '/img/*'],
}));

writeFileSync(join(out, 'index.html'), appHtml);
writeFileSync(join(out, 'manifest.webmanifest'), manifest);
writeFileSync(join(root, 'public', 'site-config.js'), siteConfig());
console.log(process.env.KUKO_SUPABASE_URL ? 'app compilata in public/app (con Supabase)' : 'app compilata in public/app (demo nel browser)');
