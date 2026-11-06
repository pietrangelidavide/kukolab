// Inserisce la parte generata nella pagina di ingresso:
//   public/index.html: anteprima dell'app nel telefono (primi corsi del lunedì, da src/data/schedule.json).
// Le pagine della vetrina (sito, corsi, chi-siamo) le genera build-vetrina.mjs da vetrina/ (viene eseguito qui sotto).
// Uso: npm run site   (da rilanciare quando cambiano gli orari in src/data/schedule.json)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const data = JSON.parse(readFileSync(join(root, 'src', 'data', 'schedule.json'), 'utf8'));
const SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const types = Object.fromEntries(data.types.map((t) => [t.id, t]));
const slotsOf = (wd) => data.weekly.filter((w) => w.days.includes(wd)).sort((a, b) => a.time.localeCompare(b.time) || a.type.localeCompare(b.type));

// anteprima dell'app (telefono): i primi giorni di lezione, senza numeri inventati
const first = slotsOf(1);
const pick = [0, 1, 2, first.length - 1].filter((v, i, a) => first[v] && a.indexOf(v) === i).map((i) => first[i]);
const mock = pick.map((w) => `            <li class="m-row t-${w.type}"><time>${w.time}</time><b>${types[w.type].name}</b><i>Prenota</i></li>`).join('\n');
const chips = SHORT.map((d, i) => `<span${i === 0 ? ' class="on"' : ''}>${d}</span>`).join('');

// Ogni pagina ha i suoi segnaposto <!--TAG-->…<!--/TAG-->; se ne manca uno si ferma, così un refuso nell'HTML non passa in silenzio.
const fill = (name, parts) => {
  const file = join(root, 'public', name);
  let src = readFileSync(file, 'utf8');
  for (const [tag, body] of Object.entries(parts)) {
    const re = new RegExp(`<!--${tag}-->[\\s\\S]*?<!--/${tag}-->`);
    if (!re.test(src)) throw new Error(`${name}: segnaposto ${tag} non trovato`);
    src = src.replace(re, () => `<!--${tag}-->\n${body}\n<!--/${tag}-->`);
  }
  writeFileSync(file, src);
};
fill('index.html', {
  MOCK: `          <div class="m-days">${chips}</div>\n          <ul class="m-list">\n${mock}\n          </ul>`,
});
console.log('ingresso: anteprima app');

await import('./build-vetrina.mjs');
