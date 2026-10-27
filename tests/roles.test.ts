import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Data, Member, Pass } from '../src/lib/types';
import { can, homePath, isDesk, teaches } from '../src/lib/access';
import { addPayment, byMonth, euroField, parseEuro, paymentsCsv, paymentsOn, totals, voidPayment } from '../src/lib/payments';
import { addTeamMember, removeTeamMember, teamOf } from '../src/lib/team';
import { assignPass, book, cancelBooking } from '../src/lib/rules';
import { demoData, DEMO_STAFF_ID, DEMO_TRAINER_ID, demoTeam } from '../src/lib/seed';
import { emptyData } from '../src/lib/seed';
import { LocalApi } from '../src/lib/local';
import { romeDay, romeWall } from '../src/lib/time';

const NOW = romeWall('2026-10-14', '10:00');
const OWNER = { role: 'owner' as const, memberId: 'owner' };
const STAFF = { role: 'staff' as const, memberId: 'desk' };

const member = (id: string, role: Member['role'], name = id.toUpperCase(), email = `${id}@example.com`): Member => ({ id, name, email, phone: '', role, notes: '', createdAt: NOW.toISOString() });

function base(): Data {
  const d = emptyData();
  d.templates = [];
  d.members = [member('owner', 'owner'), member('desk', 'staff', 'Segreteria'), member('marco', 'trainer', 'Marco Rossi'), member('ana', 'client'), member('bob', 'client')];
  d.packs = [
    { id: 'pk1', name: 'Functional 10', kind: 'pack', lessons: 10, validityDays: 90, priceCents: 11000, typeIds: ['functional'], weeklyLimit: null, active: true },
    { id: 'pk0', name: 'Vecchio', kind: 'pack', lessons: 5, validityDays: 30, priceCents: 5000, typeIds: [], weeklyLimit: null, active: false },
  ];
  return d;
}
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { assert.equal(r.ok, true, JSON.stringify(r)); return r as Extract<T, { ok: true }>; };
const err = (r: { ok: boolean; error?: string }, code: string) => { assert.equal(r.ok, false); assert.equal(r.error, code); };

// ------------------------------------------------------------------------------------------ permessi
test('tabella dei permessi: owner tutto, Segreteria il banco, Trainer solo le presenze', () => {
  assert.equal(isDesk('owner'), true);
  assert.equal(isDesk('staff'), true);
  assert.equal(isDesk('trainer'), false);
  assert.equal(isDesk('client'), false);
  for (const cap of ['book', 'members', 'sell', 'attendance'] as const) assert.equal(can('staff', cap), true, cap);
  for (const cap of ['notes', 'credits', 'schedule', 'packs', 'settings', 'leads', 'messages', 'report', 'revenue', 'void', 'team'] as const) {
    assert.equal(can('owner', cap), true, cap);
    assert.equal(can('staff', cap), false, `staff ${cap}`);
    assert.equal(can('trainer', cap), false, `trainer ${cap}`);
    assert.equal(can('client', cap), false, `client ${cap}`);
  }
  assert.equal(can('trainer', 'attendance'), true);
  for (const cap of ['book', 'members', 'sell'] as const) assert.equal(can('trainer', cap), false, `trainer ${cap}`);
  assert.equal(can('client', 'attendance'), false);
});

test('dove si va dopo l’accesso', () => {
  assert.deepEqual(['client', 'owner', 'staff', 'trainer'].map((r) => homePath(r as Member['role'])), ['/corsi', '/oggi', '/banco', '/lezioni']);
});

test('il Trainer tiene le lezioni col suo nome o col solo nome di battesimo', () => {
  const marco = member('marco', 'trainer', 'Marco Rossi');
  const s = (trainer: string) => ({ trainer });
  assert.equal(teaches(marco, s('Marco Rossi')), true);
  assert.equal(teaches(marco, s('marco')), true);
  assert.equal(teaches(marco, s('  MARCO   rossi ')), true);
  assert.equal(teaches(marco, s('Marcos')), false);
  assert.equal(teaches(marco, s('Rossi')), false);
  assert.equal(teaches(marco, s('')), false);
  assert.equal(teaches(marco, s('Team KUKO')), false);
  assert.equal(teaches(member('ana', 'client', 'Marco Rossi'), s('Marco')), false, 'un iscritto non tiene lezioni');
});

