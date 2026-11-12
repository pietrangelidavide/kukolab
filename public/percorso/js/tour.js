// Presentazione: un filmato attraversa lo studio e si ferma su ogni attrezzo; scorrendo la pagina, il filmato avanza (e torna indietro).
// Il filmato (public/percorso/video/attrezzi*.mp4) è disegnato dallo stesso motore 3D del percorso, un fotogramma alla volta (scripts/filmato-attrezzi.mjs):
// ogni fotogramma è un fotogramma chiave, quindi saltare avanti e indietro è rapido. Le etichette (nome dell'attrezzo) non sono nel filmato: stanno in un file a parte
// (attrezzi-etichette.json) con la posizione sullo schermo, fotogramma per fotogramma, e questo script le disegna sopra il video, ferme sull'attrezzo.
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
  const steps = [...sec.querySelectorAll('.tour-steps li')], end = $('.tour-end', sec), story = $('#percorso');
  if (!video || !box || !story) return;
  sec.classList.add('tour-live'); // subito, prima che main.js posizioni la pagina

  const portrait = () => matchMedia('(max-aspect-ratio: 1/1)').matches;
  const urls = (v) => { const n = v ? 'attrezzi-verticale' : 'attrezzi'; return { mp4: `/percorso/video/${n}.mp4`, json: `/percorso/video/${n}-etichette.json` }; };
  let vert = portrait(), data = null, labels = [], D = 27.6, fps = 24, W = 0, H = 0;
  let target = 0, cur = 0, vel = 0, last = 0, running = false, visible = true, shown = -1, lastSeek = -1, seekAt = 0, p = 0, ready = false, dead = false;

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
    measure();
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
  }
  addEventListener('resize', size);

  // scorrimento → tempo del filmato. Il primo tratto è l'introduzione (titolo), l'ultimo la fermo-immagine finale con l'invito a proseguire
  const P0 = 0.035, P1 = 0.93;
  function measure() {
    const r = sec.getBoundingClientRect(), total = Math.max(1, r.height - innerHeight);
    p = cl(-r.top / total);
    target = cl((p - P0) / (P1 - P0)) * D;
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
      if (a < 0.01 || x < margin || x > W - margin || y < 70 || y > H - 80) { if (L.on) { L.el.style.opacity = '0'; L.on = false; } return; }
      if (!L.w) L.w = L.el.lastChild.offsetWidth + (small ? 22 : 42); // nome + filo
      let side = L.side;
      if (side === 'd' && x + L.w + 12 > W - margin) side = 's';
      else if (side === 's' && x - L.w - 12 < margin) side = 'd';
      if (L.cls !== side) { L.el.classList.toggle('d', side === 'd'); L.el.classList.toggle('s', side === 's'); L.cls = side; }
      L.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      L.el.style.opacity = a.toFixed(3); L.on = true;
    });
  }

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
