// Collega lo scorrimento della pagina alla scena: pos va da 0 (la porta d'ingresso) a 6 (il finale con tutti).
import { createScene, STEPS } from './scene.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const body = document.body, story = $('#percorso'), canvas = $('#gl'), rail = $('.rail');
const phases = $$('.phase'), stages = $$('.rail a'), hint = $('.hint');
const params = new URLSearchParams(location.search);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = !!(navigator.connection && navigator.connection.saveData);
const lowMem = !!(navigator.deviceMemory && navigator.deviceMemory <= 2);
const wantLive = (params.has('live') || (!reduce && !saveData && !lowMem)) && !params.has('static');
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = (a, b, x) => { const t = cl((x - a) / (b - a)); return t * t * (3 - 2 * t); };

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

  let live = true, frozen = false, cur = 0, target = 0, last = 0, t0 = performance.now(), introStart = null, quality = 1, slow = 0, frames = 0, forced = null;
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
  const goTo = (p) => scrollTo({ top: scrollFor(p), behavior: reduce ? 'auto' : 'smooth' });
  $$('[data-go]').forEach((a) => a.addEventListener('click', (e) => { if (!body.classList.contains('is-live')) return; e.preventDefault(); goTo(+a.dataset.go); }));
  // se un link in una fase non visibile riceve il focus da tastiera, porto lì la scena
  phases.forEach((p) => p.addEventListener('focusin', () => { const a = +p.dataset.a, b = +p.dataset.b; if (cur < a || cur > b) scrollTo({ top: scrollFor(Math.max(0, (a + Math.min(b, a + 0.7)) / 2)), behavior: 'auto' }); }));

  const ENTER = [0.58, 2.58, 4.58];
  function captions() {
    let vmax = 0;
    phases.forEach((p) => {
      const a = +p.dataset.a, b = +p.dataset.b;
      const vin = sm(a, a + 0.1, cur), vout = 1 - sm(b - 0.1, b, cur), v = Math.min(vin, vout);
      vmax = Math.max(vmax, v);
      p.style.opacity = v.toFixed(3);
      p.classList.toggle('is-on', v > 0.02);
      p.style.setProperty('--v', v.toFixed(3));
      const c = $('.copy', p);
      const dir = cur < a ? 1 : -1;
      c.style.transform = `translate3d(0, ${(dir * (1 - v) * 30).toFixed(1)}px, 0)`;
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
    cur += (tgt - cur) * (forced != null ? 1 : 1 - Math.exp(-dt * 7));
    if (Math.abs(tgt - cur) < 0.0004) cur = tgt;
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
    setPos(p, i = 1) { forced = p; cur = p; if (!running) { running = true; last = performance.now(); } scene.render(p, (performance.now() - t0) / 1000, [0, 0], i); captions(); },
    release() { forced = null; frozen = false; kick(); },
    cam(a) { scene.setCam(a); },
    freeze() { frozen = true; }, // per le prove con un disegno solo
    stats() { return scene.stats ? scene.stats() : null; },
    get pos() { return cur; }, // per le prove
    scene,
  };
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
start();
