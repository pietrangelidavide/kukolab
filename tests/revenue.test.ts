import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Data, Member, Pass, Payment } from '../src/lib/types';
import { emptyData } from '../src/lib/seed';
import { niceTop, renewalsDue, revenueReport } from '../src/lib/revenue';
import { romeWall } from '../src/lib/time';

// mercoledì 14 ottobre 2026, ore 10: la settimana corrente parte da lunedì 12
const NOW = romeWall('2026-10-14', '10:00');
const member = (id: string, name: string): Member => ({ id, name, email: `${id}@example.com`, phone: '', role: 'client', notes: '', createdAt: NOW.toISOString() });
const pass = (id: string, memberId: string, packId: string | null, expiresOn: string, o: Partial<Pass> = {}): Pass => ({
  id, memberId, packId, name: packId === 'pk1' ? 'Functional 10' : 'Mensile Open', kind: 'pack', creditsTotal: 10, creditsLeft: 6, startsOn: '2026-08-01', expiresOn, typeIds: [], weeklyLimit: null, note: '', createdAt: '2026-08-01T10:00:00.000Z', ...o,
});
const pay = (id: string, paidAt: string, amountCents: number, o: Partial<Payment> = {}): Payment => ({ id, memberId: 'ana', passId: null, amountCents, method: 'cash', note: '', paidAt, voidedAt: null, byName: 'S', ...o });

function base(): Data {
  const d = emptyData();
  d.members = [member('ana', 'Ana'), member('bob', 'Bob'), member('cle', 'Cle')];
  d.packs = [
    { id: 'pk1', name: 'Functional 10', kind: 'pack', lessons: 10, validityDays: 90, priceCents: 11000, typeIds: [], weeklyLimit: null, active: true },
    { id: 'pk2', name: 'Mensile Open', kind: 'monthly', lessons: null, validityDays: 30, priceCents: 12900, typeIds: [], weeklyLimit: null, active: true },
  ];
  d.passes = [pass('p1', 'ana', 'pk1', '2026-12-01'), pass('p2', 'bob', 'pk2', '2026-10-20', { kind: 'monthly', creditsLeft: null, creditsTotal: null })];
  return d;
}

test('soldi del Report: periodo, confronto con il periodo prima, settimane e annullati', () => {
  const d = base();
  // 2 settimane = da lunedì 5 ottobre a mercoledì 14 (10 giorni); il periodo prima va dal 25 settembre al 4 ottobre
  d.payments = [
    pay('a', '2026-10-13T09:00:00Z', 11000, { passId: 'p1', method: 'card' }), // settimana corrente
    pay('b', '2026-10-14T08:00:00Z', 1500), // settimana corrente
    pay('c', '2026-10-06T09:00:00Z', 12900, { memberId: 'bob', passId: 'p2', method: 'transfer' }), // settimana scorsa
    pay('d', '2026-10-07T09:00:00Z', 5000, { voidedAt: '2026-10-07T10:00:00Z' }), // stornato: non conta
    pay('e', '2026-10-08T09:00:00Z', 0, { passId: 'p1', method: 'other' }), // omaggio
    pay('f', '2026-09-28T09:00:00Z', 20000, { passId: 'p1' }), // periodo prima
    pay('g', '2026-09-10T09:00:00Z', 7000), // troppo vecchio per il confronto
  ];
  const r = revenueReport(d, NOW, 2);
  assert.deepEqual([r.from, r.to], ['2026-10-05', '2026-10-14']);
  assert.deepEqual([r.prev.from, r.prev.to], ['2026-09-25', '2026-10-04']);
  assert.deepEqual([r.cents, r.count, r.free, r.avgCents], [25400, 3, 1, 8467]);
  assert.deepEqual(r.voided, { cents: 5000, count: 1 });
  assert.deepEqual([r.prev.cents, r.prev.count], [20000, 1]);
  assert.equal(r.deltaPct, 27, '(25400 − 20000) / 20000');
  assert.deepEqual(r.weekly.map((w) => [w.weekStart, w.cents, w.count]), [['2026-10-05', 12900, 1], ['2026-10-12', 12500, 2]]);
  assert.equal(r.weekly.reduce((n, w) => n + w.cents, 0), r.cents, 'le settimane sommano al totale');
});

