// KUKO LAB, pagina principale. Poche cose; senza questo file la pagina si legge uguale.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// la testata resta nascosta sopra la prima schermata (dove ci sono già logo, discipline e WhatsApp) e compare scorrendo
const hero = $('#inizio');
if (hero && 'IntersectionObserver' in window) {
  new IntersectionObserver((es) => document.body.classList.toggle('at-top', es[0].intersectionRatio > 0.55), { threshold: [0, 0.2, 0.4, 0.55, 0.7, 1] }).observe(hero);
} else {
  document.body.classList.remove('at-top');
}

// sezione «Non solo allenamento»: la linea si riempie da una tappa all'altra quando entra nella vista (con «riduci movimento» resta tutto acceso)
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

// le tre discipline si «aprono» una volta, quando entrano nella vista (senza questo, o con «riduci movimento», restano ferme e visibili)
const discs = $$('.disc.mid');
if (discs.length && !reduce && 'IntersectionObserver' in window) {
  document.documentElement.classList.add('anim');
  const io2 = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io2.unobserve(e.target); } }), { threshold: 0.45 }   /* parte quando quasi metà sezione è in vista, così il movimento si vede */);
  discs.forEach((d) => io2.observe(d));
}

// menu a tendina del telefono: si chiude scegliendo una voce, toccando fuori o con Esc
const menu = $('.menu');
if (menu) {
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) menu.open = false; });
  document.addEventListener('click', (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.open) { menu.open = false; $('summary', menu).focus(); } });
}