// ------------------------------------------------------------------------------------------ la Segreteria prenota come l’owner
function withSession(): Data {
  const d = base();
  d.sessions.push({ id: 's1', typeId: 'functional', startsAt: romeWall('2026-10-14', '10:05').toISOString(), duration: 50, capacity: 4, trainer: 'Marco', status: 'scheduled', templateId: null, note: '' });
  d.passes.push({ id: 'p1', memberId: 'ana', packId: null, name: 'Pack', kind: 'pack', creditsTotal: 10, creditsLeft: 10, startsOn: '2026-10-01', expiresOn: '2026-12-31', typeIds: [], weeklyLimit: null, note: '', createdAt: '2026-10-01T08:00:00Z' } satisfies Pass);
  return d;
}

test('la Segreteria prenota anche a prenotazioni chiuse; un iscritto o un Trainer no', () => {
  const d = withSession(); // inizia tra 5 minuti: per un iscritto è già chiusa
  err(book(d, { memberId: 'ana', sessionId: 's1', now: NOW, actor: { role: 'client', memberId: 'ana' } }), 'booking_closed');
  ok(book(d, { memberId: 'ana', sessionId: 's1', now: NOW, actor: STAFF }));
  err(book(d, { memberId: 'ana', sessionId: 's1', now: NOW, actor: { role: 'trainer', memberId: 'marco' } }), 'forbidden');
});

test('la Segreteria annulla per conto di un iscritto senza penale; un Trainer non annulla', () => {
  const d0 = withSession();
  const b = ok(book(d0, { memberId: 'ana', sessionId: 's1', now: NOW, actor: OWNER }));
  const r = ok(cancelBooking(b.data, { bookingId: b.booking.id, now: NOW, actor: STAFF }));
  assert.equal(r.status, 'cancelled');
  assert.equal(r.refunded, true);
  err(cancelBooking(b.data, { bookingId: b.booking.id, now: NOW, actor: { role: 'trainer', memberId: 'marco' } }), 'forbidden');
});

// ------------------------------------------------------------------------------------------ vendita con incasso
test('vendita con incasso: abbonamento e pagamento nascono insieme e restano collegati', () => {
  const r = ok(assignPass(base(), { memberId: 'ana', packId: 'pk1', startsOn: '2026-10-14', now: NOW, actor: STAFF, payment: { amountCents: 11000, method: 'cash', by: { name: 'Segreteria' } } }));
  assert.equal(r.data.passes.length, 1);
  assert.equal(r.data.payments.length, 1);
  assert.equal(r.payment?.passId, r.pass.id);
  assert.equal(r.payment?.memberId, 'ana');
  assert.equal(r.payment?.amountCents, 11000);
  assert.equal(r.payment?.byName, 'Segreteria');
  assert.equal(r.payment?.paidAt, NOW.toISOString());
});

test('la Segreteria deve registrare l’incasso e vende solo pacchetti attivi; l’owner può assegnare senza incasso', () => {
  const pay = { amountCents: 5000, method: 'card' as const, by: { name: 'Segreteria' } };
  err(assignPass(base(), { memberId: 'ana', packId: 'pk1', startsOn: '2026-10-14', now: NOW, actor: STAFF }), 'invalid');
  err(assignPass(base(), { memberId: 'ana', packId: 'pk0', startsOn: '2026-10-14', now: NOW, actor: STAFF, payment: pay }), 'invalid');
  const o = ok(assignPass(base(), { memberId: 'ana', packId: 'pk1', startsOn: '2026-10-14', now: NOW, actor: OWNER }));
  assert.equal(o.data.payments.length, 0, 'senza importo nessun incasso');
  ok(assignPass(base(), { memberId: 'ana', packId: 'pk0', startsOn: '2026-10-14', now: NOW, actor: OWNER, payment: pay }));
});

