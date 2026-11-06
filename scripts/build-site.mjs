// Inserisce le parti generate in due pagine statiche:
//   public/sito.html  (vetrina): orario settimanale (src/data/schedule.json), quadranti (ritratto e carosello dei corsi),
//                     schede del nutrizionista (src/data/nutritionist.json), dei trainer (src/data/trainers.json) e di fisioterapista e osteopata (src/data/professionals.json);
//   public/index.html (pagina di ingresso): anteprima dell'app nel telefono (primi corsi del lunedì).
// Uso: npm run site   (da rilanciare quando cambiano orari o i dati di nutrizionista, trainer e professionisti)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

// ------------------------------------------------------------------ quadrante 360°++ (SVG): tacche ogni 3 gradi e arco arancio attorno al ritratto
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
// il ritratto (img.face, in HTML) sta al centro del quadrante: qui restano tacche, arco, freccia e "++"
const dial = `<svg class="dial" viewBox="0 0 1000 1000" aria-hidden="true" focusable="false">
  <circle cx="500" cy="500" r="${R}" class="ring"/>
  <circle cx="500" cy="500" r="352" class="ring in"/>
  ${ticks}
  <path class="arc" pathLength="100" d="M500 108 A392 392 0 1 1 ${f(ax)} ${f(ay)}"/>
  <g class="sweep" style="--a:${END}deg">
    <polygon class="head" points="486,80 548,80 578,108 548,136 486,136 516,108"/>
  </g>
  <text class="plus" transform="rotate(350 500 500)" x="500" y="128" text-anchor="middle">++</text>
</svg>`;


// ------------------------------------------------------------------ quadrante dietro il carosello dei corsi: solo tacche e un arco che si completa sull'ultimo corso
let cticks = '';
for (let d = 0; d < 360; d += 4) {
  const major = d % 90 === 0, mid = d % 30 === 0;
  const len = major ? 46 : mid ? 28 : 12;
  const [x1, y1] = pt(d, R), [x2, y2] = pt(d, R - len);
  cticks += `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" class="${major ? 't4' : mid ? 't2' : 't1'}"/>`;
}
const cdial = `    <svg class="cdial" viewBox="0 0 1000 1000" aria-hidden="true" focusable="false">
      <circle cx="500" cy="500" r="${R}" class="ring"/>
      ${cticks}
      <circle cx="500" cy="500" r="430" class="arc" pathLength="100" transform="rotate(-90 500 500)"/>
    </svg>`;

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ICON = { functional: 'i-functional', pilates: 'i-pilates', pt: 'i-pt' };

// ------------------------------------------------------------------ nutrizionista: benefici e contatti
const nutri = JSON.parse(readFileSync(join(root, 'src', 'data', 'nutritionist.json'), 'utf8'));
const NICON = { clock: 'i-clock', bolt: 'i-bolt', heal: 'i-heal', plan: 'i-plan', scale: 'i-scale' };
const benefits = nutri.benefits.map((b) => `          <li><span class="f-ic"><svg class="ic" aria-hidden="true"><use href="#${NICON[b.icon]}"/></svg></span><b>${esc(b.title)}</b><small>${esc(b.text)}</small></li>`).join('\n');
const tel = nutri.phone.replace(/\s/g, '');
const nutriHtml = `        <ul class="benefits">
${benefits}
        </ul>
        <p class="n-contacts">
          <a href="tel:${tel}"><svg class="ic" aria-hidden="true"><use href="#i-phone"/></svg>${esc(nutri.phone)}</a>
          <a href="mailto:${esc(nutri.email)}"><svg class="ic" aria-hidden="true"><use href="#i-mail"/></svg>${esc(nutri.email)}</a>
          <a href="https://www.instagram.com/${esc(nutri.instagram)}/" target="_blank" rel="noopener"><svg class="ic" aria-hidden="true"><use href="#i-ig"/></svg>@${esc(nutri.instagram)}</a>
        </p>`;

