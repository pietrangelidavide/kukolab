// Compila la prova end-to-end e la lancia (il finto Supabase deve già essere acceso: lo fa supabase/e2e.sh).
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const out = join(root, '.tmp', 'e2e');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
await build({ entryPoints: [join(root, 'supabase', 'e2e', 'remote.e2e.ts')], outfile: join(out, 'remote.e2e.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'warning' });
const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', join(out, 'remote.e2e.mjs')], { stdio: 'inherit', env: { ...process.env, TZ: 'Europe/Rome' } });
process.exit(r.status ?? 1);
