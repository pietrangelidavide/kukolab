import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Data, Pass, Session } from '../src/lib/types';
import { book, cancelBooking, cancelSession } from '../src/lib/rules';
import { emptyData } from '../src/lib/seed';
import { fillSuggestions, pendingMessages, reminderAt } from '../src/lib/messages';
import { HOUR, romeWall } from '../src/lib/time';

const URL = 'https://kukolab.example/app/';
const OPT = { appUrl: URL };
const owner = { role: 'owner' as const, memberId: 'owner' };

// Mercoledì 14 ottobre 2026, 10:00 a Roma
const NOW = romeWall('2026-10-14', '10:00');

function base(): Data {
  const d = emptyData();
  d.templates = [];
  const phone = (i: number) => `333 111 22${String(i).padStart(2, '0')}`;
  d.members = ['owner', 'ana', 'bob', 'cleo', 'dan', 'eve'].map((id, i) => ({
    id, name: id === 'owner' ? 'Valerio' : `${id[0].toUpperCase()}${id.slice(1)} Rossi`, email: id === 'owner' ? '' : `${id}@example.com`, phone: id === 'eve' ? '' : phone(i),
    role: id === 'owner' ? 'owner' : 'client', notes: '', createdAt: new Date(NOW.getTime() - 90 * 24 * HOUR).toISOString(),
  }));
  return d;
}

const pass = (over: Partial<Pass> & Pick<Pass, 'id' | 'memberId'>): Pass => ({
  packId: null, name: 'Pacchetto 10', kind: 'pack', creditsTotal: 10, creditsLeft: 10, startsOn: '2026-09-01', expiresOn: '2026-12-31', typeIds: [], weeklyLimit: null, note: '', createdAt: '2026-09-01T08:00:00Z', ...over,
});

const session = (over: Partial<Session> & Pick<Session, 'id'>): Session => ({
  typeId: 'functional', startsAt: romeWall('2026-10-15', '18:30').toISOString(), duration: 50, capacity: 2, trainer: 'Valerio', status: 'scheduled', templateId: null, note: '', ...over,
});

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};

const kinds = (d: Data, now: Date, kind: string) => pendingMessages(d, now, OPT).filter((m) => m.kind === kind);

test('promemoria: parte la sera prima alle 20, per qualsiasi orario della lezione', () => {
  for (const hm of ['07:00', '12:59', '13:00', '18:30', '20:45']) {
    assert.equal(reminderAt(romeWall('2026-10-15', hm).toISOString()), romeWall('2026-10-14', '20:00').getTime(), hm);
  }
});

test('promemoria: compare all’ora giusta, con il testo e il limite per annullare', () => {
  let d = base();
  d.sessions.push(session({ id: 's1' }), session({ id: 's2', startsAt: romeWall('2026-10-15', '07:00').toISOString() }));
  d.passes.push(pass({ id: 'p1', memberId: 'ana' }));
  d = ok(book(d, { memberId: 'ana', sessionId: 's1', now: NOW, actor: owner })).data;
  d = ok(book(d, { memberId: 'ana', sessionId: 's2', now: NOW, actor: owner })).data;
  assert.equal(kinds(d, NOW, 'reminder').length, 0, 'è presto');
  assert.equal(kinds(d, romeWall('2026-10-14', '19:59'), 'reminder').length, 0);
  const eve = romeWall('2026-10-14', '20:30');
  const a = kinds(d, eve, 'reminder');
  assert.deepEqual(a.map((m) => m.detail), ['Functional domani alle 07:00', 'Functional domani alle 18:30']);
  // lezione delle 7: il limite di 12 ore per annullare (19:00) è già passato
  assert.equal(a[0].text, 'Ciao Ana, ti ricordiamo Functional domani alle 07:00 con Valerio. Se non riesci a venire avvisaci subito qui su WhatsApp.');
  // lezione delle 18:30: c'è ancora tempo fino alle 06:30
  assert.equal(a[1].text, `Ciao Ana, ti ricordiamo Functional domani alle 18:30 con Valerio. Se non riesci a venire, annulla dall’app entro le 06:30 di domani per non perdere la lezione: ${URL}`);
  // il giorno dopo, finché la lezione non è iniziata, è ancora da mandare ("oggi")
  const b = kinds(d, romeWall('2026-10-15', '16:00'), 'reminder');
  assert.deepEqual(b.map((m) => m.detail), ['Functional oggi alle 18:30']);
  // dopo l'inizio non serve più
  assert.equal(kinds(d, romeWall('2026-10-15', '18:40'), 'reminder').length, 0);
  // stesso evento, stessa chiave
  assert.equal(a[1].key, b[0].key);
});

