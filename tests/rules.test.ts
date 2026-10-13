import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Data, Pass, Session } from '../src/lib/types';
import { addSession, adjustCredits, assignPass, book, cancelBooking, cancelSession, editSession, generateSessions, markAttendance, newMember, pickPass, promoteWaitlist, removeTemplate, seatsLeft, upsertTemplate, waitlistOf } from '../src/lib/rules';
import { emptyData } from '../src/lib/seed';
import { HOUR, romeWall } from '../src/lib/time';

const OWNER = { role: 'owner' as const, memberId: 'owner' };
const as = (memberId: string) => ({ role: 'client' as const, memberId });
const at = (iso: string) => new Date(iso);

// Mercoledì 14 ottobre 2026, 10:00 a Roma
const NOW = romeWall('2026-10-14', '10:00');

function base(): Data {
  const d = emptyData();
  d.templates = [];
  d.members = ['owner', 'ana', 'bob', 'cleo', 'dan'].map((id) => ({ id, name: id.toUpperCase(), email: '', phone: '', role: id === 'owner' ? 'owner' : 'client', notes: '', createdAt: NOW.toISOString() }));
  return d;
}

function pass(over: Partial<Pass> & Pick<Pass, 'id' | 'memberId'>): Pass {
  return { packId: null, name: 'Pack', kind: 'pack', creditsTotal: 10, creditsLeft: 10, startsOn: '2026-10-01', expiresOn: '2026-12-31', typeIds: [], weeklyLimit: null, note: '', createdAt: '2026-10-01T08:00:00Z', ...over };
}

function session(over: Partial<Session> & Pick<Session, 'id'>): Session {
  return { typeId: 'functional', startsAt: romeWall('2026-10-15', '18:30').toISOString(), duration: 50, capacity: 2, trainer: 'Valerio', status: 'scheduled', templateId: null, note: '', ...over };
}

function withSession(over: Partial<Session> & Pick<Session, 'id'> = { id: 's1' }, passes: Pass[] = []) {
  const d = base();
  d.sessions.push(session(over));
  d.passes.push(...passes);
  return d;
}

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};
const err = (r: { ok: boolean; error?: string }, code: string) => {
  assert.equal(r.ok, false);
  assert.equal(r.error, code);
};

test('prenotazione: consuma un credito e occupa un posto', () => {
  const d = withSession({ id: 's1' }, [pass({ id: 'p1', memberId: 'ana' })]);
  const r = ok(book(d, { memberId: 'ana', sessionId: 's1', now: NOW, actor: as('ana') }));
  assert.equal(r.booking.status, 'booked');
  assert.equal(r.booking.passId, 'p1');
  assert.equal(r.data.passes[0].creditsLeft, 9);
  assert.equal(seatsLeft(r.data, r.data.sessions[0]), 1);
  assert.equal(d.passes[0].creditsLeft, 10, 'i dati di partenza non cambiano');
});

test('senza abbonamento valido non si prenota', () => {
  const d = withSession();
  err(book(d, { memberId: 'ana', sessionId: 's1', now: NOW, actor: as('ana') }), 'no_pass');
  // abbonamento di un altro corso
  const d2 = withSession({ id: 's1' }, [pass({ id: 'p1', memberId: 'ana', typeIds: ['pilates'] })]);
  err(book(d2, { memberId: 'ana', sessionId: 's1', now: NOW, actor: as('ana') }), 'no_pass');
  // scaduto prima della lezione
  const d3 = withSession({ id: 's1' }, [pass({ id: 'p1', memberId: 'ana', expiresOn: '2026-10-14' })]);
  err(book(d3, { memberId: 'ana', sessionId: 's1', now: NOW, actor: as('ana') }), 'no_pass');
  // non ancora iniziato
  const d4 = withSession({ id: 's1' }, [pass({ id: 'p1', memberId: 'ana', startsOn: '2026-10-16' })]);
  err(book(d4, { memberId: 'ana', sessionId: 's1', now: NOW, actor: as('ana') }), 'no_pass');
  // crediti finiti
  const d5 = withSession({ id: 's1' }, [pass({ id: 'p1', memberId: 'ana', creditsLeft: 0 })]);
  err(book(d5, { memberId: 'ana', sessionId: 's1', now: NOW, actor: as('ana') }), 'no_pass');
});

