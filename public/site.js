// KUKO LAB, vetrina: menu, "Oggi", carosello dei corsi (con le quattro foto di ogni corso), fascia degli spazi e parti espandibili su telefono.
// (Il gioco degli abbonamenti e il modulo della prova gratuita sono stati tolti dalla pagina: restano nella storia di git, vedi il README.)
(function () {
  // menu su telefono
  var b = document.querySelector('.menu-btn'), d = document.getElementById('drawer');
  if (b && d) {
    var set = function (open) { d.classList.toggle('open', open); b.setAttribute('aria-expanded', open); b.setAttribute('aria-label', open ? 'Chiudi il menu' : 'Apri il menu'); };
    b.addEventListener('click', function () { set(!d.classList.contains('open')); });
    d.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a')) set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && d.classList.contains('open')) { set(false); b.focus(); } });
    var wide = window.matchMedia && window.matchMedia('(min-width: 1221px)');
    if (wide && wide.addEventListener) wide.addEventListener('change', function (m) { if (m.matches) set(false); });
  }

  // "Oggi": evidenzia il giorno nel calendario, mostra le lezioni di oggi (ora di Roma) e quanto manca alla prossima. Si aggiorna da solo ogni mezzo minuto.
  (function () {
    var NAMES = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
    var min = function (t) { return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)); };
    var days = {};
    document.querySelectorAll('.day').forEach(function (el) {
      days[el.getAttribute('data-day')] = Array.prototype.map.call(el.querySelectorAll('.slot[data-time]'), function (s) { return { el: s, time: s.getAttribute('data-time'), name: s.querySelector('span').textContent, type: s.className.replace(/.*(t-\w+).*/, '$1') }; });
    });
    var list = document.getElementById('oggi-list'), fb = document.getElementById('oggi-fallback'), next = document.getElementById('next');
    var sig = '';

    var eta = function (m) {
      if (m < 1) return 'tra meno di un minuto';
      if (m < 60) return 'tra ' + m + ' min';
      var h = Math.floor(m / 60), r = m % 60;
      return h < 24 ? 'tra ' + h + ' h' + (r ? ' ' + r + ' min' : '') : '';
    };

    function render() {
      try {
        var p = {};
        new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
        var wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday];
        var now = (Number(p.hour) % 24) * 60 + Number(p.minute);
        var slots = days[wd] || [], upcoming = null;
        slots.forEach(function (s) { if (!upcoming && min(s.time) > now) upcoming = s; });

        // calendario: giorno di oggi, lezioni passate, prossima
        document.querySelectorAll('.day').forEach(function (el) {
          var on = el.getAttribute('data-day') === String(wd);
          el.classList.toggle('is-today', on);
          if (on) el.setAttribute('aria-current', 'date'); else el.removeAttribute('aria-current');
        });
        slots.forEach(function (s) { s.el.classList.toggle('is-past', min(s.time) <= now); s.el.classList.toggle('is-next', s === upcoming); });

        // elenco "Oggi"
        var key = wd + '|' + (upcoming ? upcoming.time : '-') + '|' + slots.length;
        if (key !== sig) {
          sig = key;
          if (slots.length) {
            list.innerHTML = '';
            slots.forEach(function (s) {
              var li = document.createElement('li');
              li.className = s.type + (min(s.time) <= now ? ' past' : '') + (s === upcoming ? ' next' : '');
              li.innerHTML = '<time></time><span></span>';
              li.firstChild.textContent = s.time; li.lastChild.textContent = s.name;
              list.appendChild(li);
            });
            fb.hidden = true;
          } else { fb.hidden = false; fb.textContent = 'Oggi lo studio è chiuso.'; }
          if (!upcoming && slots.length) { fb.hidden = false; fb.textContent = 'Le lezioni di oggi sono finite.'; }
        }

        // prossima lezione, anche nei giorni dopo, con il conto alla rovescia se manca meno di un giorno
        var when = null, slot = upcoming, ahead = 0;
        if (upcoming) { when = 'oggi'; ahead = min(upcoming.time) - now; }
        else for (var i = 1; i <= 7 && !slot; i++) {
          var n = ((wd - 1 + i) % 7) + 1;
          if (days[n] && days[n].length) { slot = days[n][0]; when = i === 1 ? 'domani' : NAMES[n - 1]; ahead = i * 1440 + min(slot.time) - now; }
        }
        if (slot && next) {
          var e = eta(ahead);
          next.textContent = '';
          next.appendChild(document.createTextNode('Prossima lezione' + (e ? ' ' : ': ')));
          if (e) { var sp = document.createElement('span'); sp.className = 'eta'; sp.textContent = e; next.appendChild(sp); next.appendChild(document.createTextNode(': ')); }
          next.appendChild(document.createTextNode(slot.name + ', ' + when + ' alle ' + slot.time));
          next.hidden = false;
        }
      } catch (e) { /* senza questa parte il sito funziona uguale */ }
    }
    render();
    setInterval(render, 30000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) render(); });
  })();
})();

