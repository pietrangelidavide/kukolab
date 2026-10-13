import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, diffDays, mondayOf, romeDay, romeHM, romeWall, weekdayOf, whenIt } from '../src/lib/time';

test('ora di parete a Roma → istante, con ora legale', () => {
  // 14 ottobre 2026: CEST (UTC+2)
  assert.equal(romeWall('2026-10-14', '18:30').toISOString(), '2026-10-14T16:30:00.000Z');
  // 15 dicembre 2026: CET (UTC+1)
  assert.equal(romeWall('2026-12-15', '18:30').toISOString(), '2026-12-15T17:30:00.000Z');
  // giorno del cambio ora (25 ottobre 2026): 07:30 è già CET
  assert.equal(romeWall('2026-10-25', '07:30').toISOString(), '2026-10-25T06:30:00.000Z');
  // 29 marzo 2026 (inizio ora legale): 10:00 è CEST
  assert.equal(romeWall('2026-03-29', '10:00').toISOString(), '2026-03-29T08:00:00.000Z');
});

test('giorno e ora di Roma da un istante', () => {
  const d = new Date('2026-10-14T22:30:00Z'); // 00:30 del 15 a Roma
  assert.equal(romeDay(d), '2026-10-15');
  assert.equal(romeHM(d), '00:30');
});

test('calcolo con i giorni', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(diffDays('2026-10-14', '2026-10-21'), 7);
  assert.equal(weekdayOf('2026-10-14'), 3); // mercoledì
  assert.equal(weekdayOf('2026-10-18'), 7); // domenica
  assert.equal(mondayOf('2026-10-18'), '2026-10-12');
  assert.equal(mondayOf('2026-10-12'), '2026-10-12');
});

test('data in italiano', () => {
  assert.equal(whenIt('2026-10-14T16:30:00Z'), 'mercoledì 14 ottobre alle 18:30');
});
