// KUKO LAB, vetrina: effetti e piccoli dettagli d'uso.
// L'idea: il quadrante del logo è lo strumento della pagina. Si accende all'apertura, le tacche seguono il dito o il mouse,
// e lo stesso quadrante, piccolo attorno al logo in alto, segna a che punto del giro sei (360° = fondo pagina).
// Tutto è a strati: senza questo file, o con "riduci animazioni", la pagina resta completa e ferma.
(function () {
  'use strict';
  var root = document.documentElement;
  var mq = function (q) { return !!(window.matchMedia && window.matchMedia(q).matches); };
  var reduce = mq('(prefers-reduced-motion: reduce)');
  var fine = mq('(hover: hover) and (pointer: fine)');
  var hasIO = 'IntersectionObserver' in window;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var vh = window.innerHeight || 800;
  var updaters = [];            // chiamate una volta per fotogramma: leggono la pagina e restituiscono (se serve) la funzione che scrive
  var lastY = window.pageYOffset || 0, lastT = 0, scrollSpeed = 0;
  var raf = 0;

  function safe(name, fn) { try { fn(); } catch (e) { if (window.console && console.warn) console.warn('fx ' + name + ':', e); } }

  function schedule() { if (!raf) raf = requestAnimationFrame(run); }
  function run(t) {
    raf = 0;
    var y = window.pageYOffset || root.scrollTop || 0;
    var dy = y - lastY;
    var dt = lastT ? Math.max((t - lastT) / 1000, .008) : .016;
    if (dy !== 0) scrollSpeed = dy / dt;
    lastT = t;
    var writes = [];
    for (var i = 0; i < updaters.length; i++) { try { var w = updaters[i](y, dy); if (w) writes.push(w); } catch (e) { /* un effetto non ferma gli altri */ } }
    for (var j = 0; j < writes.length; j++) { try { writes[j](); } catch (e) {} }
    lastY = y;
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', function () { vh = window.innerHeight || vh; schedule(); });

  // ------------------------------------------------------------ anello di avanzamento attorno al logo: un giro completo = tutta la pagina
  safe('anello', function () {
    var fg = $('.rp-fg'), mark = $('.brand-mark');
    if (!fg || !mark) return;
    var lapped = false;
    updaters.push(function (y) {
      var max = root.scrollHeight - (window.innerHeight || 1);
      var p = max > 0 ? clamp(y / max, 0, 1) : 0;
      return function () {
        fg.style.strokeDashoffset = (100 - p * 100).toFixed(2);
        if (p > .985 && !lapped) { lapped = true; mark.classList.add('lap'); }
        else if (p < .9 && lapped) { lapped = false; mark.classList.remove('lap'); }
      };
    });
  });

  // ------------------------------------------------------------ testata: su telefono si nasconde scendendo e torna appena risali
  safe('testata', function () {
    var head = $('.site-head'), narrow = window.matchMedia('(max-width: 1220px)');
    if (!head) return;
    var hid = false, acc = 0;
    var set = function (v) { hid = v; head.classList.toggle('is-hidden', v); acc = 0; };
    updaters.push(function (y, dy) {
      if (!narrow.matches || y < 160 || $('#drawer.open') || head.contains(document.activeElement)) { if (hid) set(false); acc = 0; return; }
      if (dy === 0) return;
      if ((dy > 0) !== (acc > 0)) acc = 0;
      acc += dy;
      if (!hid && acc > 40) set(true);
      else if (hid && acc < -12) set(false);
    });
  });

  // ------------------------------------------------------------ menu: la barretta arancione scivola sulla voce della sezione in cui sei
  safe('menu', function () {
    var nav = $('.nav');
    if (!nav) return;
    var links = $$('a[href^="#"]', nav);
    var ind = document.createElement('i'); ind.className = 'nav-ind'; ind.setAttribute('aria-hidden', 'true'); nav.appendChild(ind);
    var secs = $$('main > section');
    var cur = null;
    var place = function (a) {
      if (!a || !a.offsetWidth) { ind.classList.remove('on'); return; }
      ind.style.width = a.offsetWidth + 'px';
      ind.style.transform = 'translateX(' + a.offsetLeft + 'px)';
      ind.classList.add('on');
    };
    updaters.push(function () {
      if (!nav.offsetWidth) return;
      var line = vh * .4, here = null;
      for (var i = 0; i < secs.length; i++) { if (secs[i].getBoundingClientRect().top <= line) here = secs[i]; }
      var a = null;
      if (here) for (var j = 0; j < links.length; j++) { if (links[j].hash === '#' + here.id) a = links[j]; }
      if (a === cur) return;
      return function () {
        if (cur) cur.removeAttribute('aria-current');
        cur = a;
        if (a) a.setAttribute('aria-current', 'true');
        place(a);
      };
    });
    window.addEventListener('resize', function () { place(cur); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { place(cur); });
  });

  // ------------------------------------------------------------ barra rapida su telefono: compare dopo l'apertura, sparisce sul modulo
  safe('barra', function () {
    var dock = $('#dock'), card = $('#prova');
    if (!dock) return;
    var over = false;
    if (hasIO && card) new IntersectionObserver(function (en) { over = en[0].isIntersecting; schedule(); }, { threshold: .02 }).observe(card);
    updaters.push(function (y) { var on = y > vh * .7 && !over; return function () { dock.classList.toggle('show', on); }; });
  });

  // ------------------------------------------------------------ orari: la legenda filtra il calendario
  safe('legenda', function () {
    var week = $('.week'), btns = $$('.legend button');
    if (!week || !btns.length) return;
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        var was = b.getAttribute('aria-pressed') === 'true';
        btns.forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        if (was) week.removeAttribute('data-filter');
        else { b.setAttribute('aria-pressed', 'true'); week.setAttribute('data-filter', b.getAttribute('data-type')); }
      });
    });
  });

  // da qui in poi solo movimento: con "riduci animazioni" o senza IntersectionObserver ci si ferma
  if (reduce || !hasIO) { window.__fx = true; schedule(); return; }

  // ------------------------------------------------------------ foto e tappe: si scoprono quando arrivano
  safe('rivelazioni', function () {
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: .22, rootMargin: '0px 0px -6% 0px' });
    $$('.course, .t-photo, .n-photo').forEach(function (el) { io.observe(el); });
  });

  // ------------------------------------------------------------ taglio diagonale: il cuneo si apre mentre la sezione sale
  safe('cunei', function () {
    var els = $$('.sec, .site-foot');
    var last = new Map();
    updaters.push(function () {
      var todo = [];
      els.forEach(function (el) {
        var top = el.getBoundingClientRect().top, p;
        if (top <= vh * .55) p = 1; else p = clamp((vh - top) / (vh * .45), 0, 1);
        p = 1 - Math.pow(1 - p, 2);
        if (Math.abs(p - (last.has(el) ? last.get(el) : -1)) > .004) { last.set(el, p); todo.push([el, p]); }
      });
      if (todo.length) return function () { todo.forEach(function (t) { t[0].style.setProperty('--open', t[1].toFixed(3)); }); };
    });
  });

  // ------------------------------------------------------------ "chi siamo": il titolo si accende parola per parola
  safe('parole', function () {
    var h = $('[data-words]');
    if (!h) return;
    var parts = h.textContent.trim().split(/\s+/);
    h.textContent = '';
    var spans = parts.map(function (w, i) {
      var s = document.createElement('span'); s.className = 'w'; s.textContent = w;
      h.appendChild(s); if (i < parts.length - 1) h.appendChild(document.createTextNode(' '));
      return s;
    });
    var lit = 0;
    updaters.push(function () {
      var top = h.getBoundingClientRect().top;
      var p = clamp((vh * .88 - top) / (vh * .5), 0, 1);
      var n = Math.round(p * spans.length);
      if (n === lit) return;
      return function () { for (var i = 0; i < spans.length; i++) spans[i].classList.toggle('lit', i < n); lit = n; };
    });
  });

  // ------------------------------------------------------------ foto dei corsi: scorrono dentro la cornice
  safe('parallasse', function () {
    var boxes = $$('.c-clip');
    updaters.push(function () {
      var todo = [];
      boxes.forEach(function (b) {
        var r = b.getBoundingClientRect();
        if (r.bottom < -120 || r.top > vh + 120) return;
        var c = clamp(((r.top + r.height / 2) - vh / 2) / (vh / 2 + r.height / 2), -1, 1);
        todo.push([b, c * -24]);
      });
      if (todo.length) return function () { todo.forEach(function (t) { t[0].style.setProperty('--py', t[1].toFixed(1)); }); };
    });
  });

  // ------------------------------------------------------------ apertura: scorrendo, il quadrante gira e il testo si alza
  safe('apertura', function () {
    var hero = $('.hero');
    if (!hero) return;
    var last = -1;
    updaters.push(function () {
      var r = hero.getBoundingClientRect();
      var hp = clamp(-r.top / (r.height * .9), 0, 1);
      if (Math.abs(hp - last) < .002) return;
      return function () { last = hp; hero.style.setProperty('--hp', hp.toFixed(3)); };
    });
  });

  // ------------------------------------------------------------ fascia sul taglio: va da sola e la spinge lo scroll
  safe('fascia', function () {
    var band = $('[data-band]'), track = band && $('.band-track', band);
    if (!track) return;
    var originals = $$('li', track), period = 0, x = 0, v = -52, skew = 0, visible = false, running = false, prev = 0;
    var BASE = -52;
    var build = function () {
      $$('li[data-c]', track).forEach(function (n) { n.remove(); });
      period = track.getBoundingClientRect().width;
      if (!period) return;
      var need = band.getBoundingClientRect().width + period, got = period, k = 0;
      while (got < need + period && k < 12) {
        originals.forEach(function (li) { var c = li.cloneNode(true); c.setAttribute('data-c', ''); track.appendChild(c); });
        got += period; k++;
      }
    };
    var loop = function (t) {
      if (!visible || document.hidden) { running = false; prev = 0; return; }
      var dt = prev ? Math.min((t - prev) / 1000, .05) : 0; prev = t;
      scrollSpeed *= Math.exp(-dt * 3.2);
      var target = BASE - clamp(scrollSpeed, -2400, 2400) * .22;
      v += (target - v) * (1 - Math.exp(-dt * 7));
      var sk = clamp(v * .02, -9, 9);
      skew += (sk - skew) * (1 - Math.exp(-dt * 9));
      x += v * dt;
      if (period > 0) { while (x <= -period) x += period; while (x > 0) x -= period; }
      track.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0) skewX(' + skew.toFixed(2) + 'deg)';
      requestAnimationFrame(loop);
    };
    var start = function () { if (!running && visible) { running = true; requestAnimationFrame(loop); } };
    build();
    window.addEventListener('resize', build);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; start(); }, { rootMargin: '80px 0px' }).observe(band);
    document.addEventListener('visibilitychange', start);
  });

  // ------------------------------------------------------------ quadrante: le tacche si alzano dove punti, il ritratto galleggia, una luce segue il mouse
  safe('quadrante', function () {
    var fig = $('[data-dial]'), hero = $('.hero');
    if (!fig || !hero) return;
    var svg = $('.dial', fig);
    if (!svg) return;
    var lines = $$('line', svg);
    var CX = 500, CY = 500, SPREAD = 30, DEEP = 52, OUT = 19;
    var ticks = lines.map(function (el) {
      var x1 = +el.getAttribute('x1'), y1 = +el.getAttribute('y1'), x2 = +el.getAttribute('x2'), y2 = +el.getAttribute('y2');
      var ang = Math.atan2(x1 - CX, CY - y1) * 180 / Math.PI;
      return { el: el, ang: ang, sx: Math.sin(ang * Math.PI / 180), sy: -Math.cos(ang * Math.PI / 180), r1: Math.hypot(x1 - CX, y1 - CY), r2: Math.hypot(x2 - CX, y2 - CY), x1: x1, y1: y1, x2: x2, y2: y2, w: parseFloat(getComputedStyle(el).strokeWidth) || 2, k: 0, on: false };
    });

    // finita l'apertura si toglie la maschera: meno lavoro per il disegno
    var live = function () { svg.classList.add('live'); };
    svg.addEventListener('animationend', function (e) { if (e.target === svg) live(); });
    setTimeout(live, 2600);

    var glow = document.createElement('i'); glow.className = 'hero-glow'; glow.setAttribute('aria-hidden', 'true'); hero.insertBefore(glow, hero.firstChild);

    var ptr = { in: false, ang: 0, s: 0 }, wave = null;
    var px = 0, py = 0, tpx = 0, tpy = 0, gx = 0, gy = 0, tgx = 0, tgy = 0, glowInit = false, running = false;

    var geom = function () { var r = svg.getBoundingClientRect(), h = hero.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, R: r.width / 2, hl: h.left, ht: h.top }; };
    var homeGlow = function () { var g = geom(); tgx = g.cx - g.hl; tgy = g.cy - g.ht; if (!glowInit) { gx = tgx; gy = tgy; glowInit = true; } };
    homeGlow();

    var onMove = function (e) {
      var g = geom(), dx = e.clientX - g.cx, dy = e.clientY - g.cy, d = Math.hypot(dx, dy);
      ptr.in = d < g.R * 1.45;
      ptr.ang = Math.atan2(dx, -dy) * 180 / Math.PI;
      ptr.s = clamp((d - g.R * .4) / (g.R * .3), 0, 1) * clamp((g.R * 1.45 - d) / (g.R * .3), 0, 1);
      tpx = clamp(dx / g.R, -1, 1); tpy = clamp(dy / g.R, -1, 1);
      if (e.pointerType === 'mouse') { tgx = e.clientX - g.hl; tgy = e.clientY - g.ht; }
      if (ptr.in) wave = null;
      go();
    };
    var onLeave = function () { ptr.in = false; tpx = 0; tpy = 0; homeGlow(); go(); };
    hero.addEventListener('pointermove', onMove);
    hero.addEventListener('pointerleave', onLeave);
    hero.addEventListener('pointerup', function (e) { if (e.pointerType !== 'mouse') onLeave(); });
    hero.addEventListener('pointercancel', onLeave);
    window.addEventListener('resize', homeGlow);

    var apply = function (t, k) {
      var r1 = t.r1 + k * OUT, r2 = t.r2 - k * DEEP;
      t.el.setAttribute('x1', (CX + t.sx * r1).toFixed(1));
      t.el.setAttribute('y1', (CY + t.sy * r1).toFixed(1));
      t.el.setAttribute('x2', (CX + t.sx * r2).toFixed(1));
      t.el.setAttribute('y2', (CY + t.sy * r2).toFixed(1));
      t.el.style.strokeWidth = (t.w * (1 + k * .9)).toFixed(2);
      t.el.style.stroke = 'rgba(232,96,40,' + (.45 + k * .55).toFixed(2) + ')';
      t.on = true;
    };
    var reset = function (t) {
      t.el.setAttribute('x1', t.x1); t.el.setAttribute('y1', t.y1);
      t.el.setAttribute('x2', t.x2); t.el.setAttribute('y2', t.y2);
      t.el.style.removeProperty('stroke-width'); t.el.style.removeProperty('stroke');
      t.on = false;
    };

    var frame = function (now) {
      running = false;
      var active = false, ang = null, str = 0;
      if (wave) {
        var q = (now - wave.t0) / wave.dur;
        if (q >= 1) wave = null;
        else { var e = q < .5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2; ang = -30 + 420 * e; str = Math.sin(Math.PI * Math.min(q * 1.1, 1)) * .9 + .1; active = true; }
      } else if (ptr.in) { ang = ptr.ang; str = ptr.s; }

      for (var i = 0; i < ticks.length; i++) {
        var t = ticks[i], tgt = 0;
        if (ang !== null) {
          var d = Math.abs(((t.ang - ang + 540) % 360) - 180);
          if (d < SPREAD) { var qq = 1 - d / SPREAD; tgt = qq * qq * str; }
        }
        t.k += (tgt - t.k) * .24;
        if (t.k < .005 && tgt === 0) { t.k = 0; if (t.on) reset(t); }
        else { apply(t, t.k); active = true; }
      }

      px += (tpx - px) * .1; py += (tpy - py) * .1;
      if (Math.abs(px - tpx) > .002 || Math.abs(py - tpy) > .002) active = true;
      fig.style.setProperty('--px', px.toFixed(3)); fig.style.setProperty('--py', py.toFixed(3));

      gx += (tgx - gx) * .07; gy += (tgy - gy) * .07;
      if (Math.abs(gx - tgx) > .5 || Math.abs(gy - tgy) > .5) active = true;
      glow.style.setProperty('--gx', gx.toFixed(1) + 'px'); glow.style.setProperty('--gy', gy.toFixed(1) + 'px');

      if (active) go();
    };
    var go = function () { if (!running) { running = true; requestAnimationFrame(frame); } };

    // un giro di luce a fine apertura: fa capire che il quadrante risponde (una volta sola, solo se non l'hai già toccato)
    setTimeout(function () { if (!ptr.in) { wave = { t0: performance.now(), dur: 1700 }; go(); } }, 2100);
    go();
  });

  // ------------------------------------------------------------ tessere: si inclinano verso il mouse e riflettono la luce
  safe('tessere', function () {
    if (!fine) return;
    $$('.pass').forEach(function (p) {
      var inn = $('.pass-in', p);
      if (!inn) return;
      p.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse') return;
        var r = p.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        p.classList.add('is-tilting');
        p.style.setProperty('--ry', ((x - .5) * 12).toFixed(2) + 'deg');
        p.style.setProperty('--rx', ((.5 - y) * 9).toFixed(2) + 'deg');
        inn.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
        inn.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
        inn.style.setProperty('--go', '1');
      });
      p.addEventListener('pointerleave', function () {
        p.classList.remove('is-tilting');
        p.style.removeProperty('--rx'); p.style.removeProperty('--ry');
        inn.style.setProperty('--go', '0');
      });
    });
  });

  // ------------------------------------------------------------ "trascina": un gettone segue il mouse sulla fascia delle foto
  safe('trascina', function () {
    var reel = $('[data-reel]');
    if (!reel || !fine) return;
    var tag = document.createElement('i'); tag.className = 'drag-tag'; tag.setAttribute('aria-hidden', 'true'); tag.textContent = 'Trascina';
    reel.appendChild(tag);
    reel.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var r = reel.getBoundingClientRect();
      tag.style.transform = 'translate3d(' + (e.clientX - r.left).toFixed(0) + 'px,' + (e.clientY - r.top).toFixed(0) + 'px,0) translate(-50%,-50%)';
      tag.classList.add('on');
    });
    reel.addEventListener('pointerleave', function () { tag.classList.remove('on'); });
    reel.addEventListener('pointerdown', function () { tag.classList.add('grab'); });
    window.addEventListener('pointerup', function () { tag.classList.remove('grab'); });
  });

  root.classList.add('fx');
  window.__fx = true;
  schedule();
})();