test('importo e metodo devono essere validi; l’omaggio vale zero', () => {
  const go = (amountCents: number, method: string) => assignPass(base(), { memberId: 'ana', packId: 'pk1', startsOn: '2026-10-14', now: NOW, actor: STAFF, payment: { amountCents, method: method as 'cash', by: { name: 'S' } } });
  err(go(-1, 'cash'), 'invalid');
  err(go(10.5, 'cash'), 'invalid');
  err(go(1_000_001, 'cash'), 'invalid');
  err(go(100, 'assegno'), 'invalid');
  assert.equal(ok(go(0, 'other')).data.payments[0].amountCents, 0);
});

test('un abbonamento si vende solo a un iscritto (la Segreteria non vende a Trainer o owner)', () => {
  const pay = { amountCents: 100, method: 'cash' as const, by: { name: 'S' } };
  err(assignPass(base(), { memberId: 'marco', packId: 'pk1', startsOn: '2026-10-14', now: NOW, actor: STAFF, payment: pay }), 'member_not_found');
  err(assignPass(base(), { memberId: 'nessuno', packId: 'pk1', startsOn: '2026-10-14', now: NOW, actor: STAFF, payment: pay }), 'member_not_found');
});

// ------------------------------------------------------------------------------------------ incassi
test('incasso libero: importo maggiore di zero, metodo ammesso, persona esistente', () => {
  const d = base();
  const by = { name: 'Segreteria' };
  err(addPayment(d, { memberId: 'ana', amountCents: 0, method: 'cash', now: NOW, by }), 'invalid');
  err(addPayment(d, { memberId: 'ana', amountCents: 100, method: 'bitcoin' as 'cash', now: NOW, by }), 'invalid');
  err(addPayment(d, { memberId: 'nessuno', amountCents: 100, method: 'cash', now: NOW, by }), 'member_not_found');
  const r = ok(addPayment(d, { memberId: null, amountCents: 1500, method: 'cash', note: '  Lezione singola ', now: NOW, by }));
  assert.equal(r.payment.note, 'Lezione singola');
  assert.equal(r.payment.memberId, null);
  assert.equal(d.payments.length, 0, 'i dati di partenza non cambiano');
});

test('storno: resta in elenco, non conta nei totali e si può ripristinare', () => {
  let d = base();
  const by = { name: 'S' };
  d = ok(addPayment(d, { memberId: 'ana', amountCents: 1000, method: 'cash', now: NOW, by })).data;
  d = ok(addPayment(d, { memberId: 'bob', amountCents: 2500, method: 'card', now: NOW, by })).data;
  assert.equal(totals(d.payments).cents, 3500);
  const id = d.payments[1].id;
  d = ok(voidPayment(d, { paymentId: id, now: NOW })).data;
  assert.equal(d.payments.length, 2);
  assert.equal(totals(d.payments).cents, 1000);
  assert.equal(totals(d.payments).byMethod.card, 0);
  const first = d.payments[1].voidedAt;
  assert.equal(ok(voidPayment(d, { paymentId: id, now: new Date(NOW.getTime() + 1000) })).data.payments[1].voidedAt, first, 'stornare due volte non cambia la data');
  d = ok(voidPayment(d, { paymentId: id, now: NOW, void: false })).data;
  assert.equal(totals(d.payments).cents, 3500);
  err(voidPayment(d, { paymentId: 'boh', now: NOW }), 'payment_not_found');
});

test('totali: per metodo, omaggi a parte, giorni e mesi di Roma', () => {
  const d = base();
  const mk = (id: string, iso: string, amountCents: number, method: 'cash' | 'card' | 'transfer' | 'other') => ({ id, memberId: 'ana', passId: null, amountCents, method, note: '', paidAt: iso, byName: 'S', voidedAt: null });
  d.payments = [
    mk('a', '2026-10-14T08:00:00Z', 11000, 'card'),
    mk('b', '2026-10-14T09:30:00Z', 1500, 'cash'),
    mk('c', '2026-10-14T09:40:00Z', 0, 'other'),
    mk('d', '2026-09-30T22:30:00Z', 9000, 'transfer'), // 00:30 del 1° ottobre a Roma
    mk('e', '2026-09-15T10:00:00Z', 2000, 'cash'),
    mk('f', '2026-06-01T10:00:00Z', 5000, 'cash'),
  ];
  const t = totals(d.payments.slice(0, 3));
  assert.deepEqual({ cents: t.cents, count: t.count, free: t.free }, { cents: 12500, count: 2, free: 1 });
  assert.deepEqual(t.byMethod, { cash: 1500, card: 11000, transfer: 0, other: 0 });
  assert.deepEqual(paymentsOn(d, '2026-10-14').map((p) => p.id), ['c', 'b', 'a'], 'dal più recente');
  assert.deepEqual(paymentsOn(d, '2026-10-01').map((p) => p.id), ['d'], 'mezzanotte di Roma, non UTC');
  const m = byMonth(d.payments, NOW, 4);
  assert.deepEqual(m.map((x) => x.month), ['2026-07', '2026-08', '2026-09', '2026-10']);
  assert.deepEqual(m.map((x) => x.cents), [0, 0, 2000, 21500]);
  assert.equal(m[3].count, 3);
});

