// Incassi: registrarli, stornarli, sommarli. Funzioni pure come rules.ts (la stessa logica è in supabase/schema.sql).
import type { Data, Err, Id, Member, PayMethod, Payment, Result } from './types';
import { newId } from './ids';
import { addDays, romeDay, romeHM } from './time';

export const METHODS: readonly { id: PayMethod; label: string }[] = [
  { id: 'cash', label: 'Contanti' },
  { id: 'card', label: 'Carta / POS' },
  { id: 'transfer', label: 'Bonifico' },
  { id: 'other', label: 'Altro' },
];
export const methodLabel = (m: PayMethod) => METHODS.find((x) => x.id === m)?.label ?? m;
export const isMethod = (m: unknown): m is PayMethod => METHODS.some((x) => x.id === m);

/** Tetto di un singolo incasso (10.000 €): oltre è quasi certamente un errore di digitazione. */
export const MAX_CENTS = 1_000_000;

const fail = (error: Err): { ok: false; error: Err } => ({ ok: false, error });

/** Trasforma quello che si scrive in un campo importo ("90", "90,50", "1.200,00") in centesimi. Null se non è un importo. */
export function parseEuro(text: string): number | null {
  let t = text.trim().replace(/\s|€/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); // 1.200 = milleduecento
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return Number.isFinite(cents) && cents <= MAX_CENTS ? cents : null;
}

/** Il contrario di parseEuro, per riempire un campo: 9500 → "95", 9550 → "95,50". */
export const euroField = (cents: number): string => (cents % 100 ? (cents / 100).toFixed(2).replace('.', ',') : String(cents / 100));

/** Registra un incasso che non è la vendita di un abbonamento. Serve un importo maggiore di zero. */
export function addPayment(
  d0: Data,
  o: { memberId: Id | null; amountCents: number; method: PayMethod; note?: string; now: Date; by: { name: string } },
): Result<{ data: Data; payment: Payment }> {
  if (!Number.isInteger(o.amountCents) || o.amountCents < 1 || o.amountCents > MAX_CENTS || !isMethod(o.method)) return fail('invalid');
  if (o.memberId && !d0.members.some((m) => m.id === o.memberId)) return fail('member_not_found');
  const d = structuredClone(d0);
  const payment: Payment = {
    id: newId('y'), memberId: o.memberId, passId: null, amountCents: o.amountCents, method: o.method,
    note: (o.note ?? '').trim().slice(0, 200), paidAt: o.now.toISOString(), byName: o.by.name, voidedAt: null,
  };
  d.payments.push(payment);
  return { ok: true, data: d, payment };
}

/** Storna un incasso (o lo ripristina con void = false). Resta in elenco ma non conta nei totali. */
export function voidPayment(d0: Data, o: { paymentId: Id; now: Date; void?: boolean }): Result<{ data: Data }> {
  if (!d0.payments.some((p) => p.id === o.paymentId)) return fail('payment_not_found');
  const d = structuredClone(d0);
  const p = d.payments.find((x) => x.id === o.paymentId)!;
  p.voidedAt = o.void === false ? null : p.voidedAt ?? o.now.toISOString();
  return { ok: true, data: d };
}

// ---------------------------------------------------------------------------------------------- totali

export interface Totals { cents: number; count: number; free: number; byMethod: Record<PayMethod, number> }

/** Somma gli incassi validi (gli stornati non contano). Gli omaggi (importo 0) si contano a parte. */
export function totals(list: readonly Payment[]): Totals {
  const t: Totals = { cents: 0, count: 0, free: 0, byMethod: { cash: 0, card: 0, transfer: 0, other: 0 } };
  for (const p of list) {
    if (p.voidedAt) continue;
    if (p.amountCents === 0) { t.free += 1; continue; }
    t.cents += p.amountCents; t.count += 1; t.byMethod[p.method] += p.amountCents;
  }
  return t;
}

/** Incassi di un giorno (giorno di Roma), dal più recente. */
export function paymentsOn(d: Data, day: string): Payment[] {
  return d.payments.filter((p) => romeDay(new Date(p.paidAt)) === day).sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}

export const monthOf = (day: string) => day.slice(0, 7);

export interface MonthTotal { month: string; cents: number; count: number }

/** Totale per mese degli ultimi `n` mesi (compreso quello di `now`), dal più vecchio. */
export function byMonth(list: readonly Payment[], now: Date, n: number): MonthTotal[] {
  const [y, m] = monthOf(romeDay(now)).split('-').map(Number);
  const months: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const t = y * 12 + (m - 1) - i;
    months.push(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`);
  }
  const out = new Map(months.map((k) => [k, { month: k, cents: 0, count: 0 }]));
  for (const p of list) {
    if (p.voidedAt || p.amountCents === 0) continue;
    const row = out.get(monthOf(romeDay(new Date(p.paidAt))));
    if (row) { row.cents += p.amountCents; row.count += 1; }
  }
  return months.map((k) => out.get(k)!);
}

/** Incassi da `from` a `to` inclusi (giorni di Roma). */
export function between(list: readonly Payment[], from: string, to: string): Payment[] {
  return list.filter((p) => { const day = romeDay(new Date(p.paidAt)); return day >= from && day <= to; });
}

/** Incassi dell'ultima settimana, di oggi compreso. */
export const lastDays = (list: readonly Payment[], now: Date, days: number): Payment[] => {
  const today = romeDay(now);
  return between(list, addDays(today, -(days - 1)), today);
};

// ---------------------------------------------------------------------------------------------- esportazione

const cell = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Gli incassi come CSV per Excel in italiano (separatore ;, virgola decimale, accenti leggibili). Dal più vecchio al più recente. */
export function paymentsCsv(list: readonly Payment[], members: readonly Pick<Member, 'id' | 'name'>[]): string {
  const name = new Map(members.map((m) => [m.id, m.name]));
  const rows: string[][] = [['Data', 'Ora', 'Iscritto', 'Descrizione', 'Metodo', 'Importo (€)', 'Stato', 'Registrato da']];
  for (const p of [...list].sort((a, b) => a.paidAt.localeCompare(b.paidAt))) {
    const day = romeDay(new Date(p.paidAt));
    rows.push([`${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)}`, romeHM(new Date(p.paidAt)), p.memberId ? name.get(p.memberId) ?? '' : '', p.note, methodLabel(p.method), (p.amountCents / 100).toFixed(2).replace('.', ','), p.voidedAt ? 'Stornato' : p.amountCents === 0 ? 'Omaggio' : '', p.byName]);
  }
  return '\ufeff' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}