test('promemoria: non per chi ha prenotato dopo l’ora del promemoria, né per le lezioni annullate', () => {
  let d = base();
  d.sessions.push(session({ id: 's1' }));
  d.passes.push(pass({ id: 'p1', memberId: 'ana' }), pass({ id: 'p2', memberId: 'bob' }));
  d = ok(book(d, { memberId: 'ana', sessionId: 's1', now: NOW, actor: owner })).data;
  d = ok(book(d, { memberId: 'bob', sessionId: 's1', now: romeWall('2026-10-15', '16:00'), actor: owner })).data;
  const at = romeWall('2026-10-15', '16:05');
  assert.deepEqual(kinds(d, at, 'reminder').map((m) => m.memberId), ['ana'], 'bob ha prenotato dopo le 20 della sera prima');
  d = ok(cancelSession(d, { sessionId: 's1', now: at })).data;
  assert.equal(kinds(d, at, 'reminder').length, 0);
});

test('posto liberato: chi entra dalla lista d’attesa va avvisato, per 36 ore', () => {
  let d = base();
  d.sessions.push(session({ id: 's1', capacity: 1 }));
  d.passes.push(pass({ id: 'p1', memberId: 'ana' }), pass({ id: 'p2', memberId: 'bob' }));
  d = ok(book(d, { memberId: 'ana', sessionId: 's1', now: NOW, actor: owner })).data;
  d = ok(book(d, { memberId: 'bob', sessionId: 's1', now: new Date(NOW.getTime() + 60000), actor: owner })).data;
  const cancel = new Date(NOW.getTime() + 2 * HOUR);
  const r = ok(cancelBooking(d, { bookingId: d.bookings.find((b) => b.memberId === 'ana')!.id, now: cancel, actor: owner }));
  d = r.data;
  const m = kinds(d, cancel, 'promoted');
  assert.equal(m.length, 1);
  assert.equal(m[0].memberId, 'bob');
  assert.match(m[0].text, /^Ciao Bob, buone notizie: si è liberato un posto e sei dentro a Functional domani alle 18:30\./);
  assert.equal(kinds(d, new Date(cancel.getTime() + 37 * HOUR), 'promoted').length, 0, 'dopo 36 ore non serve più');
  // promosso prima delle 20 della sera prima: avrà anche il promemoria
  assert.equal(kinds(d, romeWall('2026-10-14', '20:05'), 'reminder').filter((x) => x.memberId === 'bob').length, 1);
});

test('posto liberato dopo le 20: il messaggio del posto liberato basta, niente promemoria in più', () => {
  let d = base();
  d.sessions.push(session({ id: 's1', capacity: 1 }));
  d.passes.push(pass({ id: 'p1', memberId: 'ana' }), pass({ id: 'p2', memberId: 'bob' }));
  d = ok(book(d, { memberId: 'ana', sessionId: 's1', now: NOW, actor: owner })).data;
  d = ok(book(d, { memberId: 'bob', sessionId: 's1', now: new Date(NOW.getTime() + 60000), actor: owner })).data;
  const late = romeWall('2026-10-14', '21:00');
  d = ok(cancelBooking(d, { bookingId: d.bookings.find((b) => b.memberId === 'ana')!.id, now: late, actor: owner })).data;
  assert.deepEqual(kinds(d, late, 'promoted').map((m) => m.memberId), ['bob']);
  assert.equal(kinds(d, late, 'reminder').length, 0);
});

