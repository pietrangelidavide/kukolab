// Inserisce le parti generate in due pagine statiche:
//   public/sito.html  (vetrina): orario settimanale (src/data/schedule.json), quadrante del ritratto, tessere degli abbonamenti (src/data/packs.json),
//                     schede del nutrizionista (src/data/nutritionist.json) e dei trainer (src/data/trainers.json);
//   public/index.html (pagina di ingresso): anteprima dell'app nel telefono (primi corsi del lunedì).
// Uso: npm run site   (da rilanciare quando cambiano orari, pacchetti o dati del nutrizionista)
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


// ------------------------------------------------------------------ abbonamenti: tessere e dati del gioco "trova il tuo"
const packsFile = JSON.parse(readFileSync(join(root, 'src', 'data', 'packs.json'), 'utf8'));
const showPrices = packsFile.showPrices !== false;
const packs = packsFile.packs.filter((p) => p.active);
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ALLTYPES = ['functional', 'pilates', 'pt'];
const ICON = { functional: 'i-functional', pilates: 'i-pilates', pt: 'i-pt' };
const price = (cents) => { const v = cents / 100; return Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ','); };
const per = (p) => (p.kind === 'pack' ? p.priceCents / p.lessons : null);
const forText = (p) => (p.typeIds.length ? p.typeIds : ALLTYPES).map((t) => types[t].name).join(' + ');
const forIcons = (p) => (p.typeIds.length ? p.typeIds : ALLTYPES).map((t) => `<svg class="ic" aria-hidden="true"><use href="#${ICON[t]}"/></svg>`).join('');
const TONES = ['w', 'k', 'p'];
const WK = ['L', 'M', 'M', 'G', 'V', 'S'];

const ticket = `        <li class="pass ticket tone-k" id="p-prova">
          <span class="sticker">Gratis</span>
          <div class="pass-in">
            <div class="pass-top"><h3>Prima volta?</h3><span class="gift" aria-hidden="true"><svg class="ic"><use href="#i-gift"/></svg></span></div>
            <p class="pass-meta">La prima prova è un regalo</p>
            <p class="pass-blurb">Scegli un corso (o il nutrizionista), compila il modulo: ti chiamiamo noi per fissare l'orario.</p>
            <a class="pass-cta" href="#prova">Prenota la prova</a>
          </div>
        </li>`;
const cards = packs.map((p, i) => {
  const monthly = p.kind === 'monthly';
  const holes = monthly
    ? `<span class="punch wk" aria-hidden="true">${WK.map((d, k) => `<i${k < (p.weeklyLimit || 6) ? ' class="on"' : ''}>${d}</i>`).join('')}</span>`
    : `<span class="punch" aria-hidden="true">${Array.from({ length: Math.min(p.lessons, 12) }, (_, k) => `<i${k === 0 ? ' class="on"' : ''}></i>`).join('')}</span>`;
  const meta = monthly
    ? `${p.weeklyLimit ? `Fino a ${p.weeklyLimit} volte a settimana` : 'Lezioni illimitate'} · ${p.validityDays} giorni`
    : `${p.lessons} ${p.lessons === 1 ? 'lezione' : 'lezioni'} · valide ${p.validityDays} giorni`;
  const pr = showPrices
    ? `<p class="pass-price" aria-label="${price(p.priceCents)} euro${monthly ? ' al mese' : ''}"><span aria-hidden="true">€</span><b aria-hidden="true">${price(p.priceCents)}</b>${monthly ? '<small aria-hidden="true">/mese</small>' : ''}</p>`
    : '';
  const perLesson = showPrices && !monthly && p.lessons > 1 ? `\n            <p class="pass-per">Circa €${price(Math.round(per(p)))} a lezione</p>` : '';
  const topic = p.typeIds.length === 1 ? p.typeIds[0] : '';
  return `        <li class="pass tone-${TONES[i % 3]}" id="p-${p.id}" data-pack="${p.id}">
${p.site?.tag ? `          <span class="sticker">${esc(p.site.tag)}</span>\n` : ''}          <span class="fits" aria-hidden="true">Fa per te!</span>
          <div class="pass-in">
            <div class="pass-top"><h3>${esc(p.name)}</h3>${pr}</div>
            ${holes}
            <p class="pass-meta">${esc(meta)}</p>
            <p class="pass-meta pass-for">${forIcons(p)}<span>${esc(forText(p))}</span></p>
            <p class="pass-blurb">${esc(p.site?.blurb ?? '')}</p>${perLesson}
            <a class="pass-cta" href="#prova" data-topic="${topic}">Provalo gratis</a>
          </div>
        </li>`;
});
const packsData = {
  showPrices,
  packs: packs.map((p) => ({ id: p.id, name: p.name, kind: p.kind, lessons: p.lessons, validityDays: p.validityDays, priceCents: p.priceCents, typeIds: p.typeIds, weeklyLimit: p.weeklyLimit })),
};

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
            <div class="c-cta"><a class="btn btn-sm" href="#prova" data-topic="${t.courses[0]}"><span>Prova una lezione</span></a></div>
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
  PACKS: [ticket, ...cards].join('\n'),
  PACKSDATA: `<script type="application/json" id="packs-data">${JSON.stringify(packsData).replace(/</g, '\\u003c')}</script>`,
  NUTRI: nutriHtml,
  TRAINERS: trainersHtml,
});
fill('index.html', {
  MOCK: `          <div class="m-days">${chips}</div>\n          <ul class="m-list">\n${mock}\n          </ul>`,
});
console.log('sito: orari, quadrante, tessere, nutrizionista e trainer · ingresso: anteprima app');
