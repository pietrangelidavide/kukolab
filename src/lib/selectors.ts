// Letture dei dati per le schermate (nessuna modifica).
import type { Booking, CourseType, Data, Id, Member, Pass, Session } from './types';
import { counts, passUsable, pickPass, seatsLeft, waitlistOf } from './rules';
import { HOUR, MIN, addDays, endOf, mondayOf, romeDay, startOf } from './time';

export type SlotState = 'open' | 'full' | 'closed' | 'cancelled' | 'past';

export interface SessionView {
  session: Session;
  type: CourseType;
  booked: number;
  waitlist: number;
  seatsLeft: number;
  state: SlotState;
  mine: Booking | null; // la mia prenotazione attiva (prenotata o in lista)
  position: number | null; // posizione in lista d'attesa
  eligible: boolean; // ho un abbonamento valido per questa lezione
  lateCancel: boolean; // se annullo adesso perdo la lezione
}

const ACTIVE = new Set(['booked', 'waitlist', 'attended', 'no_show']);

export function typeOf(d: Data, id: Id): CourseType {
  return d.types.find((t) => t.id === id) ?? { id, name: 'Lezione', capacity: 1, duration: 50, tone: 'white' };
}

export function memberOf(d: Data, id: Id): Member | undefined {
  return d.members.find((m) => m.id === id);
}

export function slotState(d: Data, s: Session, now: Date): SlotState {
  if (s.status === 'cancelled') return 'cancelled';
  const t = now.getTime();
  if (t >= endOf(s.startsAt, s.duration)) return 'past';
  if (t >= startOf(s.startsAt) - d.settings.bookingCloseMinutes * MIN) return 'closed';
  return seatsLeft(d, s) <= 0 ? 'full' : 'open';
}

export function viewSession(d: Data, s: Session, memberId: Id | null, now: Date): SessionView {
  const c = counts(d, s.id);
  const mine = memberId ? d.bookings.find((b) => b.sessionId === s.id && b.memberId === memberId && ACTIVE.has(b.status)) ?? null : null;
  let position: number | null = null;
  if (mine?.status === 'waitlist') {
    position = mine.position ?? waitlistOf(d, s.id).findIndex((b) => b.id === mine.id) + 1;
    if (!position) position = null;
  }
  return {
    session: s,
    type: typeOf(d, s.typeId),
    booked: c.booked,
    waitlist: c.waitlist,
    seatsLeft: Math.max(0, s.capacity - c.booked),
    state: slotState(d, s, now),
    mine,
    position,
    eligible: memberId ? pickPass(d, memberId, s) !== null : false,
    lateCancel: startOf(s.startsAt) - now.getTime() < d.settings.cancelWindowHours * HOUR,
  };
}

export function sessionsOnDay(d: Data, day: string): Session[] {
  return d.sessions.filter((s) => romeDay(new Date(s.startsAt)) === day).sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
}

export function myBookings(d: Data, memberId: Id, now: Date): { upcoming: { booking: Booking; session: Session }[]; past: { booking: Booking; session: Session }[] } {
  const sessions = new Map(d.sessions.map((s) => [s.id, s]));
  const rows = d.bookings
    .filter((b) => b.memberId === memberId)
    .map((b) => ({ booking: b, session: sessions.get(b.sessionId)! }))
    .filter((r) => r.session);
  const t = now.getTime();
  const upcoming = rows
    .filter((r) => (r.booking.status === 'booked' || r.booking.status === 'waitlist') && r.session.status === 'scheduled' && endOf(r.session.startsAt, r.session.duration) > t)
    .sort((a, b) => a.session.startsAt.localeCompare(b.session.startsAt));
  const past = rows
    .filter((r) => !upcoming.includes(r))
    .sort((a, b) => b.session.startsAt.localeCompare(a.session.startsAt));
  return { upcoming, past };
}

export function passesOf(d: Data, memberId: Id): Pass[] {
  return d.passes.filter((p) => p.memberId === memberId).sort((a, b) => b.expiresOn.localeCompare(a.expiresOn));
}

export type PassState = 'active' | 'upcoming' | 'expired' | 'empty';

export function passState(p: Pass, today: string): PassState {
  if (today > p.expiresOn) return 'expired';
  if (p.kind === 'pack' && (p.creditsLeft ?? 0) <= 0) return 'empty';
  if (today < p.startsOn) return 'upcoming';
  return 'active';
}

export function activePasses(d: Data, memberId: Id, now: Date): Pass[] {
  const today = romeDay(now);
  return passesOf(d, memberId).filter((p) => passState(p, today) === 'active' || passState(p, today) === 'upcoming');
}

