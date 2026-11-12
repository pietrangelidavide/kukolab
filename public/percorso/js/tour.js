// Presentazione: un filmato attraversa lo studio e si ferma su ogni attrezzo; scorrendo la pagina, il filmato avanza (e torna indietro).
// Il filmato (public/percorso/video/attrezzi*.mp4) è disegnato dallo stesso motore 3D del percorso, un fotogramma alla volta (scripts/filmato-attrezzi.mjs):
// ogni fotogramma è un fotogramma chiave, quindi saltare avanti e indietro è rapido. Le etichette (nome dell'attrezzo) non sono nel filmato: stanno in un file a parte
// (attrezzi-etichette.json) con la posizione sullo schermo, fotogramma per fotogramma, e questo script le disegna sopra il video, ferme sull'attrezzo.
// Sul filmato lavora anche uno strato di testi e illustrazioni (capitoli per sala, didascalie, schede sugli attrezzi) che compare e svanisce nelle transizioni:
// i tempi si ricavano dalle tappe del filmato, e il tempo del filmato rallenta (rispetto allo scorrimento) nei passaggi da una sala all'altra, così il capitolo si legge.
// Senza JavaScript, con «riduci movimento», risparmio dati, rete lenta o filmato che non parte la sezione resta la foto con l'elenco degli attrezzi.
const $ = (s, r = document) => r.querySelector(s);
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = (a, b, x) => { const t = cl((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const sm5 = (a, b, x) => { const t = cl((x - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };
// assestamento critico (come in main.js): il tempo del filmato scivola verso il punto dello scorrimento senza rincorrerlo a scatti
function damp(cur, vel, tgt, smooth, dt) {
  const om = 2 / smooth, x = om * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const ch = cur - tgt, tmp = (vel + om * ch) * dt;
  return [tgt + (ch + tmp) * e, (vel - om * tmp) * e];
}

const sec = $('#attrezzi');
if (sec) init(sec);

function init(sec) {
  const params = new URLSearchParams(location.search);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const conn = navigator.connection || {};
  const slow = !!(conn.saveData || /(^|-)[23]g$/.test(conn.effectiveType || '') || (navigator.deviceMemory && navigator.deviceMemory <= 2));
  if (params.has('static') || (!params.has('live') && (reduce || slow))) return;
  const video = $('.tour-video', sec), box = $('.tour-pin', sec), pinsBox = $('.tour-pins', sec), room = $('.tour-room', sec), roomLabel = $('.label', room);
  const steps = [...sec.querySelectorAll('.tour-steps li')], end = $('.tour-end', sec), story = $('#percorso'), dim = $('.tour-dim', sec), hint = $('.tour-hint', sec);
  const chaps = [...sec.querySelectorAll('.tour-chap')].map((el) => ({ el, room: el.dataset.room, a0: 0, a1: 1, on: false, k: '', svg: $('.tour-ill', el), pz: [...el.querySelectorAll('.pz')] }));
  const caps = [...sec.querySelectorAll('.tour-cap')].map((el) => ({ el, id: el.dataset.tappa, t0: 0, t1: 0, on: false, k: '' }));
  chaps.forEach((c) => c.pz.forEach((g) => { g.style.setProperty('--z', g.dataset.z); g.style.setProperty('--o', g.dataset.o); }));
  if (!video || !box || !story) return;
  sec.classList.add('tour-live'); // subito, prima che main.js posizioni la pagina

  const portrait = () => matchMedia('(max-aspect-ratio: 1/1)').matches;
  const urls = (v) => { const n = v ? 'attrezzi-verticale' : 'attrezzi'; return { mp4: `/percorso/video/${n}.mp4`, json: `/percorso/video/${n}-etichette.json` }; };
  let vert = portrait(), data = null, labels = [], D = 27.6, fps = 24, W = 0, H = 0;
  let target = 0, cur = 0, vel = 0, last = 0, running = false, visible = true, shown = -1, lastSeek = -1, seekAt = 0, p = 0, ready = false, dead = false;
  let Wc = null, sel = -1, hintDone = false, tween = 0, px = 0, py = 0, tpx = 0, tpy = 0;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  function off(why) {
    if (dead) return; dead = true;
    if (why) console.info('Presentazione senza filmato:', why);
    sec.classList.remove('tour-live', 'tour-ready');
    video.removeAttribute('src'); video.load();
  }

  async function load(v) {
    vert = v; ready = false; sec.classList.remove('tour-ready'); lastSeek = -1;
    const u = urls(v);
    video.src = u.mp4; video.load();
    try {
      const r = await fetch(u.json); if (!r.ok) throw new Error(r.status);
      data = await r.json();
    } catch (e) { data = null; console.info('Etichette non disponibili', e); }
    if (data) { fps = data.fps; D = (data.frames - 1) / fps; }
    buildLabels();
    timeline();
    measure();
  }

  // i tempi dello strato di testi, dalle tappe del filmato; e il «rallentamento» dello scorrimento nei passaggi fra le sale (e un po' sulle soste)
  function timeline() {
    Wc = null;
    if (!data) return;
    const ts = data.tappe, N = 1200, wT = 3.6, wH = 1.4, ed = 0.25;
    chaps.forEach((c) => {
      const i = ts.findIndex((t) => t.stanza === c.room);
      if (i < 1) return;
      c.a0 = ts[i - 1].t + ts[i - 1].hold / 2; c.a1 = ts[i].t - ts[i].hold / 2;
    });
    caps.forEach((c) => { const t = ts.find((x) => x.id === c.id); if (t) { c.t0 = t.t - t.hold / 2; c.t1 = t.t + t.hold / 2; } });
    const win = (a, b, x) => sm(a - ed, a + ed, x) * (1 - sm(b - ed, b + ed, x));
    const trans = chaps.map((c) => [c.a0, c.a1]), holds = ts.map((t) => [t.t - t.hold / 2, t.t + t.hold / 2]);
    const w = (x) => 1 + Math.max((wT - 1) * Math.max(...trans.map((r) => win(r[0], r[1], x))), (wH - 1) * Math.max(...holds.map((r) => win(r[0], r[1], x))));
    Wc = new Float32Array(N + 1);
    for (let i = 1; i <= N; i++) Wc[i] = Wc[i - 1] + ((w(((i - 1) * D) / N) + w((i * D) / N)) / 2) * (D / N);
  }
  // tempo del filmato ↔ quanto dello scorrimento (0-1)
  function toU(T) { if (!Wc) return cl(T / D); const N = Wc.length - 1, f = cl(T / D) * N, i = Math.min(N - 1, Math.floor(f)); return (Wc[i] + (Wc[i + 1] - Wc[i]) * (f - i)) / Wc[N]; }
  function toT(u) {
    if (!Wc) return cl(u) * D;
    const N = Wc.length - 1, g = cl(u) * Wc[N]; let a = 0, b = N;
    while (b - a > 1) { const m = (a + b) >> 1; if (Wc[m] <= g) a = m; else b = m; }
    return ((a + (g - Wc[a]) / Math.max(1e-6, Wc[a + 1] - Wc[a])) * D) / N;
  }

  // etichette: una per attrezzo, con il punto sull'oggetto e il nome
  function buildLabels() {
    pinsBox.textContent = ''; labels = [];
    if (!data) return;
    const tp = Object.fromEntries(data.tappe.map((t) => [t.id, t]));
    data.etichette.forEach((e) => {
      const el = document.createElement('div'); el.className = 'tl ' + e.lato;
      el.innerHTML = '<i></i><b></b><span></span>'; el.lastChild.textContent = e.n;
      pinsBox.appendChild(el);
      labels.push({ el, side: e.lato, t0: tp[e.tappa].t - tp[e.tappa].hold / 2, t1: tp[e.tappa].t + tp[e.tappa].hold / 2, w: 0, on: false });
    });
  }

  function size() {
    W = box.clientWidth; H = box.clientHeight;
    const v = portrait();
    if (v !== vert && !dead) load(v);
    labels.forEach((L) => { L.w = 0; });
    fitStroke();
  }
  addEventListener('resize', size);

  // lo spessore del tratto delle illustrazioni resta lo stesso a ogni dimensione (le icone sono in scala diversa)
  function fitStroke() {
    chaps.forEach((c) => {
      const r = c.svg.getBoundingClientRect(), k = Math.min(r.width / 200, r.height / 150) || 1;
      c.pz.forEach((g, i) => { const u = g.firstElementChild, sc = (parseFloat(u.getAttribute('width')) || 48) / 48; g.style.setProperty('--sw', ((i === 0 ? 2.3 : 1.7) / (k * sc)).toFixed(3)); });
    });
  }

  // scorrimento → tempo del filmato. Il primo tratto è l'introduzione (titolo), l'ultimo la fermo-immagine finale con l'invito a proseguire
  const P0 = 0.035, P1 = 0.93;
  function measure() {
    const r = sec.getBoundingClientRect(), total = Math.max(1, r.height - innerHeight);
    p = cl(-r.top / total);
    target = toT(cl((p - P0) / (P1 - P0)));
    sec.classList.toggle('t-intro', p < 0.012);
    sec.style.setProperty('--intro', (1 - sm(0, 0.045, p)).toFixed(3));
    const e = sm(P1 - 0.04, P1 + 0.025, p);
    sec.style.setProperty('--end', e.toFixed(3));
    end.classList.toggle('on', e > 0.7);
    visible = r.bottom > 0 && r.top < innerHeight;
    if (visible) kick();
  }
  addEventListener('scroll', measure, { passive: true });

  // sala corrente, e quanto di ogni sala è già percorso
  function hud(T) {
    if (!data) return;
    const ts = data.tappe; let best = ts[0], bd = 1e9;
    ts.forEach((t) => { const d = Math.abs(t.t - T); if (d < bd) { bd = d; best = t; } });
    if (best.stanza !== hud.want) { // la scritta della sala si dissolve, cambia e riappare
      hud.want = best.stanza; room.classList.add('sw');
      clearTimeout(hud.tm); hud.tm = setTimeout(() => { roomLabel.textContent = hud.want; room.classList.remove('sw'); }, 170);
    }
    const first = (s) => ts.find((t) => t.stanza === s), starts = [first('Personal Training').t - 1.2, first('Pilates').t - 1.4, first('Functional').t - 1.4, D];
    steps.forEach((li, i) => {
      const f = cl((T - starts[i]) / (starts[i + 1] - starts[i]));
      li.style.setProperty('--f', f.toFixed(3));
      li.classList.toggle('on', f > 0);
      const b = li.firstElementChild; if (b) { if (f > 0 && f < 1) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); }
    });
  }

  // etichette sul fotogramma mostrato (f) al tempo T
  function paint(T) {
    if (!data || !ready) return;
    const f = Math.round(T * fps), row = data.pins[f] || [];
    const vw = data.w, vh = data.h, sc = Math.max(W / vw, H / vh), rw = vw * sc, rh = vh * sc, ox = (W - rw) / 2, oy = (H - rh) / 2;
    const seen = {}; row.forEach((q) => { seen[q[0]] = q; });
    const small = W < 760, margin = small ? 10 : 24;
    labels.forEach((L, i) => {
      const q = seen[i];
      const a = q ? sm5(L.t0 - 0.5, L.t0 - 0.05, T) * (1 - sm5(L.t1 + 0.05, L.t1 + 0.5, T)) : 0;
      const x = q ? ox + q[1] * rw : 0, y = q ? oy + q[2] * rh : 0;
      if (a < 0.01 || x < margin || x > W - margin || y < 70 || y > H - 80) {
        if (L.on) { L.el.style.opacity = '0'; L.on = false; if (L.hit) { L.hit = false; L.el.classList.remove('hit'); } if (sel === i) close(); }
        return;
      }
      L.x = x;
      const hit = a > 0.6; if (hit !== L.hit) { L.hit = hit; L.el.classList.toggle('hit', hit); if (!hit && sel === i) close(); }
      if (!L.w) L.w = L.el.lastChild.offsetWidth + (small ? 22 : 42); // nome + filo
      let side = L.side;
      if (side === 'd' && x + L.w + 12 > W - margin) side = 's';
      else if (side === 's' && x - L.w - 12 < margin) side = 'd';
      if (L.cls !== side) { L.el.classList.toggle('d', side === 'd'); L.el.classList.toggle('s', side === 's'); L.cls = side; }
      L.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      L.el.style.opacity = a.toFixed(3); L.on = true;
    });
  }

  // capitoli, didascalie, titolo di invito: ognuno compare e svanisce nel suo tratto di filmato; --a = quanto è visibile, --c = a che punto del tratto siamo (per il movimento)
  const put = (o, a, extra) => { const k = a.toFixed(3) + (extra || ''); if (k === o.k) return; o.k = k; o.el.style.setProperty('--a', a.toFixed(3)); };
  function layers(T) {
    if (!data) return;
    let cv = 0;
    chaps.forEach((c) => {
      const len = Math.max(0.2, c.a1 - c.a0), fade = Math.min(0.5, len * 0.32);
      const a = sm5(c.a0, c.a0 + fade, T) * (1 - sm5(c.a1 - 0.05 - fade, c.a1 - 0.05, T)), on = a > 0.004;
      if (on !== c.on) { c.on = on; c.el.classList.toggle('on', on); }
      if (!on) return;
      cv = Math.max(cv, a);
      const cc = cl((T - c.a0) / len), k = [a, cc, px, py].map((v) => v.toFixed(3)).join('|');
      if (k === c.k) return;
      c.k = k; const st = c.el.style; st.setProperty('--a', a.toFixed(3)); st.setProperty('--c', cc.toFixed(3)); st.setProperty('--px', px.toFixed(3)); st.setProperty('--py', py.toFixed(3));
    });
    const dk = cv.toFixed(3); if (dk !== layers.dk) { layers.dk = dk; dim.style.setProperty('--cv', dk); }
    caps.forEach((c) => {
      const a = sm5(c.t0 - 0.15, c.t0 + 0.3, T) * (1 - sm5(c.t1 - 0.1, c.t1 + 0.4, T)), on = a > 0.004;
      if (on !== c.on) { c.on = on; c.el.classList.toggle('on', on); }
      if (on) put(c, a);
    });
    const h = hintDone ? 0 : sm(1.7, 2.5, T) * (1 - sm(7.2, 8.2, T));
    const hk = h.toFixed(2); if (hk !== layers.hk) { layers.hk = hk; hint.style.setProperty('--hint', hk); }
  }

  // scheda dell'attrezzo: si apre toccando un'etichetta (nome e a cosa serve vengono dall'elenco in fondo alla sezione)
  const card = document.createElement('aside');
  card.className = 'tour-card'; card.setAttribute('aria-hidden', 'true');
  card.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><use href="#i-barbell"/></svg><h3></h3><button type="button" tabindex="-1" aria-label="Chiudi la scheda">×</button><p></p>';
  box.appendChild(card);
  function open(i) {
    const li = $('#a-' + data.etichette[i].id, sec); if (!li) return;
    $('use', card).setAttribute('href', '#i-' + li.dataset.ic);
    $('h3', card).textContent = $('strong', li).textContent; $('p', card).textContent = $('span', li).textContent;
    card.classList.toggle('r', labels[i].x < W * 0.5); card.classList.toggle('l', labels[i].x >= W * 0.5);
    card.classList.add('on'); sec.classList.add('t-card'); sel = i; hintDone = true;
    labels.forEach((L, k) => L.el.classList.toggle('sel', k === i));
  }
  function close() { if (sel < 0) return; sel = -1; card.classList.remove('on'); sec.classList.remove('t-card'); labels.forEach((L) => L.el.classList.remove('sel')); }
  pinsBox.addEventListener('click', (e) => {
    const el = e.target.closest('.tl'); if (!el || !el.classList.contains('hit')) return;
    const i = labels.findIndex((L) => L.el === el); if (i < 0) return;
    if (sel === i) close(); else open(i);
  });
  $('button', card).addEventListener('click', close);
  box.addEventListener('pointerdown', (e) => { if (sel >= 0 && !e.target.closest('.tl, .tour-card')) close(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  if (fine) box.addEventListener('pointermove', (e) => { const r = box.getBoundingClientRect(); tpx = ((e.clientX - r.left) / r.width - 0.5) * 2; tpy = ((e.clientY - r.top) / r.height - 0.5) * 2; });

  // i tre capitoli della barra in basso portano alla sala (il filmato corre fino lì)
  function go(room) {
    const t = data && data.tappe.find((x) => x.stanza === room); if (!t) return;
    const r = sec.getBoundingClientRect(), total = Math.max(1, r.height - innerHeight);
    const y1 = Math.round(r.top + scrollY + (P0 + toU(t.t - 0.1) * (P1 - P0)) * total), y0 = scrollY, dist = y1 - y0;
    if (Math.abs(dist) < 4) return;
    close(); cancelAnimationFrame(tween);
    const dur = Math.min(1600, 650 + Math.abs(dist) * 0.22), t0 = performance.now();
    const step = (now) => { const k = cl((now - t0) / dur); scrollTo({ top: y0 + dist * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2), behavior: 'auto' }); if (k < 1) tween = requestAnimationFrame(step); };
    tween = requestAnimationFrame(step);
  }
  steps.forEach((li) => { const b = $('button', li); if (b) b.addEventListener('click', () => go(b.dataset.room)); });
  ['wheel', 'touchstart', 'keydown'].forEach((ev) => addEventListener(ev, () => cancelAnimationFrame(tween), { passive: true }));

  // il video non si può mandare a un tempo nuovo mentre sta ancora cercando: una ricerca alla volta, e il ciclo continua finché non arriva
  function seek(t) {
    const q = Math.round(t * fps) / fps;
    if (q === lastSeek) return;
    if (video.seeking && performance.now() - seekAt < 300) return;
    lastSeek = q; seekAt = performance.now();
    try { video.currentTime = Math.min(q, D - 0.0005); } catch { /* il video non è ancora pronto */ }
  }
  function kick() { if (!running && visible && !dead) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
  function frame(now) {
    if (!visible || dead) { running = false; return; }
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    [cur, vel] = damp(cur, vel, target, 0.2, dt);
    if (Math.abs(target - cur) < 0.002 && Math.abs(vel) < 0.01) { cur = target; vel = 0; }
    const k = Math.min(1, dt * 4); px += (tpx - px) * k; py += (tpy - py) * k;
    layers(cur);
    if (video.readyState >= 2) { seek(cur); if (!rvfc) { shown = video.currentTime; paint(shown); } }
    hud(rvfc ? (shown < 0 ? cur : shown) : cur);
    requestAnimationFrame(frame);
  }

  // le etichette seguono il fotogramma davvero mostrato
  const rvfc = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  if (rvfc) { const cb = (_, meta) => { shown = meta.mediaTime; paint(shown); video.requestVideoFrameCallback(cb); }; video.requestVideoFrameCallback(cb); }
  video.addEventListener('seeked', () => { shown = video.currentTime; paint(shown); });
  video.addEventListener('loadeddata', () => { ready = true; sec.classList.add('tour-ready'); size(); seek(cur); paint(video.currentTime); });
  video.addEventListener('error', () => off('il filmato non si carica'));
  // alcuni telefoni caricano i fotogrammi solo dopo un primo gesto: lo si ottiene con un avvio e un arresto subito dopo
  const unlock = () => { removeEventListener('touchstart', unlock); removeEventListener('pointerdown', unlock); if (video.readyState < 2) video.play().then(() => video.pause()).catch(() => {}); };
  addEventListener('touchstart', unlock, { passive: true, once: true }); addEventListener('pointerdown', unlock, { passive: true, once: true });

  // «Salta il video» e «Segui un cliente»: vanno al percorso in 3D
  const toStory = (e) => { e.preventDefault(); scrollTo({ top: Math.round(story.getBoundingClientRect().top + scrollY), behavior: 'auto' }); };
  $('.tour-skip', sec).addEventListener('click', toStory);
  $('a', end).addEventListener('click', toStory);

  size();
  measure();
  load(vert);
  hud(0);
}
