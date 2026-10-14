// Inserisce nella vetrina (public/index.html) le parti generate: orario settimanale (da src/data/schedule.json), anteprima dell'app e quadrante del titolo.
// Uso: npm run site   (da rilanciare quando cambiano gli orari)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const data = JSON.parse(readFileSync(join(root, 'src', 'data', 'schedule.json'), 'utf8'));
const DAYS = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const types = Object.fromEntries(data.types.map((t) => [t.id, t]));
const slotsOf = (wd) => data.weekly.filter((w) => w.days.includes(wd)).sort((a, b) => a.time.localeCompare(b.time) || a.type.localeCompare(b.type));

// ------------------------------------------------------------------ orario settimanale
const week = DAYS.map((name, i) => {
  const wd = i + 1;
  const slots = slotsOf(wd).map((w) => `            <li class="slot t-${w.type}" data-time="${w.time}"><time>${w.time}</time><span>${types[w.type].name}</span></li>`);
  return `        <section class="day" data-day="${wd}" aria-labelledby="g${wd}">\n          <h3 id="g${wd}">${name}</h3>\n          <ul class="slots">\n${slots.join('\n') || '            <li class="slot"><span>Chiuso</span></li>'}\n          </ul>\n        </section>`;
}).join('\n');

// ------------------------------------------------------------------ anteprima dell'app (telefono): i primi giorni di lezione, senza numeri inventati
const first = slotsOf(1);
const pick = [0, 1, 2, first.length - 1].filter((v, i, a) => first[v] && a.indexOf(v) === i).map((i) => first[i]);
const mock = pick.map((w) => `            <li class="m-row t-${w.type}"><time>${w.time}</time><b>${types[w.type].name}</b><i>Prenota</i></li>`).join('\n');
const chips = SHORT.map((d, i) => `<span${i === 0 ? ' class="on"' : ''}>${d}</span>`).join('');

// ------------------------------------------------------------------ quadrante 360°++ (SVG): tacche ogni 3 gradi, lancetta e arco arancio
const C = 500, R = 480;
const pt = (deg, r) => { const a = ((deg - 90) * Math.PI) / 180; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
const f = (n) => n.toFixed(1);
let ticks = '';
for (let d = 0; d < 360; d += 3) {
  const major = d % 90 === 0, mid = d % 30 === 0;
  const len = major ? 64 : mid ? 34 : 14;
  const [x1, y1] = pt(d, R), [x2, y2] = pt(d, R - len);
  ticks += `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" class="${major ? 't4' : mid ? 't2' : 't1'}"/>`;
}
const END = 330; // gradi percorsi dall'arco
const [ax, ay] = pt(END, 392);
const labels = [0, 90, 180, 270].map((d) => { const [x, y] = pt(d, 318); return `<text x="${f(x)}" y="${f(y + 15)}" text-anchor="middle">${d}</text>`; }).join('');
const dial = `<svg class="dial" viewBox="0 0 1000 1000" aria-hidden="true" focusable="false">
  <circle cx="500" cy="500" r="${R}" class="ring"/>
  <circle cx="500" cy="500" r="268" class="ring in"/>
  <circle cx="500" cy="500" r="196" class="ring in"/>
  ${ticks}
  <g class="lab">${labels}</g>
  <path class="arc" pathLength="100" d="M500 108 A392 392 0 1 1 ${f(ax)} ${f(ay)}"/>
  <g class="sweep" style="--a:${END}deg">
    <line x1="500" y1="500" x2="500" y2="${500 - 392 + 26}" class="needle"/>
    <polygon class="head" points="486,80 548,80 578,108 548,136 486,136 516,108"/>
    <circle cx="500" cy="500" r="16" class="hub"/>
  </g>
  <text class="plus" transform="rotate(350 500 500)" x="500" y="128" text-anchor="middle">++</text>
</svg>`;

const file = join(root, 'public', 'index.html');
let src = readFileSync(file, 'utf8');
const put = (tag, body) => {
  const re = new RegExp(`<!--${tag}-->[\\s\\S]*?<!--/${tag}-->`);
  if (!re.test(src)) throw new Error(`segnaposto ${tag} non trovato`);
  src = src.replace(re, () => `<!--${tag}-->\n${body}\n<!--/${tag}-->`);
};
put('ORARI', `      <div class="week">\n${week}\n      </div>`);
put('MOCK', `          <div class="m-days">${chips}</div>\n          <ul class="m-list">\n${mock}\n          </ul>`);
put('DIAL', `    ${dial}`);
writeFileSync(file, src);
console.log('orari, anteprima app e quadrante inseriti');
