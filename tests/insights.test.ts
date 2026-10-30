import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Booking, BookingStatus, Data, Member, Pass, Session } from '../src/lib/types';
import { emptyData } from '../src/lib/seed';
import { activeClients, attendanceToMark, dormantMembers, lowFillSoon, trainerStats, unlinkedInstructors, waitlistSoon } from '../src/lib/insights';
import { AREAS, OWNER_ROUTES, activeTab, areaOf } from '../src/lib/areas';
import { romeWall } from '../src/lib/time';

// mercoledì 14 ottobre 2026, ore 12
const NOW = romeWall('2026-10-14', '12:00');
const member = (id: string, name: string, role: Member['role'] = 'client'): Member => ({ id, name, email: `${id}@example.com`, phone: '', role, notes: '', createdAt: '2026-01-01T10:00:00.000Z' });
const sess = (id: string, day: string, hm: string, o: Partial<Session> = {}): Session => ({ id, typeId: 'functional', startsAt: romeWall(day, hm).toISOString(), duration: 50, capacity: 10, trainer: 'Valerio', status: 'scheduled', templateId: null, note: '', ...o });
const book = (id: string, sessionId: string, memberId: string, status: BookingStatus = 'booked'): Booking => ({ id, sessionId, memberId, status, passId: null, createdAt: '2026-10-01T10:00:00.000Z', cancelledAt: null, promotedAt: null });
const pass = (id: string, memberId: string, o: Partial<Pass> = {}): Pass => ({ id, memberId, packId: null, name: 'Functional 10', kind: 'pack', creditsTotal: 10, creditsLeft: 6, startsOn: '2026-08-01', expiresOn: '2026-12-31', typeIds: [], weeklyLimit: null, note: '', createdAt: '2026-08-01T10:00:00.000Z', ...o });

function base(): Data {
  const d = emptyData();
  d.members = [member('ana', 'Ana Rossi'), member('bob', 'Bob Verdi'), member('cle', 'Cle Neri'), member('val', 'Valerio Cuscianna', 'trainer')];
  return d;
}

test('presenze da segnare: lezioni finite con prenotazioni ancora "prenotato", le più recenti per prime', () => {
  const d = base();
  d.sessions = [
    sess('s1', '2026-10-13', '18:00'), // ieri, finita
    sess('s2', '2026-10-14', '09:00'), // stamattina, finita
    sess('s3', '2026-10-14', '18:00'), // stasera: non ancora finita
    sess('s4', '2026-10-01', '18:00'), // troppo vecchia (oltre 7 giorni)
    sess('s5', '2026-10-13', '10:00', { status: 'cancelled' }),
  ];
  d.bookings = [book('b1', 's1', 'ana'), book('b2', 's1', 'bob', 'attended'), book('b3', 's2', 'ana'), book('b4', 's2', 'bob'), book('b5', 's3', 'ana'), book('b6', 's4', 'ana'), book('b7', 's5', 'ana')];
  const r = attendanceToMark(d, NOW);
  assert.deepEqual(r.map((x) => [x.session.id, x.unmarked]), [['s2', 2], ['s1', 1]]);
  d.bookings = d.bookings.map((b) => (b.sessionId === 's2' ? { ...b, status: 'attended' as const } : b));
  assert.deepEqual(attendanceToMark(d, NOW).map((x) => x.session.id), ['s1']);
});

test('lezioni quasi vuote nei prossimi giorni', () => {
  const d = base();
  d.sessions = [sess('a', '2026-10-15', '18:00'), sess('b', '2026-10-16', '18:00'), sess('c', '2026-10-20', '18:00'), sess('d', '2026-10-14', '08:00'), sess('e', '2026-10-15', '19:00', { status: 'cancelled' })];
  d.bookings = [book('1', 'a', 'ana'), book('2', 'a', 'bob'), ...['x1', 'x2', 'x3', 'x4', 'x5'].map((m, i) => book(`k${i}`, 'b', m))];
  const r = lowFillSoon(d, NOW, 3, 0.3);
  // a: 2/10 = 20% (poche), b: 5/10 = 50% (ok), c: oltre i 3 giorni, d: già iniziata, e: annullata
  assert.deepEqual(r.map((x) => [x.session.id, x.booked]), [['a', 2]]);
});

test('iscritti fermi: abbonamento valido, nessuna lezione da 30 giorni e niente prenotato più avanti', () => {
  const d = base();
  d.passes = [pass('p1', 'ana'), pass('p2', 'bob'), pass('p3', 'cle', { startsOn: '2026-10-10' })];
  d.sessions = [sess('old', '2026-08-20', '18:00'), sess('recent', '2026-10-05', '18:00'), sess('future', '2026-10-20', '18:00')];
  d.bookings = [book('1', 'old', 'ana', 'attended'), book('2', 'recent', 'bob', 'attended'), book('3', 'future', 'bob')];
  const r = dormantMembers(d, NOW, 30);
  // Ana: ultima lezione il 20/08 → ferma da 55 giorni. Bob: è venuto il 5/10 e ha prenotato per il 20/10. Cle: abbonamento iniziato da pochi giorni.
  assert.deepEqual(r.map((x) => [x.member.id, x.lastOn, x.daysIdle]), [['ana', '2026-08-20', 55]]);
  // chi non ha mai prenotato conta dall'inizio dell'abbonamento
  d.passes = [pass('p9', 'cle', { startsOn: '2026-08-01' })];
  assert.deepEqual(dormantMembers(d, NOW, 30).map((x) => [x.member.id, x.lastOn]), [['cle', null]]);
  // senza abbonamento valido non si segue
  d.passes = [pass('p9', 'cle', { startsOn: '2026-08-01', expiresOn: '2026-09-01' })];
  assert.equal(dormantMembers(d, NOW, 30).length, 0);
});