test('si usa prima l’abbonamento che scade prima', () => {
  const d = withSession({ id: 's1' }, [
    pass({ id: 'lungo', memberId: 'ana', expiresOn: '2026-12-31' }),
    pass({ id: 'corto', memberId: 'ana', expiresOn: '2026-10-31' }),
  ]);
  assert.equal(pickPass(d, 'ana', d.sessions[0])?.id, 'corto');
});

test('un cliente non può prenotare per un altro', () => {
  const d = withSession({ id: 's1' }, [pass({ id: 'p1', memberId: 'ana' })]);
  err(book(d, { memberId: 'ana', sessionId: 's1', now: NOW, actor: as('bob') }), 'forbidden');
});

test('doppia prenotazione e lezioni sovrapposte', () => {
  const d0 = withSession({ id: 's1' }, [pass({ id: 'p1', memberId: 'ana' })]);
  d0.sessions.push(session({ id: 's2', startsAt: romeWall('2026-10-15', '19:00').toISOString(), typeId: 'pilates' })); // si accavalla con le 18:30 (50')
  d0.sessions.push(session({ id: 's3', startsAt: romeWall('2026-10-15', '19:20').toISOString() })); // inizia dopo la fine
  const d1 = ok(book(d0, { memberId: 'ana', sessionId: 's1', now: NOW, actor: as('ana') })).data;
  err(book(d1, { memberId: 'ana', sessionId: 's1', now: NOW, actor: as('ana') }), 'already_booked');
  err(book(d1, { memberId: 'ana', sessionId: 's2', now: NOW, actor: as('ana') }), 'overlap');
  ok(book(d1, { memberId: 'ana', sessionId: 's3', now: NOW, actor: as('ana') }));
});

test('finestra di prenotazione: chiusura e orizzonte', () => {
  const d = withSession({ id: 's1' }, [pass({ id: 'p1', memberId: 'ana' })]);
  const start = new Date(d.sessions[0].startsAt).getTime();
  err(book(d, { memberId: 'ana', sessionId: 's1', now: new Date(start - 10 * 60000), actor: as('ana') }), 'booking_closed'); // chiude 15' prima
  ok(book(d, { memberId: 'ana', sessionId: 's1', now: new Date(start - 16 * 60000), actor: as('ana') }));
  err(book(d, { memberId: 'ana', sessionId: 's1', now: new Date(start - 15 * 24 * HOUR), actor: as('ana') }), 'too_far');
  // l'owner può aggiungere anche a prenotazioni chiuse
  ok(book(d, { memberId: 'ana', sessionId: 's1', now: new Date(start - 5 * 60000), actor: OWNER }));
});

test('lezione annullata: non si prenota', () => {
  const d = withSession({ id: 's1', status: 'cancelled' }, [pass({ id: 'p1', memberId: 'ana' })]);
  err(book(d, { memberId: 'ana', sessionId: 's1', now: NOW, actor: as('ana') }), 'session_cancelled');
});

test('lezione piena: lista d’attesa senza addebito, poi promozione quando qualcuno annulla', () => {
  let d = withSession({ id: 's1', capacity: 2 }, ['ana', 'bob', 'cleo', 'dan'].map((m) => pass({ id: `p_${m}`, memberId: m })));
  d = ok(book(d, { memberId: 'ana', sessionId: 's1', now: at('2026-10-14T09:00:00Z'), actor: as('ana') })).data;
  d = ok(book(d, { memberId: 'bob', sessionId: 's1', now: at('2026-10-14T09:01:00Z'), actor: as('bob') })).data;
  const c = ok(book(d, { memberId: 'cleo', sessionId: 's1', now: at('2026-10-14T09:02:00Z'), actor: as('cleo') }));
  assert.equal(c.booking.status, 'waitlist');
  assert.equal(c.booking.passId, null);
  d = c.data;
  d = ok(book(d, { memberId: 'dan', sessionId: 's1', now: at('2026-10-14T09:03:00Z'), actor: as('dan') })).data;
  assert.deepEqual(waitlistOf(d, 's1').map((b) => b.memberId), ['cleo', 'dan']);
  assert.equal(d.passes.find((p) => p.id === 'p_cleo')!.creditsLeft, 10, 'in lista non si paga');
  err(book(d, { memberId: 'cleo', sessionId: 's1', now: NOW, actor: as('cleo') }), 'on_waitlist');

  const idAna = d.bookings.find((b) => b.memberId === 'ana')!.id;
  const x = ok(cancelBooking(d, { bookingId: idAna, now: NOW, actor: as('ana') })); // ben prima delle 12 ore
  assert.equal(x.status, 'cancelled');
  assert.equal(x.refunded, true);
  assert.equal(x.promoted, 1);
  d = x.data;
  const cleo = d.bookings.find((b) => b.memberId === 'cleo')!;
  assert.equal(cleo.status, 'booked');
  assert.equal(cleo.passId, 'p_cleo');
  assert.equal(d.passes.find((p) => p.id === 'p_cleo')!.creditsLeft, 9);
  assert.equal(d.passes.find((p) => p.id === 'p_ana')!.creditsLeft, 10, 'rimborsato');
  assert.equal(d.bookings.find((b) => b.memberId === 'dan')!.status, 'waitlist');
  assert.equal(d.notices.filter((n) => n.memberId === 'cleo' && n.kind === 'promoted').length, 1);
});