test('importi scritti a mano: virgola, punto, migliaia, euro', () => {
  assert.equal(parseEuro('90'), 9000);
  assert.equal(parseEuro('90,5'), 9050);
  assert.equal(parseEuro(' 90,50 € '), 9050);
  assert.equal(parseEuro('90.50'), 9050);
  assert.equal(parseEuro('1.200'), 120000);
  assert.equal(parseEuro('1.200,00'), 120000);
  assert.equal(parseEuro('0'), 0);
  for (const bad of ['', 'abc', '-5', '12,345', '90,5,1', '1e3', '10001']) assert.equal(parseEuro(bad), null, bad);
  assert.equal(euroField(9500), '95');
  assert.equal(euroField(9550), '95,50');
  assert.equal(parseEuro(euroField(12345)), 12345);
});

// ------------------------------------------------------------------------------------------ team
test('Segreteria: una sola, con email vera; un iscritto già presente passa al team', () => {
  let d = base();
  d.members = d.members.filter((m) => m.role !== 'staff');
  err(addTeamMember(d, { name: 'Banco', email: 'non-una-email', role: 'staff', now: NOW }), 'invalid');
  err(addTeamMember(d, { name: ' ', email: 'banco@example.com', role: 'staff', now: NOW }), 'invalid');
  err(addTeamMember(d, { name: 'X', email: 'x@example.com', role: 'owner' as 'staff', now: NOW }), 'invalid');
  const r = ok(addTeamMember(d, { name: ' Banco  studio ', email: ' Banco@Example.com ', role: 'staff', now: NOW }));
  assert.equal(r.member.name, 'Banco studio');
  assert.equal(r.member.email, 'banco@example.com');
  d = r.data;
  err(addTeamMember(d, { name: 'Altra', email: 'altra@example.com', role: 'staff', now: NOW }), 'staff_exists');
  // Ana è già iscritta: diventa Trainer, stessa scheda
  const before = d.members.length;
  const t = ok(addTeamMember(d, { name: 'Ana Verdi', email: 'ANA@example.com', role: 'trainer', now: NOW }));
  assert.equal(t.data.members.length, before);
  assert.equal(t.member.id, 'ana');
  assert.equal(t.member.role, 'trainer');
  err(addTeamMember(t.data, { name: 'Boss', email: 'owner@example.com', role: 'trainer', now: NOW }), 'email_in_use');
  assert.deepEqual(teamOf(t.data).map((m) => m.id).sort(), ['ana', 'marco', r.member.id].sort());
});

test('togliere dal team: con storia torna iscritto, senza storia sparisce', () => {
  let d = base();
  d.passes.push({ id: 'p1', memberId: 'marco', packId: null, name: 'Pack', kind: 'pack', creditsTotal: 1, creditsLeft: 1, startsOn: '2026-10-01', expiresOn: '2026-12-31', typeIds: [], weeklyLimit: null, note: '', createdAt: '2026-10-01T08:00:00Z' });
  const kept = ok(removeTeamMember(d, { memberId: 'marco' }));
  assert.equal(kept.kept, true);
  assert.equal(kept.data.members.find((m) => m.id === 'marco')?.role, 'client');
  const gone = ok(removeTeamMember(d, { memberId: 'desk' }));
  assert.equal(gone.kept, false);
  assert.equal(gone.data.members.some((m) => m.id === 'desk'), false);
  err(removeTeamMember(d, { memberId: 'ana' }), 'member_not_found');
  err(removeTeamMember(d, { memberId: 'owner' }), 'member_not_found');
  err(removeTeamMember(d, { memberId: 'nessuno' }), 'member_not_found');
  // i pagamenti di una Segreteria tolta restano, col nome di chi li ha registrati
  d = ok(addPayment(d, { memberId: 'ana', amountCents: 500, method: 'cash', now: NOW, by: { name: 'Segreteria' } })).data;
  assert.equal(ok(removeTeamMember(d, { memberId: 'desk' })).data.payments[0].byName, 'Segreteria');
});