test('lezione annullata: avvisa i prenotati e chi era in lista, non chi aveva già annullato da solo', () => {
  let d = base();
  d.sessions.push(session({ id: 's1', capacity: 1 }));
  d.passes.push(pass({ id: 'p1', memberId: 'ana' }), pass({ id: 'p2', memberId: 'bob' }), pass({ id: 'p3', memberId: 'cleo' }), pass({ id: 'p4', memberId: 'dan', kind: 'monthly', creditsTotal: null, creditsLeft: null }));
  d = ok(book(d, { memberId: 'cleo', sessionId: 's1', now: NOW, actor: owner })).data;
  d = ok(cancelBooking(d, { bookingId: d.bookings[0].id, now: new Date(NOW.getTime() + HOUR), actor: owner })).data; // cleo annulla da sola
  d = ok(book(d, { memberId: 'ana', sessionId: 's1', now: new Date(NOW.getTime() + 2 * HOUR), actor: owner })).data;
  d = ok(book(d, { memberId: 'bob', sessionId: 's1', now: new Date(NOW.getTime() + 3 * HOUR), actor: owner })).data; // in lista
  const at = new Date(NOW.getTime() + 5 * HOUR);
  d = ok(cancelSession(d, { sessionId: 's1', now: at })).data;
  const m = kinds(d, at, 'cancelled');
  assert.deepEqual(m.map((x) => x.memberId).sort(), ['ana', 'bob']);
  const ana = m.find((x) => x.memberId === 'ana')!;
  assert.match(ana.text, /Functional di giovedì 15 ottobre alle 18:30 è stato annullato\. La lezione è tornata nel tuo abbonamento\./);
  const bob = m.find((x) => x.memberId === 'bob')!;
  assert.doesNotMatch(bob.text, /tornata nel tuo abbonamento/);
  assert.equal(kinds(d, new Date(at.getTime() + 73 * HOUR), 'cancelled').length, 0);
});

test('abbonamento: in scadenza o quasi finito, ma non se è già rinnovato', () => {
  const d = base();
  d.passes.push(
    pass({ id: 'a', memberId: 'ana', name: 'Mensile Open', kind: 'monthly', creditsTotal: null, creditsLeft: null, expiresOn: '2026-10-17' }),
    pass({ id: 'b', memberId: 'bob', name: 'Functional 10', creditsLeft: 2 }),
    pass({ id: 'c', memberId: 'cleo', name: 'Mensile Open', kind: 'monthly', creditsTotal: null, creditsLeft: null, expiresOn: '2026-10-15' }),
    pass({ id: 'c2', memberId: 'cleo', name: 'Mensile Open', kind: 'monthly', creditsTotal: null, creditsLeft: null, startsOn: '2026-10-16', expiresOn: '2026-11-15' }),
    pass({ id: 'e', memberId: 'dan', name: 'Singola', creditsLeft: 1, expiresOn: '2026-10-14' }),
  );
  const m = kinds(d, NOW, 'expiring');
  assert.deepEqual(m.map((x) => x.memberId).sort(), ['ana', 'bob', 'dan']);
  assert.match(m.find((x) => x.memberId === 'ana')!.text, /“Mensile Open” scade il 17\/10\. Vuoi rinnovarlo\?/);
  assert.match(m.find((x) => x.memberId === 'bob')!.text, /ti restano 2 lezioni nel pacchetto “Functional 10”/);
  assert.match(m.find((x) => x.memberId === 'dan')!.text, /scade oggi/);
});