// ------------------------------------------------------------------ corsi: carosello a tutta pagina
// Personal training, gruppo, Pilates scorrono di lato con scroll-snap (funziona anche senza questo codice). Qui si aggiungono tab, frecce, tastiera e trascinamento col mouse,
// e la posizione di ogni corso (--o: 0 al centro, ±1 di lato) con cui il CSS sposta foto, cornice, parola gigante e testo a velocità diverse; --p (0..1) fa girare il quadrante.
(function () {
  var cx = document.querySelector('[data-cx]');
  var track = cx && cx.querySelector('.cx-track');
  if (!track) return;
  var slides = Array.prototype.slice.call(track.children), n = slides.length;
  if (n < 2) return;
  var tabs = Array.prototype.slice.call(cx.querySelectorAll('.cx-tab'));
  var prev = cx.querySelector('[data-step="-1"]'), next = cx.querySelector('[data-step="1"]');
  var arc = cx.querySelector('.cdial .arc');
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var cur = -1, seen = !('IntersectionObserver' in window), raf = 0;
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var width = function () { return track.clientWidth || 1; };

  function go(i, instant) {
    i = clamp(i, 0, n - 1);
    track.scrollTo({ left: i * width(), behavior: instant || reduce ? 'auto' : 'smooth' });
  }

  function setCur(i) {
    cur = i;
    tabs.forEach(function (t, k) { if (k === i) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current'); });
    if (prev) prev.disabled = i <= 0;
    if (next) next.disabled = i >= n - 1;
  }

  function frame() {
    raf = 0;
    var p = clamp(track.scrollLeft / width(), 0, n - 1), q = p / (n - 1);
    slides.forEach(function (s, i) {
      if (seen && Math.abs(i - p) < .6 && !s.classList.contains('on')) s.classList.add('on');
      if (reduce) return;
      var o = clamp(i - p, -1.2, 1.2);
      s.style.setProperty('--o', o.toFixed(3));
      s.style.setProperty('--a', Math.min(1, Math.abs(o)).toFixed(3));
    });
    if (!reduce) {
      cx.style.setProperty('--p', q.toFixed(3));
      if (arc) arc.style.strokeDashoffset = (100 - (30 + q * 70)).toFixed(1);
    }
    tabs.forEach(function (t, i) { t.style.setProperty('--f', clamp(1 - Math.abs(i - p), 0, 1).toFixed(3)); });
    var c = Math.round(p);
    if (c !== cur) setCur(c);
  }
  var schedule = function () { if (!raf) raf = requestAnimationFrame(frame); };
  track.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', function () { if (cur >= 0) go(cur, true); schedule(); });

  tabs.forEach(function (t) { t.addEventListener('click', function () { go(Number(t.getAttribute('data-go'))); }); });
  if (prev) prev.addEventListener('click', function () { go(cur - 1); });
  if (next) next.addEventListener('click', function () { go(cur + 1); });

  // tastiera: frecce, Home e Fine mentre il fuoco è dentro il carosello
  cx.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    var to = e.key === 'ArrowRight' ? cur + 1 : e.key === 'ArrowLeft' ? cur - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
    if (to === null) return;
    e.preventDefault(); go(to);
  });

  // mouse: si trascina come col dito; il gesto parte dopo qualche pixel, così i link restano cliccabili
  var drag = null, moved = false;
  track.addEventListener('dragstart', function (e) { e.preventDefault(); });
  track.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { x: e.clientX, left: track.scrollLeft, base: cur, on: false, id: e.pointerId };
    moved = false;
  });
  track.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x;
    if (!drag.on) {
      if (Math.abs(dx) < 6) return;
      drag.on = true; moved = true; track.classList.add('is-drag');
      try { track.setPointerCapture(e.pointerId); } catch (err) {}
    }
    track.scrollLeft = drag.left - dx;
  });
  var drop = function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var d = drag, dx = e.clientX - d.x; drag = null;
    if (!d.on) return;
    track.classList.remove('is-drag');
    go(dx < -60 ? d.base + 1 : dx > 60 ? d.base - 1 : d.base);
  };
  track.addEventListener('pointerup', drop);
  track.addEventListener('pointercancel', drop);
  track.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);

  // un link che punta a un corso (#personal, #functional, #pilates) porta qui e apre quel corso
  var ids = slides.map(function (s) { return s.id; });
  var open = function (hash, instant) {
    var i = ids.indexOf(decodeURIComponent(hash.replace(/^#/, '')));
    if (i < 0) return false;
    cx.scrollIntoView({ behavior: instant || reduce ? 'auto' : 'smooth', block: 'start' });
    go(i, true);
    return true;
  };
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (a && a.hash.length > 1 && open(a.hash)) e.preventDefault();
  });
  if (location.hash.length > 1) open(location.hash, true);

  // ogni corso si presenta (foto che si scopre, testo, tappe) la prima volta che lo vedi
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en, io) {
      if (!en[0].isIntersecting) return;
      seen = true; io.disconnect(); schedule();
    }, { threshold: .3 }).observe(cx);
  }
  setCur(0);
  frame();
  cx.classList.add('is-live');
})();

