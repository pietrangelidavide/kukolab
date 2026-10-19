// Richieste dal sito: prova gratuita di una lezione e consulenza nutrizionale.
// Funzioni pure come in rules.ts. La stessa logica è nel database (supabase/schema.sql, submit_lead e funzioni collegate).
import type { Data, Err, Id, Lead, LeadKind, LeadStatus, Result } from './types';
import { newId } from './ids';
import { HOUR, MIN } from './time';

export const NUTRITION = 'nutrition';

export const LEAD_SLOTS = [
  { id: 'mattina', label: 'Mattina' },
  { id: 'pranzo', label: 'Pausa pranzo' },
  { id: 'pomeriggio', label: 'Pomeriggio' },
  { id: 'sera', label: 'Sera' },
  { id: 'sabato', label: 'Sabato' },
] as const;

export const LEAD_STATUS: { id: LeadStatus; label: string; short: string }[] = [
  { id: 'new', label: 'Da contattare', short: 'Nuova' },
  { id: 'contacted', label: 'Contattata', short: 'Contattata' },
  { id: 'scheduled', label: 'Prova fissata', short: 'Fissata' },
  { id: 'done', label: 'Prova fatta', short: 'Fatta' },
  { id: 'joined', label: 'Si è iscritta', short: 'Iscritta' },
  { id: 'lost', label: 'Non interessata', short: 'Chiusa' },
];

/** Stati in cui la richiesta è ancora da seguire. */
export const LEAD_OPEN: LeadStatus[] = ['new', 'contacted', 'scheduled', 'done'];

/** Quanto si tengono le richieste (mesi): scritto anche nell'informativa privacy. */
export const LEAD_KEEP_MONTHS = 12;

const fail = (error: Err, message?: string): { ok: false; error: Err; message?: string } => ({ ok: false, error, message });
const digits = (s: string) => s.replace(/\D/g, '');
/** Chiave per riconoscere lo stesso numero scritto con o senza +39: le ultime 10 cifre. */
export const phoneKey = (s: string) => digits(s).slice(-10);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface LeadInput { kind?: LeadKind; topic: Id; name: string; phone: string; email?: string; slots?: string[]; note?: string; consent?: boolean }

/** Controlla e pulisce i dati arrivati dal modulo. */
export function cleanLead(i: LeadInput, topics: Id[]): Result<{ lead: Pick<Lead, 'kind' | 'topic' | 'name' | 'phone' | 'email' | 'slots' | 'note'> }> {
  const name = (i.name ?? '').trim().replace(/\s+/g, ' ');
  const phone = (i.phone ?? '').trim();
  const email = (i.email ?? '').trim().toLowerCase();
  const note = (i.note ?? '').trim().slice(0, 400);
  const topic = (i.topic ?? '').trim();
  if (name.length < 2 || name.length > 80) return fail('invalid', 'Scrivi nome e cognome.');
  if (digits(phone).length < 8 || digits(phone).length > 15 || phone.length > 30) return fail('invalid', 'Controlla il numero di telefono.');
  if (email && (email.length > 120 || !EMAIL.test(email))) return fail('invalid', 'Controlla l’indirizzo email.');
  if (![...topics, NUTRITION].includes(topic)) return fail('invalid', 'Scegli cosa vuoi provare.');
  if (i.consent !== true) return fail('invalid', 'Serve il consenso per poterti ricontattare.');
  const slots = [...new Set((i.slots ?? []).filter((s) => LEAD_SLOTS.some((x) => x.id === s)))];
  return { ok: true, lead: { kind: topic === NUTRITION ? 'nutrition' : 'trial', topic, name, phone, email, slots, note } };
}

/** Aggiunge una richiesta. Se la stessa persona la manda due volte di fila (stesso telefono e stesso argomento, entro 10 minuti) tiene solo la prima. */
export function addLead(d0: Data, o: { input: LeadInput; now: Date; source?: string }): Result<{ data: Data; lead: Lead; duplicate: boolean }> {
  const c = cleanLead(o.input, d0.types.map((t) => t.id));
  if (!c.ok) return c;
  const same = d0.leads.find((l) => phoneKey(l.phone) === phoneKey(c.lead.phone) && l.topic === c.lead.topic && o.now.getTime() - new Date(l.createdAt).getTime() < 10 * MIN);
  if (same) return { ok: true, data: d0, lead: same, duplicate: true };
  const d = structuredClone(d0);
  const lead: Lead = { id: newId('l'), ...c.lead, status: 'new', ownerNote: '', source: o.source ?? 'sito', createdAt: o.now.toISOString(), updatedAt: null };
  d.leads.unshift(lead);
  return { ok: true, data: d, lead, duplicate: false };
}

export function updateLead(d0: Data, o: { id: Id; status?: LeadStatus; ownerNote?: string; now: Date }): Result<{ data: Data; lead: Lead }> {
  const i = d0.leads.findIndex((l) => l.id === o.id);
  if (i < 0) return fail('lead_not_found');
  if (o.status !== undefined && !LEAD_STATUS.some((s) => s.id === o.status)) return fail('invalid');
  const d = structuredClone(d0);
  const l = d.leads[i];
  if (o.status !== undefined) l.status = o.status;
  if (o.ownerNote !== undefined) l.ownerNote = o.ownerNote.slice(0, 1000);
  l.updatedAt = o.now.toISOString();
  return { ok: true, data: d, lead: l };
}

export function removeLead(d0: Data, o: { id: Id }): Result<{ data: Data }> {
  if (!d0.leads.some((l) => l.id === o.id)) return fail('lead_not_found');
  const d = structuredClone(d0);
  d.leads = d.leads.filter((l) => l.id !== o.id);
  return { ok: true, data: d };
}

/** Toglie le richieste più vecchie di LEAD_KEEP_MONTHS mesi (come fa il database). */
export function purgeLeads(d0: Data, now: Date): Data {
  const limit = new Date(now); limit.setMonth(limit.getMonth() - LEAD_KEEP_MONTHS);
  if (!d0.leads.some((l) => new Date(l.createdAt) < limit)) return d0;
  return { ...d0, leads: d0.leads.filter((l) => new Date(l.createdAt) >= limit) };
}

export const leadsNew = (d: Data): Lead[] => d.leads.filter((l) => l.status === 'new');

export const leadLabel = (d: Data, l: Lead): string =>
  l.kind === 'nutrition' ? 'Consulenza nutrizionale' : `Prova ${d.types.find((t) => t.id === l.topic)?.name.toLowerCase() ?? 'gratuita'}`;

/** "3 ore fa", "ieri", "5 giorni fa". */
export function ago(iso: string, now: Date): string {
  const h = Math.max(0, (now.getTime() - new Date(iso).getTime()) / HOUR);
  if (h < 1) return 'pochi minuti fa';
  if (h < 24) { const n = Math.floor(h); return `${n} ${n === 1 ? 'ora' : 'ore'} fa`; }
  const dd = Math.floor(h / 24);
  return dd === 1 ? 'ieri' : `${dd} giorni fa`;
}