test('liste d\'attesa dei prossimi giorni', () => {
  const d = base();
  d.sessions = [sess('a', '2026-10-15', '18:00'), sess('b', '2026-10-16', '18:00'), sess('c', '2026-10-30', '18:00'), sess('d', '2026-10-13', '18:00')];
  d.bookings = [book('1', 'b', 'ana', 'waitlist'), book('2', 'c', 'ana', 'waitlist'), book('3', 'd', 'ana', 'waitlist'), book('4', 'a', 'ana')];
  assert.deepEqual(waitlistSoon(d, NOW, 7).map((x) => x.id), ['b']); // c è oltre i 7 giorni, d è già passata, a non ha attesa
});

test('iscritti con abbonamento valido', () => {
  const d = base();
  d.passes = [pass('p1', 'ana'), pass('p2', 'bob', { expiresOn: '2026-09-01' }), pass('p3', 'ana', { name: 'Secondo' })];
  assert.equal(activeClients(d, NOW), 1);
});

test('numeri per trainer: le lezioni col nome del Trainer vanno al suo account, le altre restano col nome scritto', () => {
  const d = base();
  d.sessions = [
    sess('t1', '2026-10-12', '18:00', { trainer: 'Valerio' }),
    sess('t2', '2026-10-13', '18:00', { trainer: 'valerio cuscianna', capacity: 4 }),
    sess('t3', '2026-10-13', '19:00', { trainer: 'Giulia' }),
    sess('t4', '2026-10-15', '19:00', { trainer: 'Giulia' }), // futura: non conta
  ];
  d.bookings = [book('1', 't1', 'ana', 'attended'), book('2', 't1', 'bob', 'no_show'), book('3', 't2', 'ana', 'attended'), book('4', 't3', 'cle', 'attended')];
  const r = trainerStats(d, NOW, 8);
  assert.deepEqual(r.map((x) => [x.name, x.memberId, x.sessions, x.booked, x.seats, x.attended, x.noShow]), [['Valerio Cuscianna', 'val', 2, 3, 14, 2, 1], ['Giulia', null, 1, 1, 10, 1, 0]]);
  assert.equal(Math.round(r[0].fill * 100), 21);
});

test('istruttori senza account Trainer, con quante lezioni nei prossimi giorni', () => {
  const d = base();
  d.sessions = [sess('1', '2026-10-15', '18:00', { trainer: 'Valerio' }), sess('2', '2026-10-16', '18:00', { trainer: 'Giulia' }), sess('3', '2026-10-17', '18:00', { trainer: ' giulia ' }), sess('4', '2026-10-17', '10:00', { trainer: '' }), sess('5', '2026-11-30', '10:00', { trainer: 'Paolo' })];
  assert.deepEqual(unlinkedInstructors(d, NOW, 14), [{ name: 'Giulia', lessons: 2 }]);
});

test('aree del gestionale: ogni indirizzo appartiene a una sola area e i vecchi indirizzi restano validi', () => {
  const owned = AREAS.flatMap((a) => a.owns);
  assert.equal(new Set(owned).size, owned.length);
  // la Shell controlla il primo segmento dell'indirizzo: /orari/modelli e /iscritti/abc passano perché lo sono /orari e /iscritti
  for (const p of ['/oggi', '/orari/modelli', '/iscritti/abc', '/richieste', '/pacchetti', '/report', '/messaggi', '/incassi', '/prenotazioni/regole', '/impostazioni']) assert.ok(OWNER_ROUTES.includes('/' + p.split('/')[1]), p);
  assert.equal(areaOf('/iscritti/abc')?.id, 'clienti');
  assert.equal(areaOf('/orari/modelli')?.id, 'prenotazioni');
  assert.equal(areaOf('/incassi')?.id, 'fatturazione');
  assert.equal(areaOf('/pacchetti')?.id, 'fatturazione');
  assert.equal(areaOf('/dipendenti')?.id, 'dipendenti');
  assert.equal(areaOf('/impostazioni'), undefined);
  assert.equal(areaOf('/orarietto'), undefined); // "/orari" non è un prefisso di testo ma di percorso
  const pren = AREAS.find((a) => a.id === 'prenotazioni')!;
  assert.equal(activeTab(pren, '/orari')?.label, 'Calendario');
  assert.equal(activeTab(pren, '/orari/modelli')?.label, 'Orario');
  assert.equal(activeTab(pren, '/prenotazioni/regole')?.label, 'Regole');
  assert.equal(activeTab(AREAS.find((a) => a.id === 'clienti')!, '/iscritti/xyz')?.label, 'Iscritti');
  for (const a of AREAS) for (const t of a.tabs) assert.ok(a.owns.some((o) => t.to === o || t.to.startsWith(`${o}/`)), `${a.id} ${t.to}`);
});
