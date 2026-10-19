import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoData } from '../src/lib/seed';
import { addLead, ago, cleanLead, leadLabel, LEAD_KEEP_MONTHS, leadsNew, NUTRITION, purgeLeads, removeLead, updateLead } from '../src/lib/leads';
import { romeWall } from '../src/lib/time';

const NOW = romeWall('2026-10-14', '10:00');
const OK = { topic: 'functional', name: '  Anna   Verdi ', phone: '+39 333 123 4567', email: 'ANNA@Example.com', slots: ['sera', 'sera', 'boh'], note: ' preferisco il martedì ', consent: true };

test('il modulo: pulisce i campi e riconosce prova e nutrizionista', () => {
  const d = demoData(NOW);
  const topics = d.types.map((t) => t.id);
  const a = cleanLead(OK, topics);
  assert.ok(a.ok);
  if (a.ok) {
    assert.equal(a.lead.name, 'Anna Verdi');
    assert.equal(a.lead.email, 'anna@example.com');
    assert.deepEqual(a.lead.slots, ['sera']);
    assert.equal(a.lead.kind, 'trial');
    assert.equal(a.lead.note, 'preferisco il martedì');
  }
  const n = cleanLead({ ...OK, topic: NUTRITION }, topics);
  assert.ok(n.ok && n.lead.kind === 'nutrition');
});

test('il modulo: rifiuta dati sbagliati e consenso mancante', () => {
  const topics = demoData(NOW).types.map((t) => t.id);
  assert.equal(cleanLead({ ...OK, name: 'A' }, topics).ok, false);
  assert.equal(cleanLead({ ...OK, phone: '12' }, topics).ok, false);
  assert.equal(cleanLead({ ...OK, email: 'non-una-mail' }, topics).ok, false);
  assert.equal(cleanLead({ ...OK, topic: 'zumba' }, topics).ok, false);
  const r = cleanLead({ ...OK, consent: false }, topics);
  assert.ok(!r.ok && r.message?.includes('consenso'));
  assert.equal(cleanLead({ ...OK, email: '' }, topics).ok, true, 'l’email è facoltativa');
});

test('una richiesta ripetuta entro 10 minuti non si duplica, dopo sì', () => {
  const d0 = demoData(NOW);
  const r1 = addLead(d0, { input: OK, now: NOW });
  assert.ok(r1.ok && !r1.duplicate);
  if (!r1.ok) return;
  assert.equal(r1.data.leads.length, d0.leads.length + 1);
  assert.equal(r1.data.leads[0].status, 'new');
  const r2 = addLead(r1.data, { input: { ...OK, phone: '3331234567' }, now: new Date(NOW.getTime() + 5 * 60000) });
  assert.ok(r2.ok && r2.duplicate);
  if (r2.ok) assert.equal(r2.data.leads.length, r1.data.leads.length);
  const r3 = addLead(r1.data, { input: OK, now: new Date(NOW.getTime() + 30 * 60000) });
  assert.ok(r3.ok && !r3.duplicate);
  if (r3.ok) assert.equal(r3.data.leads.length, r1.data.leads.length + 1);
  // l'originale non cambia
  assert.equal(d0.leads.length, demoData(NOW).leads.length);
});

test('un socio chiede la consulenza dall’app: la richiesta porta nome e telefono del profilo e la provenienza', () => {
  const d0 = demoData(NOW);
  const m = d0.members.find((x) => x.role === 'client')!;
  const r = addLead(d0, { input: { topic: NUTRITION, name: m.name, phone: m.phone, email: m.email, consent: true }, now: NOW, source: 'app' });
  assert.ok(r.ok && !r.duplicate);
  if (!r.ok) return;
  assert.deepEqual([r.lead.source, r.lead.kind, r.lead.name], ['app', 'nutrition', m.name]);
  assert.equal(leadsNew(r.data).length, leadsNew(d0).length + 1);
});

test('l’owner cambia stato e nota, può cancellare', () => {
  const d = demoData(NOW);
  const id = d.leads[0].id;
  const u = updateLead(d, { id, status: 'contacted', ownerNote: 'Richiamata, passa giovedì', now: NOW });
  assert.ok(u.ok);
  if (!u.ok) return;
  assert.equal(u.lead.status, 'contacted');
  assert.equal(u.lead.updatedAt, NOW.toISOString());
  assert.ok(!updateLead(d, { id: 'x', status: 'done', now: NOW }).ok);
  assert.ok(!updateLead(d, { id, status: 'boh' as never, now: NOW }).ok);
  const rm = removeLead(u.data, { id });
  assert.ok(rm.ok);
  if (rm.ok) assert.equal(rm.data.leads.some((l) => l.id === id), false);
  assert.ok(!removeLead(d, { id: 'x' }).ok);
});

test('le richieste vecchie si cancellano dopo 12 mesi', () => {
  const d = demoData(NOW);
  assert.equal(LEAD_KEEP_MONTHS, 12);
  const old = structuredClone(d);
  old.leads[0].createdAt = new Date(NOW.getTime() - 400 * 86400000).toISOString();
  assert.equal(purgeLeads(old, NOW).leads.length, d.leads.length - 1);
  assert.equal(purgeLeads(d, NOW), d, 'senza nulla da togliere restituisce gli stessi dati');
});

test('demo: ci sono richieste nuove, con nome leggibile e tempo trascorso', () => {
  const d = demoData(NOW);
  assert.ok(leadsNew(d).length >= 2);
  const n = d.leads.find((l) => l.kind === 'nutrition')!;
  assert.equal(leadLabel(d, n), 'Consulenza nutrizionale');
  const t = d.leads.find((l) => l.kind === 'trial')!;
  assert.match(leadLabel(d, t), /^Prova /);
  assert.equal(ago(new Date(NOW.getTime() - 3 * 3600000).toISOString(), NOW), '3 ore fa');
  assert.equal(ago(new Date(NOW.getTime() - 26 * 3600000).toISOString(), NOW), 'ieri');
  assert.equal(ago(new Date(NOW.getTime() - 5 * 60000).toISOString(), NOW), 'pochi minuti fa');
});
