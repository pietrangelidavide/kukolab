// Inserisce nella vetrina (public/index.html) l'orario settimanale preso da src/data/schedule.json.
// Uso: npm run site   (da rilanciare quando cambiano gli orari)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const data = JSON.parse(readFileSync(join(root, 'src', 'data', 'schedule.json'), 'utf8'));
const DAYS = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const types = Object.fromEntries(data.types.map((t) => [t.id, t]));

const rows = DAYS.map((name, i) => {
  const wd = i + 1;
  const slots = data.weekly
    .filter((w) => w.days.includes(wd))
    .sort((a, b) => a.time.localeCompare(b.time) || a.type.localeCompare(b.type))
    .map((w) => `          <li class="slot t-${w.type}"><time>${w.time}</time><span>${types[w.type].name}</span></li>`);
  return `        <section class="day" aria-labelledby="g${wd}">\n          <h3 id="g${wd}">${name}</h3>\n          <ul class="slots">\n${slots.join('\n') || '          <li class="slot"><span>Chiuso</span></li>'}\n          </ul>\n        </section>`;
});
const html = `      <div class="week">\n${rows.join('\n')}\n      </div>`;

const file = join(root, 'public', 'index.html');
const src = readFileSync(file, 'utf8');
const out = src.replace(/<!--ORARI-->[\s\S]*?<!--\/ORARI-->/, `<!--ORARI-->\n${html}\n<!--/ORARI-->`);
if (out === src && !src.includes(html)) throw new Error('segnaposto ORARI non trovato');
writeFileSync(file, out);
console.log('orari inseriti');