test('in lista d’attesa si salta chi non ha più un abbonamento valido', () => {
  let d = withSession({ id: 's1', capacity: 1 }, [pass({ id: 'pa', memberId: 'ana' }), pass({ id: 'pb', memberId: 'bob' }), pass({ id: 'pc', memberId: 'cleo' })]);
  d = ok(book(d, { memberId: 'ana', sessionId: 's1', now: at('2026-10-14T09:00:00Z'), actor: as('ana') })).data;
  d = ok(book(d, { memberId: 'bob', sessionId: 's1', now: at('2026-10-14T09:01:00Z'), actor: as('bob') })).data; // waitlist
  d = ok(book(d, { memberId: 'cleo', sessionId: 's1', now: at('2026-10-14T09:02:00Z'), actor: as('cleo') })).data; // waitlist
  d.passes.find((p) => p.id === 'pb')!.creditsLeft = 0; // bob nel frattempo ha finito le lezioni
  const x = ok(cancelBooking(d, { bookingId: d.bookings[0].id, now: NOW, actor: as('ana') }));
  assert.equal(x.data.bookings.find((b) => b.memberId === 'bob')!.status, 'waitlist');
  assert.equal(x.data.bookings.find((b) => b.memberId === 'cleo')!.status, 'booked');
});

test('annullo tardivo: la lezione si perde, il posto si libera comunque', () => {
  let d = withSession({ id: 's1', capacity: 1 }, [pass({ id: 'pa', memberId: 'ana' }), pass({ id: 'pb', memberId: 'bob' })]);
  d = ok(book(d, { memberId: 'ana', sessionId: 's1', now: at('2026-10-14T09:00:00Z'), actor: as('ana') })).data;
  d = ok(book(d, { memberId: 'bob', sessionId: 's1', now: at('2026-10-14T09:01:00Z'), actor: as('bob') })).data;
  const start = new Date(d.sessions[0].startsAt).getTime();
  const x = ok(cancelBooking(d, { bookingId: d.bookings[0].id, now: new Date(start - 11 * HOUR), actor: as('ana') }));
  assert.equal(x.status, 'late_cancelled');
  assert.equal(x.refunded, false);
  assert.equal(x.data.passes.find((p) => p.id === 'pa')!.creditsLeft, 9);
  assert.equal(x.data.bookings.find((b) => b.memberId === 'bob')!.status, 'booked', 'chi era in lista entra comunque');
  // al limite esatto delle 12 ore è ancora gratis
  const y = ok(cancelBooking(d, { bookingId: d.bookings[0].id, now: new Date(start - 12 * HOUR), actor: as('ana') }));
  assert.equal(y.status, 'cancelled');
});

test('annullo: solo il proprietario, solo prima dell’inizio, solo se attiva', () => {
  const d0 = withSession({ id: 's1' }, [pass({ id: 'pa', memberId: 'ana' })]);
  const d = ok(book(d0, { memberId: 'ana', sessionId: 's1', now: NOW, actor: as('ana') })).data;
  const id = d.bookings[0].id;
  err(cancelBooking(d, { bookingId: id, now: NOW, actor: as('bob') }), 'forbidden');
  err(cancelBooking(d, { bookingId: id, now: new Date(new Date(d.sessions[0].startsAt).getTime() + 1000), actor: as('ana') }), 'session_started');
  err(cancelBooking(d, { bookingId: 'nope', now: NOW, actor: as('ana') }), 'booking_not_found');
  const c = ok(cancelBooking(d, { bookingId: id, now: NOW, actor: as('ana') })).data;
  err(cancelBooking(c, { bookingId: id, now: NOW, actor: as('ana') }), 'not_cancellable');
});