// ------------------------------------------------------------------------------------------ demo e API locale
test('demo: Segreteria e Trainer ci sono, il Trainer ha lezioni sue e ci sono incassi di oggi', () => {
  const now = new Date();
  const d = demoData(now);
  assert.equal(d.members.filter((m) => m.role === 'staff').length, 1);
  const sofia = d.members.find((m) => m.id === DEMO_TRAINER_ID)!;
  assert.equal(sofia.role, 'trainer');
  const mine = d.sessions.filter((s) => teaches(sofia, s));
  assert.ok(mine.length >= 10, `lezioni di Sofia: ${mine.length}`);
  assert.ok(mine.every((s) => s.typeId === 'pilates'));
  assert.ok(paymentsOn(d, romeDay(now)).length >= 2, 'incassi di oggi');
  assert.ok(d.payments.some((p) => p.amountCents === 0) && d.payments.some((p) => p.voidedAt), 'un omaggio e uno storno di esempio');
  assert.ok(totals(d.payments).cents > 100000, 'qualche migliaio di euro negli ultimi mesi');
  // idempotente: rifarlo non duplica niente
  const again = demoTeam(d, now);
  assert.equal(again.members.length, d.members.length);
  assert.equal(again.payments.length, d.payments.length);
  assert.equal(DEMO_STAFF_ID, 'm_segreteria');
});