test('benvenuto: solo iscritti recenti con email che non sono ancora entrati', () => {
  const d = base();
  const at = (days: number) => new Date(NOW.getTime() - days * 24 * HOUR).toISOString();
  d.members.find((m) => m.id === 'ana')!.createdAt = at(3);
  d.members.find((m) => m.id === 'bob')!.createdAt = at(3);
  d.members.find((m) => m.id === 'bob')!.hasAccount = true; // ha già fatto il primo accesso
  d.members.find((m) => m.id === 'cleo')!.createdAt = at(20); // troppo tempo fa
  d.members.find((m) => m.id === 'dan')!.createdAt = at(2);
  d.members.find((m) => m.id === 'dan')!.email = ''; // senza email non può entrare
  const m = kinds(d, NOW, 'welcome');
  assert.deepEqual(m.map((x) => x.memberId), ['ana']);
  assert.match(m[0].text, /benvenuto in KUKO LAB/);
  assert.ok(m[0].text.includes(URL) && m[0].text.includes('ana@example.com'));
});

test('ordine: prima le cose urgenti', () => {
  let d = base();
  d.sessions.push(session({ id: 's1', capacity: 1 }));
  d.passes.push(pass({ id: 'p1', memberId: 'ana' }), pass({ id: 'p2', memberId: 'bob' }), pass({ id: 'x', memberId: 'cleo', expiresOn: '2026-10-16' }));
  d = ok(book(d, { memberId: 'ana', sessionId: 's1', now: NOW, actor: owner })).data;
  d = ok(book(d, { memberId: 'bob', sessionId: 's1', now: new Date(NOW.getTime() + 60000), actor: owner })).data;
  const cancel = new Date(NOW.getTime() + HOUR);
  d = ok(cancelBooking(d, { bookingId: d.bookings.find((b) => b.memberId === 'ana')!.id, now: cancel, actor: owner })).data;
  const all = pendingMessages(d, romeWall('2026-10-15', '16:00'), OPT);
  const order = all.map((m) => m.kind);
  assert.deepEqual(order, [...order].sort((a, b) => ['promoted', 'cancelled', 'reminder', 'expiring', 'welcome'].indexOf(a) - ['promoted', 'cancelled', 'reminder', 'expiring', 'welcome'].indexOf(b)));
});

// ---------------------------------------------------------------------------------------------

function gym(): Data {
  const d = base();
  // quattro giovedì alle 18:30: tre già fatti da Ana (Functional), uno in arrivo con posti liberi
  const thursdays = ['2026-10-08', '2026-10-01', '2026-09-24'];
  thursdays.forEach((day, i) => d.sessions.push(session({ id: `past${i}`, startsAt: romeWall(day, '18:30').toISOString() })));
  d.sessions.push(session({ id: 'next', capacity: 3 }));
  d.passes.push(
    pass({ id: 'pa', memberId: 'ana', creditsLeft: 6, expiresOn: '2026-10-25' }), // scade presto
    pass({ id: 'pb', memberId: 'bob' }),
    pass({ id: 'pc', memberId: 'cleo', typeIds: ['pilates'] }), // non vale per Functional
    pass({ id: 'pd', memberId: 'dan' }),
    pass({ id: 'pe', memberId: 'eve' }),
  );
  thursdays.forEach((_, i) => {
    d.bookings.push({ id: `ba${i}`, sessionId: `past${i}`, memberId: 'ana', status: 'attended', passId: 'pa', createdAt: '2026-09-01T08:00:00Z', cancelledAt: null, promotedAt: null });
  });
  // Dan ha già una lezione che si sovrappone
  d.sessions.push(session({ id: 'clash', typeId: 'pilates', startsAt: romeWall('2026-10-15', '18:45').toISOString() }));
  d.bookings.push({ id: 'bd', sessionId: 'clash', memberId: 'dan', status: 'booked', passId: 'pd', createdAt: '2026-10-10T08:00:00Z', cancelledAt: null, promotedAt: null });
  d.passes.push(pass({ id: 'pf', memberId: 'owner' })); // serve ai test sulle lezioni piene
  return d;
}

