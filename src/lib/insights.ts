// Cose da fare, ricavate dai dati: servono alle pagine "Fai prima" delle aree. Funzioni pure, nessuna modifica ai dati.
import type { Data, Id, Member, Pass, Session } from './types';
import { counts } from './rules';
import { passState } from './selectors';
import { teaches } from './access';
import { addDays, endOf, mondayOf, romeDay } from './time';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

export interface ToMark { session: Session; unmarked: number }

/** Lezioni già finite (negli ultimi `days` giorni) con prenotazioni su cui nessuno ha ancora segnato presente o assente. Le più recenti per prime. */
export function attendanceToMark(d: Data, now: Date, days = 7): ToMark[] {
  const from = addDays(romeDay(now), -days);
  const out: ToMark[] = [];
  for (const s of d.sessions) {
    if (s.status !== 'scheduled' || endOf(s.startsAt, s.duration) > now.getTime() || romeDay(new Date(s.startsAt)) < from) continue;
    const unmarked = d.bookings.filter((b) => b.sessionId === s.id && b.status === 'booked').length;
    if (unmarked > 0) out.push({ session: s, unmarked });
  }
  return out.sort((a, b) => b.session.startsAt.localeCompare(a.session.startsAt));
}

export interface LowFill { session: Session; booked: number }

/** Lezioni dei prossimi `days` giorni con pochi iscritti (al massimo `maxFill` dei posti): quelle da riempire. */
export function lowFillSoon(d: Data, now: Date, days = 3, maxFill = 0.3): LowFill[] {
  const last = addDays(romeDay(now), days);
  const out: LowFill[] = [];
  for (const s of d.sessions) {
    if (s.status !== 'scheduled' || new Date(s.startsAt).getTime() <= now.getTime() || romeDay(new Date(s.startsAt)) > last || s.capacity <= 0) continue;
    const booked = counts(d, s.id).booked;
    if (booked / s.capacity <= maxFill) out.push({ session: s, booked });
  }
  return out.sort((a, b) => a.session.startsAt.localeCompare(b.session.startsAt));
}

export interface Dormant { member: Member; pass: Pass; /** Ultimo giorno in cui aveva una lezione (null se non ha mai prenotato). */ lastOn: string | null; daysIdle: number }

/**
 * Iscritti con un abbonamento valido che non vengono da almeno `days` giorni e non hanno lezioni prenotate più avanti.
 * Chi non ha mai prenotato conta dal giorno in cui è iniziato il suo abbonamento. I più fermi per primi.
 */
export function dormantMembers(d: Data, now: Date, days = 30): Dormant[] {
  const today = romeDay(now);
  const day = new Map(d.sessions.map((s) => [s.id, romeDay(new Date(s.startsAt))]));
  const out: Dormant[] = [];
  for (const m of d.members) {
    if (m.role !== 'client') continue;
    const active = d.passes.filter((p) => p.memberId === m.id && passState(p, today) === 'active');
    if (active.length === 0) continue;
    let lastOn: string | null = null;
    let upcoming = false;
    for (const b of d.bookings) {
      if (b.memberId !== m.id || !['booked', 'attended', 'no_show'].includes(b.status)) continue;
      const on = day.get(b.sessionId);
      if (!on) continue;
      if (on >= today && b.status === 'booked') upcoming = true;
      if (on <= today && (lastOn === null || on > lastOn)) lastOn = on;
    }
    if (upcoming) continue;
    const since = lastOn ?? active.map((p) => p.startsOn).sort()[0];
    const idle = Math.round((new Date(`${today}T12:00:00Z`).getTime() - new Date(`${since}T12:00:00Z`).getTime()) / 86400000);
    if (idle >= days) out.push({ member: m, pass: active[0], lastOn, daysIdle: idle });
  }
  return out.sort((a, b) => b.daysIdle - a.daysIdle || a.member.name.localeCompare(b.member.name));
}

export interface TrainerRow {
  /** Il nome come compare nell'orario (o quello dell'account Trainer, se c'è). */
  name: string;
  memberId: Id | null;
  sessions: number;
  booked: number;
  seats: number;
  fill: number;
  attended: number;
  noShow: number;
}

/** Numeri per istruttore nelle ultime `weeks` settimane (lezioni già svolte). Le lezioni col nome di un Trainer del team vanno al suo account. */
export function trainerStats(d: Data, now: Date, weeks = 8): TrainerRow[] {
  const today = romeDay(now);
  const from = addDays(mondayOf(today), -7 * (weeks - 1));
  const trainers = d.members.filter((m) => m.role === 'trainer');
  const rows = new Map<string, TrainerRow>();
  for (const s of d.sessions) {
    if (s.status !== 'scheduled' || endOf(s.startsAt, s.duration) > now.getTime() || romeDay(new Date(s.startsAt)) < from) continue;
    const t = trainers.find((m) => teaches(m, s));
    const key = t ? t.id : norm(s.trainer) || '-';
    const row = rows.get(key) ?? { name: t ? t.name : s.trainer.trim() || 'Senza istruttore', memberId: t?.id ?? null, sessions: 0, booked: 0, seats: 0, fill: 0, attended: 0, noShow: 0 };
    row.sessions += 1;
    row.booked += counts(d, s.id).booked;
    row.seats += s.capacity;
    for (const b of d.bookings) {
      if (b.sessionId !== s.id) continue;
      if (b.status === 'attended') row.attended += 1;
      else if (b.status === 'no_show') row.noShow += 1;
    }
    rows.set(key, row);
  }
  for (const r of rows.values()) r.fill = r.seats ? r.booked / r.seats : 0;
  return [...rows.values()].sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
}

export interface Unlinked { name: string; lessons: number }

/** Istruttori scritti nell'orario (prossimi `days` giorni) che non hanno un account Trainer: non vedono le loro lezioni nell'app. */
export function unlinkedInstructors(d: Data, now: Date, days = 14): Unlinked[] {
  const last = addDays(romeDay(now), days);
  const trainers = d.members.filter((m) => m.role === 'trainer');
  const rows = new Map<string, Unlinked>();
  for (const s of d.sessions) {
    if (s.status !== 'scheduled' || new Date(s.startsAt).getTime() <= now.getTime() || romeDay(new Date(s.startsAt)) > last || !norm(s.trainer)) continue;
    if (trainers.some((m) => teaches(m, s))) continue;
    const key = norm(s.trainer);
    const r = rows.get(key) ?? { name: s.trainer.trim(), lessons: 0 };
    r.lessons += 1;
    rows.set(key, r);
  }
  return [...rows.values()].sort((a, b) => b.lessons - a.lessons || a.name.localeCompare(b.name));
}

/** Iscritti con almeno un abbonamento valido oggi. */
export function activeClients(d: Data, now: Date): number {
  const today = romeDay(now);
  const ids = new Set(d.passes.filter((p) => passState(p, today) === 'active').map((p) => p.memberId));
  return d.members.filter((m) => m.role === 'client' && ids.has(m.id)).length;
}

/** Lezioni dei prossimi `days` giorni con persone in lista d'attesa, in ordine di orario. */
export function waitlistSoon(d: Data, now: Date, days = 7): Session[] {
  const last = addDays(romeDay(now), days);
  return d.sessions
    .filter((s) => s.status === 'scheduled' && new Date(s.startsAt).getTime() >= now.getTime() && romeDay(new Date(s.startsAt)) <= last && counts(d, s.id).waitlist > 0)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