test('annullare dalla lista d’attesa non costa nulla', () => {
  let d = withSession({ id: 's1', capacity: 1 }, [pass({ id: 'pa', memberId: 'ana' }), pass({ id: 'pb', memberId: 'bob' })]);
  d = ok(book(d, { memberId: 'ana', sessionId: 's1', now: at('2026-10-14T09:00:00Z'), actor: as('ana') })).data;
  d = ok(book(d, { memberId: 'bob', sessionId: 's1', now: at('2026-10-14T09:01:00Z'), actor: as('bob') })).data;
  const start = new Date(d.sessions[0].startsAt).getTime();
  const x = ok(cancelBooking(d, { bookingId: d.bookings[1].id, now: new Date(start - 60000), actor: as('bob') }));
  assert.equal(x.status, 'cancelled');
  assert.equal(x.refunded, false);
  assert.equal(x.data.passes.find((p) => p.id === 'pb')!.creditsLeft, 10);
});

test('mensile con limite settimanale', () => {
  const m = pass({ id: 'pm', memberId: 'ana', kind: 'monthly', creditsTotal: null, creditsLeft: null, weeklyLimit: 2 });
  let d = withSession({ id: 's1', startsAt: romeWall('2026-10-12', '18:30').toISOString() }, [m]); // lunedì
  d.sessions.push(session({ id: 's2', startsAt: romeWall('2026-10-14', '18:30').toISOString() })); // mercoledì stessa settimana
  d.sessions.push(session({ id: 's3', startsAt: romeWall('2026-10-16', '18:30').toISOString() })); // venerdì stessa settimana
  d.sessions.push(session({ id: 's4', startsAt: romeWall('2026-10-19', '18:30').toISOString() })); // lunedì dopo
  const now = romeWall('2026-10-10', '10:00');
  const book1 = (s: string) => book(d, { memberId: 'ana', sessionId: s, now, actor: OWNER });
  d = ok(book1('s1')).data;
  d = ok(book1('s2')).data;
  err(book1('s3'), 'no_pass');
  d = ok(book1('s4')).data; // un'altra settimana: libera
  assert.equal(d.passes[0].creditsLeft, null, 'il mensile non scala crediti');
  // annullo in tempo: il posto settimanale torna disponibile
  const x = ok(cancelBooking(d, { bookingId: d.bookings[0].id, now, actor: as('ana') }));
  ok(book(x.data, { memberId: 'ana', sessionId: 's3', now, actor: OWNER }));
  // annullo tardivo: conta ancora nel limite
  const y = ok(cancelBooking(d, { bookingId: d.bookings[0].id, now: romeWall('2026-10-12', '12:00'), actor: as('ana') }));
  assert.equal(y.status, 'late_cancelled');
  err(book(y.data, { memberId: 'ana', sessionId: 's3', now: romeWall('2026-10-12', '13:00'), actor: OWNER }), 'no_pass');
});

test('annullo di una lezione da parte dell’owner: rimborsi e avvisi', () => {
  let d = withSession({ id: 's1', capacity: 1 }, [pass({ id: 'pa', memberId: 'ana' }), pass({ id: 'pb', memberId: 'bob' })]);
  d = ok(book(d, { memberId: 'ana', sessionId: 's1', now: at('2026-10-14T09:00:00Z'), actor: as('ana') })).data;
  d = ok(book(d, { memberId: 'bob', sessionId: 's1', now: at('2026-10-14T09:01:00Z'), actor: as('bob') })).data;
  const x = ok(cancelSession(d, { sessionId: 's1', now: NOW }));
  assert.equal(x.affected, 2);
  assert.equal(x.data.sessions[0].status, 'cancelled');
  assert.equal(x.data.passes.find((p) => p.id === 'pa')!.creditsLeft, 10);
  assert.equal(x.data.notices.filter((n) => n.kind === 'session_cancelled').length, 2);
  assert.ok(x.data.bookings.every((b) => b.status === 'cancelled'));
  err(cancelSession(x.data, { sessionId: 's1', now: NOW }), 'session_cancelled');
});