// ------------------------------------------------------------------ corsi: le quattro foto di ogni corso
// Quattro lamelle inclinate: quella scelta si allarga e prende colore. Si sceglie col mouse sopra, col tocco o con la tastiera.
// Da sole avanzano: il CSS fa correre la barra arancione sulla lamella aperta solo quando il corso è in vista e il mouse non c'è sopra
// (con "riduci animazioni" non parte), e alla fine dell'animazione si apre la foto dopo. Senza questo codice resta aperta la prima foto.
(function () {
  Array.prototype.forEach.call(document.querySelectorAll('[data-gal]'), function (gal) {
    var pics = Array.prototype.slice.call(gal.querySelectorAll('.cx-pic'));
    if (pics.length < 2) return;
    var cur = 0;
    var show = function (i) {
      if (i === cur) return;
      cur = i;
      pics.forEach(function (p, k) {
        p.classList.toggle('is-active', k === i);
        if (k === i) p.setAttribute('aria-current', 'true'); else p.removeAttribute('aria-current');
      });
    };
    pics.forEach(function (p, k) {
      p.addEventListener('click', function () { show(k); });
      p.addEventListener('focus', function () { show(k); });
      p.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') show(k); });
    });
    var hold = function (on) { gal.classList.toggle('is-hold', on); };
    gal.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') hold(true); });
    gal.addEventListener('pointerleave', function () { hold(false); });
    gal.addEventListener('focusin', function () { hold(true); });
    gal.addEventListener('focusout', function () { hold(false); });
    gal.addEventListener('animationend', function (e) { if (e.animationName === 'galprog') show((cur + 1) % pics.length); });
  });
})();

