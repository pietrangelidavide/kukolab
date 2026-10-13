import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoData, DEMO_CLIENT_ID } from '../src/lib/seed';
import { counts } from '../src/lib/rules';
import { activePasses, expiringPasses, kpiBetween, memberStatus, myBookings, slotState, viewSession, weeklyBookings } from '../src/lib/selectors';
import { addDays, romeDay, romeWall } from '../src/lib/time';

const NOW = romeWall('2026-10-14', '10:00');

test('i dati demo rispettano le regole', () => {
  const d = demoData(NOW);
  assert.ok(d.sessions.length > 100, 'ci sono lezioni passate e future');
  for (const s of d.sessions) {
    assert.ok(counts(d, s.id).booked <= s.capacity, `lezione ${s.id} oltre la capienza`);
  }
  for (const p of d.passes) {
    if (p.kind === 'pack') {
      assert.ok((p.creditsLeft ?? 0) >= 0 && (p.creditsLeft ?? 0) <= (p.creditsTotal ?? 0), `crediti fuori scala ${p.name}`);
    }
  }
  // nessuno ha due lezioni sovrapposte
  for (const m of d.members) {
    const mine = d.bookings.filter((b) => b.memberId === m.id && ['booked', 'attended', 'no_show'].includes(b.status)).map((b) => d.sessions.find((s) => s.id === b.sessionId)!).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    for (let i = 1; i < mine.length; i++) {
      assert.ok(new Date(mine[i].startsAt).getTime() >= new Date(mine[i - 1].startsAt).getTime() + mine[i - 1].duration * 60000, `sovrapposizione per ${m.name}`);
    }
  }
  // le prenotazioni passate sono chiuse, quelle future aperte
  for (const b of d.bookings) {
    const s = d.sessions.find((x) => x.id === b.sessionId)!;
    if (new Date(s.startsAt).getTime() < NOW.getTime()) assert.ok(!['booked', 'waitlist'].includes(b.status), 'prenotazione aperta su lezione passata');
  }
});

test('la cliente demo ha prenotazioni, un abbonamento attivo e una lezione piena con lista d’attesa', () => {
  const d = demoData(NOW);
  const mine = myBookings(d, DEMO_CLIENT_ID, NOW);
  assert.ok(mine.past.length > 0);
  assert.ok(activePasses(d, DEMO_CLIENT_ID, NOW).length >= 1);
  assert.ok(d.sessions.some((s) => slotState(d, s, NOW) === 'full'), 'almeno una lezione piena');
  assert.ok(d.bookings.some((b) => b.status === 'waitlist'), 'almeno una lista d’attesa');
  const fullView = d.sessions.map((s) => viewSession(d, s, DEMO_CLIENT_ID, NOW)).find((v) => v.state === 'full');
  assert.ok(fullView && fullView.waitlist >= 1);
});

test('indicatori per l’owner', () => {
  const d = demoData(NOW);
  const week = kpiBetween(d, '2026-10-12', '2026-10-18');
  assert.ok(week.sessions > 10 && week.fill > 0 && week.fill <= 1);
  const rows = weeklyBookings(d, 6, NOW);
  assert.equal(rows.length, 6);
  assert.equal(rows[5].weekStart, '2026-10-12');
  assert.ok(rows.some((r) => r.total > 0));
  const exp = expiringPasses(d, NOW, 7);
  assert.ok(exp.length >= 1, 'c’è almeno un abbonamento in scadenza');
  assert.equal(memberStatus(d, 'm_stefano', NOW).label, 'Nessun abbonamento');
  assert.equal(memberStatus(d, 'm_matteo', NOW).label, 'Scaduto');
  assert.equal(addDays(romeDay(NOW), 0), '2026-10-14');
});
