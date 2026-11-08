// Collega lo scorrimento della pagina alla scena: pos va da 0 (la porta d'ingresso) a 6 (il finale con tutti).
import { createScene, STEPS } from './scene.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const body = document.body, story = $('#percorso'), canvas = $('#gl'), rail = $('.rail');
const phases = $$('.phase'), stages = $$('.rail a'), rooms = $$('.top-links .room'), hint = $('.hint');
const params = new URLSearchParams(location.search);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = !!(navigator.connection && navigator.connection.saveData);
const lowMem = !!(navigator.deviceMemory && navigator.deviceMemory <= 2);
const wantLive = (params.has('live') || (!reduce && !saveData && !lowMem)) && !params.has('static');
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = (a, b, x) => { const t = cl((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const sm5 = (a, b, x) => { const t = cl((x - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };   // dissolvenze: partenza e arrivo senza strappi
// assestamento critico (molla smorzata): la posizione e la velocita' sono continue, quindi la scena scivola invece di rincorrere lo scorrimento a scatti
function damp(cur, vel, tgt, smooth, dt) {
  const om = 2 / smooth, x = om * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const ch = cur - tgt, tmp = (vel + om * ch) * dt;
  return [tgt + (ch + tmp) * e, (vel - om * tmp) * e];
}

function fallback(why) {
  if (why) console.info('Versione senza 3D:', why);
  body.classList.remove('is-live', 'is-loading', 'is-ready');
  document.documentElement.style.removeProperty('--scrim');
  phases.forEach((p) => { p.style.opacity = ''; p.style.visibility = ''; p.classList.remove('is-on'); const c = $('.copy', p); if (c) { c.style.transform = ''; c.style.pointerEvents = ''; } });
}

async function start() {
  if (!wantLive) return fallback('riduci movimento / risparmio dati');
  body.classList.add('is-live');
  let scene = null;
  try { scene = await createScene(canvas, { base: new URL('../', import.meta.url).href }); } catch (e) { console.warn(e); }
  if (!scene) return fallback('WebGL non disponibile');
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); live = false; fallback('contesto WebGL perso'); });

  let live = true, frozen = false, cur = 0, vel = 0, target = 0, last = 0, t0 = performance.now(), introStart = null, quality = 1, slow = 0, frames = 0, forced = null;
  const ptr = [0, 0];
  const maxDpr = () => (matchMedia('(max-width: 860px)').matches ? 1.5 : 2);
  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    scene.resize(w, h, Math.max(1, Math.min(devicePixelRatio || 1, maxDpr()) * quality));
  }
  addEventListener('resize', resize); resize();

  function measure() {
    const r = story.getBoundingClientRect(), total = r.height - innerHeight;
    target = cl(-r.top / Math.max(1, total), 0, 1) * STEPS;
    body.classList.toggle('is-after', r.bottom < innerHeight * 0.5); // la scena è finita: sotto c'è Instagram
  }
  addEventListener('scroll', measure, { passive: true }); addEventListener('resize', measure); measure();
  addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { ptr[0] = e.clientX / innerWidth * 2 - 1; ptr[1] = e.clientY / innerHeight * 2 - 1; } }, { passive: true });

  // salti: verso una tappa (la scena arriva da sola scorrendo)
  const scrollFor = (p) => { const r = story.getBoundingClientRect(); return r.top + scrollY + (p / STEPS) * (r.height - innerHeight); };
  let tween = 0;
  const stopTween = () => { tween++; };
  ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach((ev) => addEventListener(ev, stopTween, { passive: true }));
  function goTo(p) {
    const to = Math.round(scrollFor(p)), from = scrollY, dist = Math.abs(to - from);
    if (reduce || dist < 6) return scrollTo({ top: to, behavior: 'auto' });
    const id = ++tween, dur = cl(700 + dist * 0.3, 900, 2600), t0 = performance.now();
    const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
    const step = (now) => {
      if (id !== tween) return;
      const u = cl((now - t0) / dur);
      scrollTo(0, from + (to - from) * ease(u));
      if (u < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  $$('[data-go]').forEach((a) => a.addEventListener('click', (e) => { if (!body.classList.contains('is-live')) return; e.preventDefault(); goTo(+a.dataset.go); }));
  // se un link in una fase non visibile riceve il focus da tastiera, porto lì la scena
  phases.forEach((p) => p.addEventListener('focusin', () => { const a = +p.dataset.a, b = +p.dataset.b; if (cur < a || cur > b) scrollTo({ top: scrollFor(Math.max(0, (a + Math.min(b, a + 0.7)) / 2)), behavior: 'auto' }); }));

  const ENTER = [0.58, 2.58, 4.58];
  function captions() {
    let vmax = 0;
    phases.forEach((p) => {
      const a = +p.dataset.a, b = +p.dataset.b;
      const vin = sm5(a, a + 0.16, cur), vout = 1 - sm5(b - 0.16, b, cur), v = Math.min(vin, vout);
      vmax = Math.max(vmax, v);
      p.style.opacity = v.toFixed(3);
      p.classList.toggle('is-on', v > 0.02);
      p.style.setProperty('--v', v.toFixed(3));
      const c = $('.copy', p);
      const dir = cur < a ? 1 : -1;
      c.style.transform = `translate3d(0, ${(dir * (1 - v) * 36).toFixed(1)}px, 0)`;
      c.style.pointerEvents = v > 0.7 ? 'auto' : 'none';
    });
    document.documentElement.style.setProperty('--scrim', vmax.toFixed(3));
    // avanzamento: la linea si riempie camminando da una sala all'altra; ogni tappa si accende quando ci entri
    const fill = sm(1.38, 2.62, cur) * 0.5 + sm(3.38, 4.62, cur) * 0.5;
    rail.style.setProperty('--fill', fill.toFixed(4));
    const inRoom = cur >= 0.62 && cur <= 1.38 ? 0 : cur >= 2.62 && cur <= 3.38 ? 1 : cur >= 4.62 && cur <= 5.32 ? 2 : -1;
    stages.forEach((a, i) => {
      a.classList.toggle('on', cur >= ENTER[i] || cur >= 5.85);
      if (i === inRoom) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
    });
    rooms.forEach((a) => a.classList.toggle('now', +a.dataset.room === inRoom));
    rail.classList.toggle('done', cur >= 5.85);
    if (hint) hint.style.opacity = String(1 - sm(0.02, 0.16, cur));
  }

  let running = false, visible = true;
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) kick(); }, { rootMargin: '10% 0px' }).observe(story);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  function kick() { if (!running && live) { running = true; last = performance.now(); requestAnimationFrame(frame); } }

  function frame(now) {
    if (!live || document.hidden || !visible || frozen) { running = false; return; }
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const tgt = forced ?? target;
    if (forced != null) { cur = tgt; vel = 0; } else { [cur, vel] = damp(cur, vel, tgt, 0.26, dt); }
    if (Math.abs(tgt - cur) < 0.0003 && Math.abs(vel) < 0.002) { cur = tgt; vel = 0; }
    let intro = 1;
    if (introStart != null) intro = cl((now - introStart) / 3400);
    try { scene.render(cur, (now - t0) / 1000, ptr, forced != null ? 1 : intro); } catch (e) { console.error(e); live = false; fallback('errore di disegno'); return; }
    captions();
    // se il dispositivo fatica: prima via sfocatura e striscia, poi la post-produzione, poi scende la risoluzione
    frames++; if (dt > 0.034) slow++;
    if (frames === 90) { if (slow > 40) { if (!scene.lower()) { if (quality > 0.6) { quality -= 0.2; resize(); } } } frames = 0; slow = 0; }
    requestAnimationFrame(frame);
  }

  window.__story = {
    setPos(p, i = 1) { forced = p; cur = p; vel = 0; if (!running) { running = true; last = performance.now(); } scene.render(p, (performance.now() - t0) / 1000, [0, 0], i); captions(); },
    release() { forced = null; frozen = false; kick(); },
    cam(a) { scene.setCam(a); },
    freeze() { frozen = true; }, // per le prove con un disegno solo
    stats() { return scene.stats ? scene.stats() : null; },
    get pos() { return cur; }, // per le prove
    scene,
  };
  // arrivando da un'altra pagina con un'ancora (es. /#pilates) la scena parte già nella sala giusta
  const hashGo = location.hash ? $$('[data-go]').find((x) => x.getAttribute('href') === location.hash) : null;
  if (hashGo) { scrollTo(0, Math.round(scrollFor(+hashGo.dataset.go))); measure(); cur = target; vel = 0; }
  // pronto: tolgo il caricamento e faccio entrare il cliente dalla porta
  await (document.fonts ? document.fonts.ready : Promise.resolve());
  body.classList.remove('is-loading'); body.classList.add('is-ready');
  introStart = performance.now() + 300;
  captions(); kick();
}
// sezione "Benessere a 360°": la linea si riempie da una tappa all'altra quando entra nella vista (senza JS o con "riduci movimento" resta tutto acceso)
const team = $('.team');
if (team && !reduce && 'IntersectionObserver' in window) {
  team.classList.add('armed');
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: 0.3 });
  $$('.pro', team).forEach((p, i) => { p.style.setProperty('--i', i); io.observe(p); });
}
// su telefono le tre figure scorrono in orizzontale: i puntini seguono la figura al centro e la lista si legge anche da tastiera
const pros = $('.pros', team || document);
if (pros) {
  const dots = $$('.pros-dots i'), mq = matchMedia('(max-width: 760px)');
  const upd = () => {
    const pr = pros.getBoundingClientRect(), mid = pr.left + pr.width / 2; let best = 0, bd = Infinity;
    [...pros.children].forEach((k, i) => { const r = k.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - mid); if (d < bd) { bd = d; best = i; } });
    dots.forEach((d, i) => d.classList.toggle('on', i === best));
  };
  let raf = 0;
  pros.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(upd); }, { passive: true });
  const tab = () => { if (mq.matches) pros.setAttribute('tabindex', '0'); else pros.removeAttribute('tabindex'); upd(); };
  mq.addEventListener ? mq.addEventListener('change', tab) : mq.addListener(tab); tab();
}
start();