// "Gli spazi": la fascia di foto scorre da sola, rallenta col mouse sopra e si trascina col dito o col mouse. Con "riduci animazioni" resta una fascia da scorrere a mano.
(function () {
  var el = document.querySelector('[data-reel]');
  if (!el) return;
  var track = el.querySelector('.reel-track');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!track || reduce) return;

  var originals = Array.prototype.slice.call(track.children);
  originals.forEach(function (li) {
    var c = li.cloneNode(true);
    c.setAttribute('aria-hidden', 'true');
    var im = c.querySelector('img'); if (im) im.alt = '';
    track.appendChild(c);
  });
  el.classList.add('is-live');

  var BASE = -46;           // px al secondo, verso sinistra
  var x = 0, v = BASE, period = 0;
  var hover = false, drag = false, lastX = 0, lastT = 0, visible = false, raf = 0, prev = 0;

  var measure = function () { period = track.children[originals.length].offsetLeft - track.children[0].offsetLeft; };
  var wrap = function () { if (period > 0) { x = ((x % period) - period) % period; } };
  var paint = function () { track.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)'; };

  var tick = function (t) {
    raf = 0;
    if (!visible || document.hidden) { prev = 0; return; }
    var dt = prev ? Math.min((t - prev) / 1000, .05) : 0; prev = t;
    if (!drag) {
      var target = hover ? BASE * .3 : BASE;
      v += (target - v) * (1 - Math.exp(-dt * 2.2));
      x += v * dt;
    }
    wrap(); paint();
    raf = requestAnimationFrame(tick);
  };
  var start = function () { if (!raf && visible) raf = requestAnimationFrame(tick); };

  el.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') hover = true; });
  el.addEventListener('pointerleave', function () { hover = false; });
  el.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag = true; lastX = e.clientX; lastT = e.timeStamp; el.classList.add('drag');
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
  });
  el.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var dx = e.clientX - lastX, dt = (e.timeStamp - lastT) / 1000;
    x += dx; if (dt > 0) v = Math.max(-1400, Math.min(1400, dx / dt));
    lastX = e.clientX; lastT = e.timeStamp;
  });
  var release = function () { drag = false; el.classList.remove('drag'); prev = 0; };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('dragstart', function (e) { e.preventDefault(); });

  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);
  measure();

  var show = function () { el.classList.add('in'); };
  if ('IntersectionObserver' in window) {
    var seen = false;
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible && !seen) { seen = true; show(); }
      start();
    }, { rootMargin: '120px 0px' }).observe(el);
  } else { visible = true; show(); start(); }
  document.addEventListener('visibilitychange', start);
})();

