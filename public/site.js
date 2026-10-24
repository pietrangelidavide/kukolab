// KUKO LAB, vetrina: menu, "Oggi", gioco degli abbonamenti e modulo della prova gratuita.
(function () {
  // menu su telefono
  var b = document.querySelector('.menu-btn'), d = document.getElementById('drawer');
  if (b && d) {
    var set = function (open) { d.classList.toggle('open', open); b.setAttribute('aria-expanded', open); b.setAttribute('aria-label', open ? 'Chiudi il menu' : 'Apri il menu'); };
    b.addEventListener('click', function () { set(!d.classList.contains('open')); });
    d.addEventListener('click', function (e) { if (e.target.tagName === 'A') set(false); });
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

// ------------------------------------------------------------------ "Trova il tuo abbonamento": gioco a due domande
(function () {
  var box = document.querySelector('[data-picker]');
  var dataEl = document.getElementById('packs-data');
  if (!box || !dataEl) return;
  var data;
  try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }
  var packs = data.packs || [];
  if (!packs.length) return;
  var prices = data.showPrices !== false;
  var ALL = ['functional', 'pilates', 'pt'];
  var WEEKS = 4.33;
  var res = box.querySelector('.pk-res');
  box.hidden = false;

  var euro = function (cents) { var v = cents / 100; return '€' + (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1).replace('.', ',')); };
  var covers = function (p, want) { var t = p.typeIds && p.typeIds.length ? p.typeIds : ALL; return want.every(function (w) { return t.indexOf(w) >= 0; }); };
  var plan = function (p, freq) {
    var perMonth = freq * WEEKS;
    if (p.kind === 'monthly') {
      if (p.weeklyLimit && p.weeklyLimit < freq) return null;
      return { cost: p.priceCents, per: p.priceCents / perMonth };
    }
    var one = p.priceCents / p.lessons;
    return { cost: one * perMonth, per: one };
  };

  function choose(topic, freq) {
    var want = topic === 'all' ? ['functional', 'pilates'] : [topic];
    var best = null;
    packs.forEach(function (p) {
      if (!covers(p, want)) return;
      var pl = plan(p, freq);
      if (!pl) return;
      if (!best || pl.cost < best.pl.cost - 0.5 || (Math.abs(pl.cost - best.pl.cost) <= 0.5 && p.kind === 'monthly' && best.p.kind !== 'monthly')) best = { p: p, pl: pl };
    });
    if (!best) return null;
    var single = null;
    packs.forEach(function (p) { if (p.kind === 'pack' && p.lessons === 1 && covers(p, want)) single = p; });
    best.saving = single && best.p.kind === 'monthly' ? Math.round(single.priceCents * freq * WEEKS - best.pl.cost) : 0;
    return best;
  }

  function why(best, freq) {
    var p = best.p, f = freq >= 4 ? 'almeno 4 volte' : (freq === 1 ? 'una volta' : freq + ' volte');
    if (p.kind === 'monthly') return 'Se vieni ' + f + ' a settimana il mensile è la scelta giusta: un prezzo fisso e ti alleni quanto vuoi' + (p.weeklyLimit ? ', fino a ' + p.weeklyLimit + ' volte a settimana.' : '.');
    if (p.lessons === 1) return 'Per ora basta una lezione alla volta: provi, senza impegno.';
    return 'Se vieni ' + f + ' a settimana un pacchetto di lezioni è la scelta più comoda: le usi quando vuoi, entro ' + p.validityDays + ' giorni.';
  }

  function show(topic, freq) {
    var best = choose(topic, freq);
    document.querySelectorAll('.pass.is-pick').forEach(function (el) { el.classList.remove('is-pick'); });
    res.innerHTML = '';
    if (!best) {
      var np = document.createElement('p'); np.className = 'pk-hint'; np.textContent = 'Per questa combinazione scrivici su WhatsApp: ti consigliamo noi.';
      res.appendChild(np); return;
    }
    var card = document.createElement('div'); card.className = 'pk-card';
    var stamp = document.createElement('span'); stamp.className = 'stamp'; stamp.textContent = 'Fa per te!';
    var h = document.createElement('h3'); h.textContent = best.p.name;
    var t = document.createElement('p'); t.className = 'pk-why'; t.textContent = why(best, freq);
    card.appendChild(stamp); card.appendChild(h); card.appendChild(t);
    if (prices) {
      var pr = document.createElement('p'); pr.className = 'pk-price';
      pr.textContent = euro(best.p.priceCents) + (best.p.kind === 'monthly' ? ' al mese' : '') + ' · circa ' + euro(Math.round(best.pl.per)) + ' a ' + (topic === 'pt' ? 'seduta' : 'lezione');
      card.appendChild(pr);
      if (best.saving > 4) { var sv = document.createElement('p'); sv.className = 'pk-save'; sv.textContent = 'Risparmi circa ' + euro(Math.round(best.saving / 100) * 100) + ' al mese rispetto alle lezioni singole.'; card.appendChild(sv); }
    }
    var row = document.createElement('div'); row.className = 'pk-go';
    var go = document.createElement('a'); go.className = 'btn btn-sm'; go.href = '#prova'; go.setAttribute('data-topic', topic === 'all' ? '' : topic);
    go.innerHTML = '<span>Provalo gratis</span>';
    var see = document.createElement('a'); see.className = 'more'; see.href = '#p-' + best.p.id; see.textContent = 'Guarda la tessera';
    row.appendChild(go); row.appendChild(see); card.appendChild(row);
    res.appendChild(card);
    var el = document.getElementById('p-' + best.p.id);
    if (el) { void el.offsetWidth; el.classList.add('is-pick'); }
  }

  function read() {
    var t = box.querySelector('input[name="pk-topic"]:checked'), f = box.querySelector('input[name="pk-freq"]:checked');
    if (t && f) show(t.value, Number(f.value));
  }
  box.addEventListener('change', read);
})();

// ------------------------------------------------------------------ modulo "prova gratuita"
(function () {
  var form = document.getElementById('trial-form'), done = document.getElementById('trial-done');
  if (!form || !done) return;
  var cfg = window.KUKO_SITE || {};
  var live = !!(cfg.supabaseUrl && cfg.supabaseKey);
  document.querySelectorAll('.tf-demo').forEach(function (el) { el.hidden = live; });

  // i pulsanti "Prova gratis" scelgono già il corso nel modulo
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[data-topic]') : null;
    if (!a) return;
    var v = a.getAttribute('data-topic');
    var r = v ? form.querySelector('input[name="topic"][value="' + v + '"]') : null;
    if (r) {
      r.checked = true; clear('topic');
      var sp = r.nextElementSibling;
      if (sp) { sp.classList.remove('flash'); void sp.offsetWidth; sp.classList.add('flash'); }
    }
  });

  var MSG = {
    topic: 'Scegli che cosa vuoi provare.', name: 'Scrivi nome e cognome.', phone: 'Controlla il numero di telefono.',
    email: 'Controlla l’indirizzo email.', consent: 'Serve il consenso per poterti ricontattare.',
  };
  var errEl = function (k) { return form.querySelector('[data-err="' + k + '"]'); };
  function setErr(k, text) {
    var el = errEl(k); if (!el) return;
    el.textContent = text || ''; el.hidden = !text;
    var inp = form.elements[k];
    if (inp && inp.setAttribute) { if (text) { inp.setAttribute('aria-invalid', 'true'); el.id = el.id || 'err-' + k; inp.setAttribute('aria-describedby', el.id); } else inp.removeAttribute('aria-invalid'); }
  }
  function clear(k) { setErr(k, ''); }
  ['name', 'phone', 'email'].forEach(function (k) { form.elements[k].addEventListener('input', function () { clear(k); setErr('form', ''); }); });
  form.elements.consent.addEventListener('change', function () { clear('consent'); });
  form.addEventListener('change', function (e) { if (e.target.name === 'topic') clear('topic'); });

  var digits = function (s) { return s.replace(/\D/g, ''); };
  function collect() {
    var slots = [];
    form.querySelectorAll('input[name="slots"]:checked').forEach(function (c) { slots.push(c.value); });
    var t = form.querySelector('input[name="topic"]:checked');
    return {
      topic: t ? t.value : '', name: form.elements.name.value.trim().replace(/\s+/g, ' '), phone: form.elements.phone.value.trim(),
      email: form.elements.email.value.trim().toLowerCase(), slots: slots, note: form.elements.note.value.trim().slice(0, 400),
      consent: form.elements.consent.checked, website: form.elements.website.value,
    };
  }
  function validate(p) {
    var bad = [];
    if (!p.topic) bad.push('topic');
    if (p.name.length < 2) bad.push('name');
    if (digits(p.phone).length < 8 || digits(p.phone).length > 15) bad.push('phone');
    if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.email)) bad.push('email');
    if (!p.consent) bad.push('consent');
    ['topic', 'name', 'phone', 'email', 'consent'].forEach(function (k) { setErr(k, bad.indexOf(k) >= 0 ? MSG[k] : ''); });
    return bad;
  }

  function send(p) {
    if (live) {
      return fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/submit_lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseKey, Authorization: 'Bearer ' + cfg.supabaseKey },
        body: JSON.stringify({ p: p }),
      }).then(function (r) {
        if (r.ok) return { ok: true };
        return r.json().catch(function () { return {}; }).then(function (j) { return { ok: false, code: j && j.message }; });
      }, function () { return { ok: false, code: 'network' }; });
    }
    // senza database la richiesta resta su questo dispositivo: la app (stessa origine) la legge e la mostra all'owner
    return new Promise(function (resolve) {
      try {
        if (p.website) return resolve({ ok: true });
        var q = JSON.parse(localStorage.getItem('kuko-site-leads') || '[]');
        q.push({ topic: p.topic, name: p.name, phone: p.phone, email: p.email, slots: p.slots, note: p.note, consent: p.consent, at: new Date().toISOString() });
        localStorage.setItem('kuko-site-leads', JSON.stringify(q.slice(-50)));
        resolve({ ok: true });
      } catch (e) { resolve({ ok: false, code: 'storage' }); }
    });
  }
  var FAIL = {
    invalid: 'Controlla i dati e riprova.',
    busy: 'Troppe richieste in poco tempo: riprova tra qualche minuto, oppure scrivici su WhatsApp.',
  };

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    setErr('form', '');
    var p = collect(), bad = validate(p);
    if (bad.length) {
      var first = bad[0] === 'topic' ? form.querySelector('input[name="topic"]') : form.elements[bad[0]];
      if (first && first.focus) first.focus();
      return;
    }
    var btn = form.querySelector('.tf-send'), label = btn.querySelector('span');
    btn.disabled = true; label.textContent = 'Invio in corso…';
    send(p).then(function (r) {
      btn.disabled = false; label.textContent = 'Richiedi la prova gratuita';
      if (!r.ok) { setErr('form', FAIL[r.code] || 'Non riesco a inviare: controlla la connessione e riprova, oppure scrivici su WhatsApp.'); return; }
      done.querySelector('.done-name').textContent = p.name.split(' ')[0];
      form.hidden = true; done.hidden = false;
      done.focus({ preventScroll: true });
      if (done.scrollIntoView) done.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  });

  var again = document.getElementById('trial-again');
  if (again) again.addEventListener('click', function () {
    form.reset(); form.hidden = false; done.hidden = true;
    ['topic', 'name', 'phone', 'email', 'consent', 'form'].forEach(clear);
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
// Le parti più lunghe (tappe dei corsi, tessere, orari, nutrizione, "come funziona") si aprono a un tocco: meno scorrimento.
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
  $$('.course').forEach(function (c) {
    Fold({ head: function () { return one('.c-sub', c); }, items: function () { return ['.flow', '.tags', '.group'].map(function (s) { return one(s, c); }).filter(Boolean); } });
  });

  // abbonamenti: le tessere si aprono sotto il gioco; la nota sotto resta sempre visibile
  var passes = one('.passes');
  if (passes) Fold({
    label: 'Vedi tutte le tessere e i prezzi', labelOpen: 'Nascondi le tessere', count: passes.children.length + ' tessere', closer: 'Richiudi le tessere',
    items: function () { return [passes]; },
  });

  // orari: un giorno alla volta, si apre quello di oggi (o il primo)
  var dayFolds = [];
  $$('.week .day').forEach(function (d) {
    var n = d.querySelectorAll('.slot').length;
    dayFolds.push(Fold({ open: d.classList.contains('is-today'), count: n + (n === 1 ? ' lezione' : ' lezioni'), head: function () { return one('h3', d); }, items: function () { var u = one('.slots', d); return u ? [u] : []; } }));
  });
  if (dayFolds.length && !dayFolds.some(function (f) { return f.open; })) dayFolds[0].open = true;
  var legend = one('.legend');
  if (legend) legend.addEventListener('click', function () { dayFolds.forEach(function (f) { f.set(true); }); });

  // nutrizione e "come funziona"
  var ben = one('.benefits');
  if (ben) Fold({ label: 'Cosa include la consulenza', labelOpen: 'Nascondi i dettagli', count: ben.children.length + ' punti', items: function () { return [ben]; } });
  $$('#prova .steps, #prenota .steps').forEach(function (st) {
    Fold({ label: 'Come funziona', labelOpen: 'Nascondi i passi', count: st.children.length + ' passi', items: function () { return [st]; } });
  });

  var sync = function () { folds.forEach(function (f) { if (mq.matches) f.mount(); else f.unmount(); }); document.documentElement.classList.toggle('has-folds', mq.matches); };
  sync();
  if (mq.addEventListener) mq.addEventListener('change', sync); else if (mq.addListener) mq.addListener(sync);

  // un link che punta dentro una parte chiusa (per esempio "Guarda la tessera") la apre prima di scorrere
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