test('API demo: ognuno può fare solo quello che il suo ruolo permette', async () => {
  const api = new LocalApi();
  await api.init();
  const names = (r: { ok: boolean }) => r.ok;

  // Segreteria
  const staff = await api.demoLogin('staff');
  assert.equal(staff.ok, true);
  const data = (await api.refresh());
  assert.equal(data.ok, true);
  if (!data.ok) return;
  const pk = data.data.packs.find((p) => p.active)!;
  const client = data.data.members.find((m) => m.role === 'client')!;
  assert.equal(names(await api.assignPass(client.id, pk.id, '2026-10-14', '')), false, 'senza incasso no');
  const sold = await api.assignPass(client.id, pk.id, romeDay(new Date()), '', { amountCents: pk.priceCents, method: 'cash' });
  assert.equal(sold.ok, true);
  if (sold.ok) assert.equal(sold.data.payments.filter((p) => p.passId && p.byName === 'Segreteria' && p.memberId === client.id).length >= 1, true);
  assert.equal(names(await api.addPayment({ memberId: client.id, amountCents: 1000, method: 'card' })), true);
  const vp = await api.voidPayment(data.data.payments[0].id);
  assert.equal(vp.ok === false && vp.error, 'forbidden', 'la Segreteria non storna');
  for (const r of [await api.adjustCredits('x', 1), await api.savePack(pk), await api.saveSettings(data.data.settings), await api.cancelSession('x'), await api.deleteLead('x'), await api.addTeamMember({ name: 'A', email: 'a@example.com', role: 'trainer' }), await api.removeTeamMember('x')]) {
    assert.equal(r.ok === false && r.error, 'forbidden');
  }
  // le note dell'iscritto non cambiano dalla Segreteria
  const withNote = data.data.members.find((m) => m.notes)!;
  const sv = await api.saveMember({ id: withNote.id, name: withNote.name, email: withNote.email, phone: withNote.phone, notes: 'riscritta' });
  assert.equal(sv.ok, true);
  if (sv.ok) assert.equal(sv.data.members.find((m) => m.id === withNote.id)!.notes, withNote.notes);
  const trainerRow = data.data.members.find((m) => m.role === 'trainer')!;
  const sv2 = await api.saveMember({ id: trainerRow.id, name: 'Altro', email: trainerRow.email, phone: '', notes: '' });
  assert.equal(sv2.ok === false && sv2.error, 'forbidden');

  // Trainer: presenze solo alle sue lezioni
  const tr = await api.demoLogin('trainer');
  assert.equal(tr.ok, true);
  const now = (await api.refresh());
  if (!now.ok) return;
  const sofia = now.data.members.find((m) => m.id === DEMO_TRAINER_ID)!;
  const mineSession = now.data.sessions.find((s) => teaches(sofia, s) && now.data.bookings.some((b) => b.sessionId === s.id && b.status === 'booked'))!;
  const other = now.data.sessions.find((s) => !teaches(sofia, s) && now.data.bookings.some((b) => b.sessionId === s.id && b.status === 'booked'))!;
  const bMine = now.data.bookings.find((b) => b.sessionId === mineSession.id && b.status === 'booked')!;
  const bOther = now.data.bookings.find((b) => b.sessionId === other.id && b.status === 'booked')!;
  assert.equal((await api.setAttendance(bMine.id, 'attended')).ok, true);
  const no = await api.setAttendance(bOther.id, 'attended');
  assert.equal(no.ok === false && no.error, 'forbidden');
  const nb = await api.ownerBook(client.id, other.id, true);
  assert.equal(nb.ok === false && nb.error, 'forbidden');
  const na = await api.assignPass(client.id, pk.id, '2026-10-14', '', { amountCents: 1, method: 'cash' });
  assert.equal(na.ok === false && na.error, 'forbidden');

  // owner: team, storno
  await api.demoLogin('owner');
  const add = await api.addTeamMember({ name: 'Luca Neri', email: 'luca.neri@example.com', role: 'trainer' });
  assert.equal(add.ok, true);
  const dup = await api.addTeamMember({ name: 'Altra', email: 'altra@example.com', role: 'staff' });
  assert.equal(dup.ok === false && dup.error, 'staff_exists');
  const vo = await api.voidPayment(data.data.payments[0].id);
  assert.equal(vo.ok, true);
  if (add.ok) assert.equal((await api.removeTeamMember(add.member.id)).ok, true);
});

test('CSV per il commercialista: separatore ;, virgola decimale, dal più vecchio, con stato e chi ha incassato', () => {
  const mk = (id: string, paidAt: string, amountCents: number, o: Partial<import('../src/lib/types').Payment> = {}) =>
    ({ id, memberId: 'm1', passId: null, amountCents, method: 'cash', note: '', paidAt, voidedAt: null, byName: 'Segreteria', ...o }) as import('../src/lib/types').Payment;
  const list = [
    mk('b', '2026-10-27T09:30:00.000Z', 12950, { method: 'card', note: 'Vendita: Mensile "Open"; 1 mese' }),
    mk('a', '2026-10-26T15:05:00.000Z', 5000, { voidedAt: '2026-10-26T16:00:00.000Z' }),
    mk('c', '2026-10-27T10:00:00.000Z', 0, { memberId: null }),
  ];
  const csv = paymentsCsv(list, [{ id: 'm1', name: 'Marta Rossi' }]);
  assert.ok(csv.startsWith('\ufeff'), 'BOM per Excel');
  const rows = csv.slice(1).split('\r\n');
  assert.equal(rows.length, 4);
  assert.equal(rows[0], 'Data;Ora;Iscritto;Descrizione;Metodo;Importo (€);Stato;Registrato da');
  assert.match(rows[1], /^26\/10\/2026;16:05;Marta Rossi;;Contanti;50,00;Stornato;Segreteria$/, 'il più vecchio per primo, ora di Roma');
  assert.match(rows[2], /^27\/10\/2026;10:30;Marta Rossi;"Vendita: Mensile ""Open""; 1 mese";Carta/, 'le virgolette si raddoppiano e il campo con ; va tra virgolette');
  assert.match(rows[2], /;129,50;;Segreteria$/);
  assert.match(rows[3], /^27\/10\/2026;11:00;;;Contanti;0,00;Omaggio;Segreteria$/);
});