test('presenze e correzioni dell’owner', () => {
  const d0 = withSession({ id: 's1' }, [pass({ id: 'pa', memberId: 'ana' })]);
  const d = ok(book(d0, { memberId: 'ana', sessionId: 's1', now: NOW, actor: as('ana') })).data;
  const a = ok(markAttendance(d, { bookingId: d.bookings[0].id, status: 'no_show' })).data;
  assert.equal(a.bookings[0].status, 'no_show');
  assert.equal(a.passes[0].creditsLeft, 9, 'il no-show non rimborsa');
  assert.equal(seatsLeft(a, a.sessions[0]), 1, 'ma il posto resta occupato');
  const c = ok(adjustCredits(a, { passId: 'pa', delta: 2 })).data;
  assert.equal(c.passes[0].creditsLeft, 11);
  assert.equal(c.passes[0].creditsTotal, 11);
  assert.equal(ok(adjustCredits(c, { passId: 'pa', delta: -50 })).data.passes[0].creditsLeft, 0);
});

test('owner: aggiunta senza abbonamento solo se esplicita', () => {
  const d = withSession();
  err(book(d, { memberId: 'ana', sessionId: 's1', now: NOW, actor: OWNER }), 'no_pass');
  const r = ok(book(d, { memberId: 'ana', sessionId: 's1', now: NOW, actor: OWNER, allowNoPass: true }));
  assert.equal(r.booking.passId, null);
});

test('modifica lezione: più posti scala la lista, meno posti dei prenotati no', () => {
  let d = withSession({ id: 's1', capacity: 1 }, [pass({ id: 'pa', memberId: 'ana' }), pass({ id: 'pb', memberId: 'bob' })]);
  d = ok(book(d, { memberId: 'ana', sessionId: 's1', now: at('2026-10-14T09:00:00Z'), actor: as('ana') })).data;
  d = ok(book(d, { memberId: 'bob', sessionId: 's1', now: at('2026-10-14T09:01:00Z'), actor: as('bob') })).data;
  err(editSession(d, { sessionId: 's1', now: NOW, patch: { capacity: 0 } }), 'invalid');
  const x = ok(editSession(d, { sessionId: 's1', now: NOW, patch: { capacity: 2 } }));
  assert.equal(x.promoted, 1);
  assert.equal(x.data.bookings.find((b) => b.memberId === 'bob')!.status, 'booked');
  err(editSession(x.data, { sessionId: 's1', now: NOW, patch: { capacity: 1 } }), 'invalid');
  const moved = ok(editSession(x.data, { sessionId: 's1', now: NOW, patch: { startsAt: romeWall('2026-10-15', '19:30').toISOString() } }));
  assert.equal(moved.data.notices.filter((n) => n.kind === 'info').length, 2);
  assert.equal(ok(promoteWaitlist(x.data, 's1', NOW)).promoted, 0);
});

test('vendita di un pacchetto: crediti e scadenza', () => {
  const d = base();
  const r = ok(assignPass(d, { memberId: 'ana', packId: 'pk_fun10', startsOn: '2026-10-14', now: NOW }));
  assert.equal(r.pass.creditsLeft, 10);
  assert.equal(r.pass.expiresOn, '2027-01-11'); // 90 giorni, primo e ultimo inclusi
  assert.deepEqual(r.pass.typeIds, ['functional']);
  const m = ok(assignPass(d, { memberId: 'ana', packId: 'pk_mfun', startsOn: '2026-10-14', now: NOW }));
  assert.equal(m.pass.creditsLeft, null);
  assert.equal(m.pass.expiresOn, '2026-11-12');
  assert.equal(m.pass.weeklyLimit, 3);
  err(assignPass(d, { memberId: 'zzz', packId: 'pk_fun10', startsOn: '2026-10-14', now: NOW }), 'member_not_found');
  err(assignPass(d, { memberId: 'ana', packId: 'zzz', startsOn: '2026-10-14', now: NOW }), 'pack_not_found');
});

