// Soldi del Report dell'owner: incassi nel periodo, confronto col periodo prima, settimane, metodi, pacchetti, rinnovi in vista.
// Funzioni pure, calcolate solo dagli incassi (payments) e dagli abbonamenti già presenti nei dati.
import type { Data, PayMethod, Payment } from './types';
import { METHODS, between, byMonth, totals } from './payments';
import { expiringPasses, passState } from './selectors';
import type { Expiring } from './selectors';
import { addDays, diffDays, mondayOf, romeDay } from './time';

export interface WeekMoney { weekStart: string; cents: number; count: number }
export interface MethodShare { method: PayMethod; label: string; cents: number; count: number; share: number }
export interface PackSales { key: string; name: string; sold: number; cents: number; avgCents: number }
export interface Renewals { count: number; cents: number; /** abbonamenti senza un prezzo di listino noto (pacchetto tolto dal catalogo) */ unpriced: number }

export interface RevenueReport {
  from: string;
  to: string;
  cents: number;
  count: number;
  avgCents: number;
  free: number;
  /** Importo e numero degli incassi stornati nel periodo (non contano nel totale). */
  voided: { cents: number; count: number };
  /** Lo stesso numero di giorni, subito prima. `deltaPct` è null se prima non si era incassato niente. */
  prev: { from: string; to: string; cents: number; count: number };
  deltaPct: number | null;
  month: { cents: number; prevCents: number };
  weekly: WeekMoney[];
  byMethod: MethodShare[];
  perPack: PackSales[];
  renewals: Renewals;
}

/** Numero tondo sopra al massimo, per l'asse del grafico (in centesimi). */
export const niceTop = (cents: number): number => {
  const e = Math.max(cents / 100, 1);
  const steps = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000];
  return (steps.find((x) => x >= e) ?? Math.ceil(e / 100000) * 100000) * 100;
};

/** Abbonamenti che scadono entro `days` giorni e che l'iscritto non ha già rinnovato: sono quelli che potrebbero rientrare. */
export function renewalCandidates(d: Data, now: Date, days = 14): Expiring[] {
  const today = romeDay(now);
  return expiringPasses(d, now, days).filter(({ pass: p, reason }) => {
    if (reason !== 'date') return false;
    const covered = d.passes.some((q) => q.id !== p.id && q.memberId === p.memberId && ['active', 'upcoming'].includes(passState(q, today)) && q.expiresOn >= p.expiresOn && !(q.kind === 'pack' && (q.creditsLeft ?? 0) <= 2));
    return !covered;
  });
}

/** Quanti sono e quanto varrebbero (a prezzo di listino) i rinnovi in arrivo. */
export function renewalsDue(d: Data, now: Date, days = 14): Renewals {
  const price = new Map(d.packs.map((p) => [p.id, p.priceCents]));
  let count = 0, cents = 0, unpriced = 0;
  for (const { pass: p } of renewalCandidates(d, now, days)) {
    count += 1;
    const c = p.packId ? price.get(p.packId) : undefined;
    if (c === undefined) unpriced += 1; else cents += c;
  }
  return { count, cents, unpriced };
}

/** Quanto si è incassato nelle ultime `weeks` settimane (la corrente compresa, fino a oggi). */
export function revenueReport(d: Data, now: Date, weeks: number): RevenueReport {
  const today = romeDay(now);
  const thisMonday = mondayOf(today);
  const from = addDays(thisMonday, -7 * (weeks - 1));
  const days = diffDays(from, today) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(from, -days);

  const list = between(d.payments, from, today);
  const t = totals(list);
  const pt = totals(between(d.payments, prevFrom, prevTo));
  const voidedList = list.filter((p) => p.voidedAt && p.amountCents > 0);

  const weekly: WeekMoney[] = [];
  for (let i = weeks - 1; i >= 0; i--) weekly.push({ weekStart: addDays(thisMonday, -7 * i), cents: 0, count: 0 });
  const idx = new Map(weekly.map((w) => [w.weekStart, w]));
  for (const p of list) {
    if (p.voidedAt || p.amountCents === 0) continue;
    const w = idx.get(mondayOf(romeDay(new Date(p.paidAt))));
    if (w) { w.cents += p.amountCents; w.count += 1; }
  }

  const methodCount = new Map<PayMethod, number>();
  for (const p of list) if (!p.voidedAt && p.amountCents > 0) methodCount.set(p.method, (methodCount.get(p.method) ?? 0) + 1);
  const byMethod: MethodShare[] = METHODS
    .map((m) => ({ method: m.id, label: m.label, cents: t.byMethod[m.id], count: methodCount.get(m.id) ?? 0, share: t.cents ? t.byMethod[m.id] / t.cents : 0 }))
    .filter((m) => m.cents > 0)
    .sort((a, b) => b.cents - a.cents);

  // per pacchetto: gli incassi legati a un abbonamento (vendita); gli altri (quote, lezioni singole…) vanno insieme
  const passPack = new Map(d.passes.map((p) => [p.id, { packId: p.packId, name: p.name }]));
  const packName = new Map(d.packs.map((p) => [p.id, p.name]));
  const rows = new Map<string, PackSales>();
  const bump = (key: string, name: string, p: Payment) => {
    const r = rows.get(key) ?? { key, name, sold: 0, cents: 0, avgCents: 0 };
    r.sold += 1; r.cents += p.amountCents;
    rows.set(key, r);
  };
  for (const p of list) {
    if (p.voidedAt || p.amountCents === 0) continue;
    const pass = p.passId ? passPack.get(p.passId) : undefined;
    if (pass) bump(pass.packId ?? `n:${pass.name}`, (pass.packId ? packName.get(pass.packId) : undefined) ?? pass.name, p);
    else bump('other', 'Altri incassi', p);
  }
  const perPack = [...rows.values()].map((r) => ({ ...r, avgCents: Math.round(r.cents / r.sold) })).sort((a, b) => (a.key === 'other' ? 1 : b.key === 'other' ? -1 : b.cents - a.cents));

  // questo mese fino a oggi, e il mese scorso intero (la stessa cifra che si vede in Incassi)
  const months = byMonth(d.payments, now, 2);

  return {
    from, to: today, cents: t.cents, count: t.count, avgCents: t.count ? Math.round(t.cents / t.count) : 0, free: t.free,
    voided: { cents: voidedList.reduce((n, p) => n + p.amountCents, 0), count: voidedList.length },
    prev: { from: prevFrom, to: prevTo, cents: pt.cents, count: pt.count },
    deltaPct: pt.cents > 0 ? Math.round(((t.cents - pt.cents) / pt.cents) * 100) : null,
    month: { cents: months[1].cents, prevCents: months[0].cents },
    weekly, byMethod, perPack, renewals: renewalsDue(d, now, 14),
  };
}