// ------------------------------------------------------------------ sezioni espandibili (solo telefono, fino a 760 px)
// Le parti più lunghe (tappe dei corsi, nutrizione) si aprono a un tocco: meno scorrimento. Gli orari, invece, scorrono di lato.
// I contenitori si creano solo sotto i 760 px e si tolgono sopra: sul desktop la pagina è identica a prima. Senza JS tutto resta aperto.
(function () {
  var mq = window.matchMedia && window.matchMedia('(max-width: 760px)');
  if (!mq) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var CHEV = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>';
  var folds = [], uid = 0;

  function Fold(o) {
    var f = { open: !!o.open, mounted: false };

    f.mount = function () {
      if (f.mounted) return;
      var items = o.items();
      if (!items.length || !items[0].parentNode) return;
      f.items = items; f.parent = items[0].parentNode;
      var id = 'fold-' + (++uid);
      f.el = document.createElement('div'); f.el.className = 'fold'; f.el.id = id;
      f.inn = document.createElement('div'); f.inn.className = 'fold-in';
      f.parent.insertBefore(f.el, items[0]);
      items.forEach(function (n) { f.inn.appendChild(n); });
      f.el.appendChild(f.inn);

      f.btn = document.createElement('button');
      f.btn.type = 'button'; f.btn.className = 'fold-tgl'; f.btn.setAttribute('aria-controls', id);
      f.own = o.head ? o.head() : null;
      if (f.own) {                         // si trasforma un titolo che c'è già
        f.head = f.own;
        f.moved = Array.prototype.slice.call(f.head.childNodes);
        f.moved.forEach(function (n) { f.btn.appendChild(n); });
        f.head.appendChild(f.btn); f.head.classList.add('is-tgl');
      } else {                             // si crea una riga nuova sopra il contenuto
        f.head = document.createElement('div'); f.head.className = 'fold-head';
        f.lbl = document.createElement('span'); f.lbl.className = 'lbl';
        f.btn.appendChild(f.lbl);
        f.head.appendChild(f.btn); f.parent.insertBefore(f.head, f.el);
      }
      if (o.count) { var c = document.createElement('span'); c.className = 'cnt'; c.textContent = o.count; f.btn.appendChild(c); }
      f.btn.insertAdjacentHTML('beforeend', CHEV);
      if (o.closer) {
        f.close = document.createElement('button'); f.close.type = 'button'; f.close.className = 'fold-close'; f.close.textContent = o.closer;
        f.inn.appendChild(f.close);
        f.close.addEventListener('click', function () { f.set(false, true); f.head.scrollIntoView({ block: 'center', behavior: 'instant' }); f.btn.focus({ preventScroll: true }); });
      }
      f.btn.addEventListener('click', function () { f.set(!f.open); });
      f.mounted = true;
      f.set(f.open, true);
    };

    f.set = function (open, instant) {
      f.open = open;
      if (!f.mounted) return;
      var still = instant || reduce.matches;
      if (still) { f.el.style.transition = 'none'; f.head.style.transition = 'none'; }
      f.el.classList.toggle('open', open);
      f.head.classList.toggle('is-open', open);
      f.btn.setAttribute('aria-expanded', String(open));
      if (f.lbl) f.lbl.textContent = open ? (o.labelOpen || o.label) : o.label;
      if (open) f.inn.removeAttribute('inert'); else f.inn.setAttribute('inert', '');
      if (still) { void f.el.offsetHeight; f.el.style.transition = ''; f.head.style.transition = ''; }
    };

    f.unmount = function () {
      if (!f.mounted) return;
      f.items.forEach(function (n) { f.parent.insertBefore(n, f.el); });
      f.el.remove();
      if (f.own) { f.moved.forEach(function (n) { f.head.insertBefore(n, f.btn); }); f.btn.remove(); f.head.classList.remove('is-tgl', 'is-open'); }
      else f.head.remove();
      f.mounted = false;
    };
    folds.push(f);
    return f;
  }

  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var one = function (s, c) { return (c || document).querySelector(s); };

  // corsi: la riga "Una lezione, in quattro tappe" apre tappe, parole chiave e dimensione del gruppo
  $$('.cx-slide').forEach(function (c) {
    Fold({ head: function () { return one('.c-sub', c); }, items: function () { return ['.flow', '.tags', '.group'].map(function (s) { return one(s, c); }).filter(Boolean); } });
  });

  // nutrizione
  var ben = one('.benefits');
  if (ben) Fold({ label: 'Cosa include la consulenza', labelOpen: 'Nascondi i dettagli', count: ben.children.length + ' punti', items: function () { return [ben]; } });

  // orari: su telefono i giorni scorrono di lato (lo fa il CSS); qui si porta in vista quello di oggi, o il primo, e la fascia si può usare anche da tastiera
  var week = one('.week');
  var place = function () {
    if (!week) return;
    if (mq.matches) {
      week.tabIndex = 0; week.setAttribute('role', 'group'); week.setAttribute('aria-label', 'Giorni della settimana: scorri di lato');
      var d = one('.day.is-today', week) || one('.day', week);
      if (d) week.scrollLeft = d.offsetLeft - (week.clientWidth - d.offsetWidth) / 2;
    } else { week.removeAttribute('tabindex'); week.removeAttribute('role'); week.removeAttribute('aria-label'); week.scrollLeft = 0; }
  };

  var sync = function () { folds.forEach(function (f) { if (mq.matches) f.mount(); else f.unmount(); }); document.documentElement.classList.toggle('has-folds', mq.matches); place(); };
  sync();
  if (mq.addEventListener) mq.addEventListener('change', sync); else if (mq.addListener) mq.addListener(sync);

  // un link che punta dentro una parte chiusa la apre prima di scorrere
  var reveal = function (id) {
    if (!id || !mq.matches) return;
    var t = document.getElementById(id), w = t && t.closest ? t.closest('.fold') : null;
    while (w) {
      var hit = folds.filter(function (x) { return x.el === w; })[0];
      if (hit && !hit.open) hit.set(true, true);
      w = w.parentElement ? w.parentElement.closest('.fold') : null;
    }
  };
  var dec = function (h) { try { return decodeURIComponent(h); } catch (e) { return h; } };
  document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[href^="#"]'); if (a && a.hash.length > 1) reveal(dec(a.hash.slice(1))); }, true);
  window.addEventListener('hashchange', function () { reveal(dec(location.hash.slice(1))); });
  if (location.hash.length > 1) reveal(dec(location.hash.slice(1)));
})();