test('chi invitare: solo chi può prenotare davvero, prima chi fa quel tipo di allenamento', () => {
  const d = gym();
  const slots = fillSuggestions(d, NOW, OPT);
  const next = slots.find((s) => s.session.id === 'next')!;
  assert.ok(next, 'la lezione di domani ha posti liberi');
  assert.deepEqual(next.candidates.map((c) => c.member.id), ['ana', 'bob']); // cleo: abbonamento non valido; dan: lezione sovrapposta; eve: senza telefono
  const ana = next.candidates[0];
  assert.match(ana.reasons[0], /ha fatto Functional 3 volte negli ultimi 3 mesi/);
  assert.ok(ana.reasons.some((r) => /di solito viene il giovedì a quest’ora/.test(r)));
  assert.ok(ana.reasons.some((r) => /gli restano 6 lezioni e il pacchetto scade il 25\/10/.test(r)));
  assert.match(ana.text, /^Ciao Ana, ti scrivo da KUKO LAB: per Functional domani alle 18:30 ci sono ancora 3 posti liberi\./);
  assert.ok(ana.text.includes(URL));
  assert.equal(ana.key, 'invite:next:ana');
  assert.ok(ana.score > next.candidates[1].score);
});

test('chi invitare: salta chi è già stato invitato e abbassa chi è stato invitato da poco', () => {
  const d = gym();
  const skipped = fillSuggestions(d, NOW, { ...OPT, skip: new Set(['invite:next:ana']) }).find((s) => s.session.id === 'next')!;
  assert.deepEqual(skipped.candidates.map((c) => c.member.id), ['bob']);
  // chi è stato invitato da poco per un'altra lezione perde punti
  const plain = fillSuggestions(d, NOW, OPT).find((s) => s.session.id === 'next')!.candidates.find((c) => c.member.id === 'ana')!;
  const recent = fillSuggestions(d, NOW, { ...OPT, recent: new Set(['ana']) }).find((s) => s.session.id === 'next')!.candidates.find((c) => c.member.id === 'ana')!;
  assert.equal(plain.score - recent.score, 5);
});

test('chi invitare: niente per lezioni piene, annullate, già iniziate o troppo lontane', () => {
  const d = gym();
  d.sessions.find((s) => s.id === 'next')!.capacity = 1;
  d.bookings.push({ id: 'full', sessionId: 'next', memberId: 'owner', status: 'booked', passId: 'pf', createdAt: '2026-10-10T08:00:00Z', cancelledAt: null, promotedAt: null });
  assert.equal(fillSuggestions(d, NOW, OPT).some((s) => s.session.id === 'next'), false, 'piena');
  const d2 = gym();
  d2.sessions.find((s) => s.id === 'next')!.status = 'cancelled';
  assert.equal(fillSuggestions(d2, NOW, OPT).some((s) => s.session.id === 'next'), false, 'annullata');
  assert.equal(fillSuggestions(gym(), romeWall('2026-10-15', '18:30'), OPT).some((s) => s.session.id === 'next'), false, 'iniziata');
  assert.equal(fillSuggestions(gym(), NOW, { ...OPT, hours: 10 }).some((s) => s.session.id === 'next'), false, 'troppo lontana');
});

test('chi invitare: chi salta le lezioni senza avvisare scende in classifica', () => {
  const d = gym();
  d.sessions.push(session({ id: 'ns1', startsAt: romeWall('2026-10-12', '18:30').toISOString() }), session({ id: 'ns2', startsAt: romeWall('2026-10-05', '18:30').toISOString() }));
  for (const [i, sid] of ['ns1', 'ns2'].entries()) d.bookings.push({ id: `nsb${i}`, sessionId: sid, memberId: 'bob', status: 'no_show', passId: 'pb', createdAt: '2026-09-30T08:00:00Z', cancelledAt: null, promotedAt: null });
  const bob = fillSuggestions(d, NOW, OPT).find((s) => s.session.id === 'next')!.candidates.find((c) => c.member.id === 'bob');
  assert.equal(bob, undefined, 'con due assenze la sola assenza di lezioni in programma non basta');
});