test('senza incassi prima non c’è una percentuale; senza incassi del tutto tutto è zero', () => {
  const d = base();
  d.payments = [pay('a', '2026-10-13T09:00:00Z', 5000)];
  assert.equal(revenueReport(d, NOW, 4).deltaPct, null);
  d.payments = [];
  const r = revenueReport(d, NOW, 4);
  assert.deepEqual([r.cents, r.count, r.avgCents, r.deltaPct, r.byMethod.length, r.perPack.length], [0, 0, 0, null, 0, 0]);
  assert.equal(r.weekly.length, 4);
});

test('per metodo: ordinati per importo, con la quota sul totale; gli omaggi e gli stornati non ci sono', () => {
  const d = base();
  d.payments = [
    pay('a', '2026-10-13T09:00:00Z', 7500, { method: 'card' }),
    pay('b', '2026-10-13T10:00:00Z', 2500, { method: 'cash' }),
    pay('c', '2026-10-12T10:00:00Z', 5000, { method: 'transfer', voidedAt: '2026-10-12T11:00:00Z' }),
    pay('d', '2026-10-12T12:00:00Z', 0, { method: 'other' }),
  ];
  const r = revenueReport(d, NOW, 4);
  assert.deepEqual(r.byMethod.map((m) => [m.method, m.cents, m.count, m.share]), [['card', 7500, 1, 0.75], ['cash', 2500, 1, 0.25]]);
});

test('per pacchetto: le vendite legate a un abbonamento, il resto sotto "Altri incassi"', () => {
  const d = base();
  d.payments = [
    pay('a', '2026-10-13T09:00:00Z', 11000, { passId: 'p1' }),
    pay('b', '2026-10-12T09:00:00Z', 9000, { passId: 'p1' }), // stesso pacchetto, venduto a un prezzo diverso
    pay('c', '2026-10-12T10:00:00Z', 12900, { passId: 'p2', memberId: 'bob' }),
    pay('d', '2026-10-12T11:00:00Z', 1500), // quota: nessun abbonamento
  ];
  const r = revenueReport(d, NOW, 4);
  assert.deepEqual(r.perPack.map((x) => [x.name, x.sold, x.cents, x.avgCents]), [['Functional 10', 2, 20000, 10000], ['Mensile Open', 1, 12900, 12900], ['Altri incassi', 1, 1500, 1500]]);
});

test('questo mese fino a oggi e mese scorso intero', () => {
  const d = base();
  d.payments = [pay('a', '2026-10-02T09:00:00Z', 3000), pay('b', '2026-09-30T09:00:00Z', 4000), pay('c', '2026-09-01T09:00:00Z', 6000), pay('d', '2026-08-31T09:00:00Z', 9999)];
  const r = revenueReport(d, NOW, 4);
  assert.deepEqual(r.month, { cents: 3000, prevCents: 10000 });
});

test('rinnovi in vista: scadenze entro 14 giorni non ancora rinnovate, col prezzo di listino', () => {
  const d = base();
  // p2 (Mensile Open, 129 €) scade il 20/10: è un rinnovo in vista; p1 scade a dicembre
  let r = renewalsDue(d, NOW, 14);
  assert.deepEqual(r, { count: 1, cents: 12900, unpriced: 0 });
  // se Bob ha già un altro abbonamento che lo copre, non c'è niente da rinnovare
  d.passes.push(pass('p3', 'bob', 'pk2', '2026-11-19', { kind: 'monthly', creditsLeft: null, creditsTotal: null, startsOn: '2026-10-21' }));
  r = renewalsDue(d, NOW, 14);
  assert.equal(r.count, 0);
  // un abbonamento con pacchetto tolto dal catalogo si conta ma senza valore
  d.passes.push(pass('p4', 'cle', null, '2026-10-16'));
  r = renewalsDue(d, NOW, 14);
  assert.deepEqual(r, { count: 1, cents: 0, unpriced: 1 });
  // quelli quasi finiti per lezioni ma con scadenza lontana non sono "in scadenza"
  d.passes = [pass('p5', 'ana', 'pk1', '2026-12-31', { creditsLeft: 1 })];
  assert.equal(renewalsDue(d, NOW, 14).count, 0);
});

test('asse del grafico: sempre un numero tondo sopra al massimo', () => {
  assert.equal(niceTop(0), 10000);
  assert.equal(niceTop(9999), 10000);
  assert.equal(niceTop(12500), 20000);
  assert.equal(niceTop(180000), 200000);
  assert.equal(niceTop(7_000_000), 10_000_000);
  for (const c of [1, 50, 99999, 100001, 420000, 9_999_999]) assert.ok(niceTop(c) >= c, String(c));
});