/** Stato sintetico per l'elenco iscritti. */
export function memberStatus(d: Data, memberId: Id, now: Date): { label: string; tone: 'ok' | 'warn' | 'none'; detail: string } {
  const today = romeDay(now);
  const act = passesOf(d, memberId).filter((p) => passState(p, today) === 'active');
  if (act.length === 0) {
    const any = passesOf(d, memberId).length > 0;
    return { label: any ? 'Scaduto' : 'Nessun abbonamento', tone: 'none', detail: '' };
  }
  const packs = act.filter((p) => p.kind === 'pack');
  const credits = packs.reduce((n, p) => n + (p.creditsLeft ?? 0), 0);
  const monthly = act.find((p) => p.kind === 'monthly');
  const soon = act.some((p) => p.expiresOn <= addDays(today, 7) || (p.kind === 'pack' && (p.creditsLeft ?? 0) <= 2));
  const detail = [monthly ? `${monthly.name} fino al ${monthly.expiresOn.slice(8)}/${monthly.expiresOn.slice(5, 7)}` : '', packs.length ? `${credits} lezioni` : ''].filter(Boolean).join(' · ');
  return { label: 'Attivo', tone: soon ? 'warn' : 'ok', detail };
}

export function rosterOf(d: Data, sessionId: Id): { booking: Booking; member: Member }[] {
  const order = (b: Booking) => (b.status === 'waitlist' ? 1 : 0);
  return d.bookings
    .filter((b) => b.sessionId === sessionId && ACTIVE.has(b.status))
    .map((b) => ({ booking: b, member: memberOf(d, b.memberId)! }))
    .filter((r) => r.member)
    .sort((a, b) => order(a.booking) - order(b.booking) || a.booking.createdAt.localeCompare(b.booking.createdAt));
}

export interface Kpi { sessions: number; booked: number; seats: number; fill: number }

/** Riempimento delle lezioni tra due giorni (inclusi), escluse quelle annullate. */
export function kpiBetween(d: Data, from: string, to: string): Kpi {
  let sessions = 0, booked = 0, seats = 0;
  for (const s of d.sessions) {
    const day = romeDay(new Date(s.startsAt));
    if (day < from || day > to || s.status === 'cancelled') continue;
    sessions += 1;
    seats += s.capacity;
    booked += counts(d, s.id).booked;
  }
  return { sessions, booked, seats, fill: seats ? booked / seats : 0 };
}

export interface WeekRow { weekStart: string; byType: Record<Id, number>; total: number }

/** Prenotazioni (posti occupati) per settimana e per corso. */
export function weeklyBookings(d: Data, weeks: number, now: Date): WeekRow[] {
  const thisMonday = mondayOf(romeDay(now));
  const rows: WeekRow[] = [];
  for (let i = weeks - 1; i >= 0; i--) rows.push({ weekStart: addDays(thisMonday, -7 * i), byType: {}, total: 0 });
  const idx = new Map(rows.map((r) => [r.weekStart, r]));
  const sessions = new Map(d.sessions.map((s) => [s.id, s]));
  for (const b of d.bookings) {
    if (b.status !== 'booked' && b.status !== 'attended' && b.status !== 'no_show') continue;
    const s = sessions.get(b.sessionId);
    if (!s || s.status === 'cancelled') continue;
    const row = idx.get(mondayOf(romeDay(new Date(s.startsAt))));
    if (!row) continue;
    row.byType[s.typeId] = (row.byType[s.typeId] ?? 0) + 1;
    row.total += 1;
  }
  return rows;
}

export interface Expiring { pass: Pass; member: Member; reason: 'date' | 'credits' }

/** Abbonamenti in scadenza (entro N giorni) o quasi finiti (<= 2 lezioni). */
export function expiringPasses(d: Data, now: Date, days = 7): Expiring[] {
  const today = romeDay(now);
  const limit = addDays(today, days);
  const out: Expiring[] = [];
  for (const p of d.passes) {
    if (passState(p, today) !== 'active') continue;
    const m = memberOf(d, p.memberId);
    if (!m) continue;
    if (p.expiresOn <= limit) out.push({ pass: p, member: m, reason: 'date' });
    else if (p.kind === 'pack' && (p.creditsLeft ?? 0) <= 2) out.push({ pass: p, member: m, reason: 'credits' });
  }
  return out.sort((a, b) => a.pass.expiresOn.localeCompare(b.pass.expiresOn));
}

export function unreadNotices(d: Data, memberId: Id) {
  return d.notices.filter((n) => n.memberId === memberId && !n.read).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export { passUsable };