test('orario settimanale → lezioni, senza duplicati e con ora legale', () => {
  const d = base();
  d.templates = [
    { id: 't1', typeId: 'functional', weekday: 3, time: '18:30', capacity: 8, duration: 50, trainer: 'V', active: true },
    { id: 't2', typeId: 'pilates', weekday: 7, time: '10:00', capacity: 4, duration: 50, trainer: 'V', active: false },
  ];
  const g1 = generateSessions(d, { from: '2026-10-19', to: '2026-11-01' });
  assert.equal(g1.created, 2); // mercoledì 21 e 28 ottobre
  assert.deepEqual(g1.data.sessions.map((s) => s.startsAt), ['2026-10-21T16:30:00.000Z', '2026-10-28T17:30:00.000Z']); // il 25/10 torna l'ora solare
  const g2 = generateSessions(g1.data, { from: '2026-10-19', to: '2026-11-08' });
  assert.equal(g2.created, 1); // solo il 4 novembre, il resto c'è già
  // una lezione annullata non viene ricreata
  const g3 = structuredClone(g2.data);
  g3.sessions[0].status = 'cancelled';
  assert.equal(generateSessions(g3, { from: '2026-10-19', to: '2026-11-08' }).created, 0);
});

test('lezione singola e nuovo iscritto', () => {
  const d = base();
  const s = ok(addSession(d, { typeId: 'pt', startsAt: '2026-10-20T08:00:00Z', capacity: 1, duration: 60, trainer: 'Valerio' }));
  assert.equal(s.data.sessions.length, 1);
  err(addSession(d, { typeId: 'boh', startsAt: '2026-10-20T08:00:00Z', capacity: 1, duration: 60, trainer: '' }), 'invalid');
  err(addSession(d, { typeId: 'pt', startsAt: 'non una data', capacity: 1, duration: 60, trainer: '' }), 'invalid');
  const m = ok(newMember(d, { name: '  Nuova Persona ', email: ' A@B.IT ', now: NOW }));
  assert.equal(m.member.name, 'Nuova Persona');
  assert.equal(m.member.email, 'a@b.it');
  err(newMember(d, { name: '   ', now: NOW }), 'invalid');
});

test('senza lista d’attesa, lezione piena = errore', () => {
  let d = withSession({ id: 's1', capacity: 1 }, [pass({ id: 'pa', memberId: 'ana' }), pass({ id: 'pb', memberId: 'bob' })]);
  d.settings.waitlistEnabled = false;
  d = ok(book(d, { memberId: 'ana', sessionId: 's1', now: NOW, actor: as('ana') })).data;
  err(book(d, { memberId: 'bob', sessionId: 's1', now: NOW, actor: as('bob') }), 'full');
});

test('orario settimanale: modifica e cancellazione toccano solo le lezioni future senza prenotazioni', () => {
  const d0 = base();
  d0.templates = [{ id: 't1', typeId: 'functional', weekday: 3, time: '18:30', capacity: 8, duration: 50, trainer: 'V', active: true }];
  let d = generateSessions(d0, { from: '2026-10-14', to: '2026-11-04' }).data; // 14, 21, 28 ottobre e 4 novembre
  assert.equal(d.sessions.length, 4);
  d.passes.push(pass({ id: 'pa', memberId: 'ana' }));
  const second = d.sessions[1];
  d = ok(book(d, { memberId: 'ana', sessionId: second.id, now: NOW, actor: as('ana') })).data;
  // cambio orario: la lezione con prenotazione resta com'è, le altre vengono rifatte alle 19:30
  const r = ok(upsertTemplate(d, { template: { ...d.templates[0], time: '19:30' }, now: NOW, until: '2026-11-04' }));
  const times = r.data.sessions.map((s) => s.startsAt.slice(0, 16)).sort();
  assert.equal(r.removed, 3);
  assert.equal(r.created, 4); // 14, 21, 28 ottobre e 4 novembre alle 19:30
  assert.equal(r.data.sessions.filter((s) => s.id === second.id).length, 1);
  assert.equal(times.length, 5, 'quella con prenotazione + quattro nuove');
  // disattivare: non si ricrea nulla
  const off = ok(upsertTemplate(r.data, { template: { ...r.data.templates[0], active: false }, now: NOW, until: '2026-11-04' }));
  assert.equal(off.created, 0);
  assert.equal(off.data.sessions.length, 1);
  // cancellare la riga
  const del = ok(removeTemplate(d, { templateId: 't1', now: NOW }));
  assert.equal(del.data.templates.length, 0);
  assert.equal(del.data.sessions.length, 1);
  err(removeTemplate(d, { templateId: 'zzz', now: NOW }), 'invalid');
  err(upsertTemplate(d, { template: { ...d.templates[0], time: '9.30' }, now: NOW, until: '2026-11-04' }), 'invalid');
});