// ------------------------------------------------------------------ trainer: una scheda a persona; senza la foto la scheda non compare (un riquadro "Foto in arrivo" a metà pagina fa sembrare il sito incompiuto)
const trainers = JSON.parse(readFileSync(join(root, 'src', 'data', 'trainers.json'), 'utf8')).trainers
  .filter((t) => t.photo && existsSync(join(root, 'public', t.photo)));
const trainersHtml = trainers.map((t) => {
  const label = t.name || t.role;
  const photo = `<img src="${esc(t.photo)}" loading="lazy" alt="${esc(t.alt || label)}">`;
  const courses = t.courses.map((c) => `<li><svg class="ic" aria-hidden="true"><use href="#${ICON[c]}"/></svg>${esc(types[c].name)}</li>`).join('');
  const creds = t.creds.length ? `\n            <ul class="creds">${t.creds.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '';
  return `        <li class="trainer" id="t-${esc(t.id)}">
          <figure class="t-photo">${photo}</figure>
          <div class="t-body">
            <h3>${esc(label)}</h3>${t.name ? `\n            <p class="t-role">${esc(t.role)}</p>` : ''}
            <ul class="t-courses" aria-label="Corsi">${courses}</ul>${creds}
          </div>
        </li>`;
}).join('\n');

// ------------------------------------------------------------------ fisioterapista e osteopata: una scheda a persona. Senza foto la scheda ha un grande disegno al posto del ritratto (completa, non "in arrivo"); nome e contatti compaiono solo quando ci sono.
const pros = JSON.parse(readFileSync(join(root, 'src', 'data', 'professionals.json'), 'utf8')).professionals;
const prosHtml = pros.map((p) => {
  const label = p.name || p.role;
  const hasPhoto = p.photo && existsSync(join(root, 'public', p.photo));
  const art = hasPhoto
    ? `<figure class="pro-art has-photo"><img src="${esc(p.photo)}" loading="lazy" alt="${esc(p.alt || label)}"></figure>`
    : `<div class="pro-art" aria-hidden="true"><svg class="ic big"><use href="#i-${esc(p.icon)}"/></svg></div>`;
  const when = p.when.map((w) => `<li>${esc(w)}</li>`).join('');
  const tel = p.phone ? `<a href="tel:${esc(p.phone.replace(/\s/g, ''))}"><svg class="ic" aria-hidden="true"><use href="#i-phone"/></svg>${esc(p.phone)}</a>` : '';
  const mail = p.email ? `<a href="mailto:${esc(p.email)}"><svg class="ic" aria-hidden="true"><use href="#i-mail"/></svg>${esc(p.email)}</a>` : '';
  const ig = p.instagram ? `<a href="https://www.instagram.com/${esc(p.instagram)}/" target="_blank" rel="noopener"><svg class="ic" aria-hidden="true"><use href="#i-ig"/></svg>@${esc(p.instagram)}</a>` : '';
  const contacts = tel || mail || ig ? `\n            <p class="pro-contacts">${tel}${mail}${ig}</p>` : '';
  return `        <li class="pro" id="p-${esc(p.id)}">
          ${art}
          <div class="pro-body">
            <h3>${esc(label)}</h3>${p.name ? `\n            <p class="pro-role">${esc(p.role)}</p>` : ''}
            <p class="pro-intro">${esc(p.intro)}</p>
            <ul class="pro-when" aria-label="Quando può servirti">${when}</ul>${contacts}
          </div>
        </li>`;
}).join('\n');

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
fill('sito.html', {
  ORARI: `      <div class="week">\n${week}\n      </div>`,
  DIAL: `    ${dial}`,
  CDIAL: cdial,
  PROS: prosHtml,
  NUTRI: nutriHtml,
  TRAINERS: trainersHtml,
});
fill('index.html', {
  MOCK: `          <div class="m-days">${chips}</div>\n          <ul class="m-list">\n${mock}\n          </ul>`,
});
console.log('sito: orari, quadranti, nutrizionista, trainer e professionisti · ingresso: anteprima app');
