// Regole di prenotazione di KUKO LAB. Funzioni pure: prendono i dati, restituiscono i dati nuovi (o un errore).
// La stessa logica è nelle funzioni SQL di supabase/schema.sql: se cambia una, cambia anche l'altra.
import type { Booking, Data, Err, Id, Member, Pack, Pass, Result, Session, Template } from './types';
import { newId } from './ids';
import { HOUR, MIN, addDays, eachDay, endOf, mondayOf, romeDay, romeWall, startOf, whenIt } from './time';

export interface Actor { role: 'client' | 'owner'; memberId: Id }

const SEAT = new Set(['booked', 'attended', 'no_show']);
const WEEK_CHARGED = new Set(['booked', 'attended', 'no_show', 'late_cancelled']);
const fail = (error: Err): { ok: false; error: Err } => ({ ok: false, error });

export const holdsSeat = (b: Booking) => SEAT.has(b.status);

export function counts(d: Data, sessionId: Id): { booked: number; waitlist: number } {
  if (d.counts?.[sessionId]) return d.counts[sessionId];
  let booked = 0, waitlist = 0;
  for (const b of d.bookings) {
    if (b.sessionId !== sessionId) continue;
    if (SEAT.has(b.status)) booked += 1;
    else if (b.status === 'waitlist') waitlist += 1;
  }
  return { booked, waitlist };
}

export function seatsLeft(d: Data, s: Session): number {
  return Math.max(0, s.capacity - counts(d, s.id).booked);
}

/** Lista d'attesa di una lezione, in ordine di arrivo. */
export function waitlistOf(d: Data, sessionId: Id): Booking[] {
  return d.bookings
    .filter((b) => b.sessionId === sessionId && b.status === 'waitlist')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

function sessionDay(s: Session): string {
  return romeDay(new Date(s.startsAt));
}

/** L'abbonamento può pagare questa lezione? */
export function passUsable(d: Data, pass: Pass, s: Session): boolean {
  const day = sessionDay(s);
  if (pass.typeIds.length > 0 && !pass.typeIds.includes(s.typeId)) return false;
  if (day < pass.startsOn || day > pass.expiresOn) return false;
  if (pass.kind === 'pack') return (pass.creditsLeft ?? 0) > 0;
  if (pass.weeklyLimit != null) {
    const wk = mondayOf(day);
    const sessions = new Map(d.sessions.map((x) => [x.id, x]));
    let used = 0;
    for (const b of d.bookings) {
      if (b.passId !== pass.id || !WEEK_CHARGED.has(b.status)) continue;
      const bs = sessions.get(b.sessionId);
      if (bs && mondayOf(sessionDay(bs)) === wk) used += 1;
    }
    if (used >= pass.weeklyLimit) return false;
  }
  return true;
}

/** Sceglie l'abbonamento da usare: quello che scade prima. */
export function pickPass(d: Data, memberId: Id, s: Session): Pass | null {
  const usable = d.passes
    .filter((p) => p.memberId === memberId && passUsable(d, p, s))
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return usable[0] ?? null;
}

function overlaps(d: Data, memberId: Id, s: Session, exceptSessionId?: Id): boolean {
  const a0 = startOf(s.startsAt), a1 = endOf(s.startsAt, s.duration);
  const sessions = new Map(d.sessions.map((x) => [x.id, x]));
  return d.bookings.some((b) => {
    if (b.memberId !== memberId || !SEAT.has(b.status) || b.sessionId === s.id || b.sessionId === exceptSessionId) return false;
    const o = sessions.get(b.sessionId);
    if (!o || o.status !== 'scheduled') return false;
    return startOf(o.startsAt) < a1 && endOf(o.startsAt, o.duration) > a0;
  });
}

const typeName = (d: Data, s: Session) => d.types.find((t) => t.id === s.typeId)?.name ?? 'Lezione';

function notice(d: Data, memberId: Id, kind: 'promoted' | 'session_cancelled' | 'info', text: string, now: Date) {
  d.notices.push({ id: newId('n'), memberId, kind, text, createdAt: now.toISOString(), read: false });
}

function charge(d: Data, passId: Id | null) {
  if (!passId) return;
  const p = d.passes.find((x) => x.id === passId);
  if (p && p.kind === 'pack' && p.creditsLeft != null) p.creditsLeft = Math.max(0, p.creditsLeft - 1);
}

function refund(d: Data, passId: Id | null) {
  if (!passId) return;
  const p = d.passes.find((x) => x.id === passId);
  if (p && p.kind === 'pack' && p.creditsLeft != null && p.creditsTotal != null) p.creditsLeft = Math.min(p.creditsTotal, p.creditsLeft + 1);
}

// ---------------------------------------------------------------------------------------------

export function book(
  d0: Data,
  o: { memberId: Id; sessionId: Id; now: Date; actor: Actor; allowNoPass?: boolean },
): Result<{ data: Data; booking: Booking }> {
  const { memberId, sessionId, now, actor } = o;
  if (actor.role === 'client' && actor.memberId !== memberId) return fail('forbidden');
  if (!d0.members.some((m) => m.id === memberId)) return fail('member_not_found');
  const s0 = d0.sessions.find((x) => x.id === sessionId);
  if (!s0) return fail('session_not_found');
  if (s0.status === 'cancelled') return fail('session_cancelled');
  const owner = actor.role === 'owner';
  const start = startOf(s0.startsAt);
  if (!owner) {
    if (now.getTime() >= start - d0.settings.bookingCloseMinutes * MIN) return fail('booking_closed');
    if (start > now.getTime() + d0.settings.bookingHorizonDays * 24 * HOUR) return fail('too_far');
  }
  const dup = d0.bookings.find((b) => b.sessionId === sessionId && b.memberId === memberId && (SEAT.has(b.status) || b.status === 'waitlist'));
  if (dup) return fail(dup.status === 'waitlist' ? 'on_waitlist' : 'already_booked');
  if (overlaps(d0, memberId, s0)) return fail('overlap');
  const pass = pickPass(d0, memberId, s0);
  if (!pass && !(owner && o.allowNoPass)) return fail('no_pass');
  const left = seatsLeft(d0, s0);
  if (left <= 0 && !d0.settings.waitlistEnabled) return fail('full');

  const d = structuredClone(d0);
  const full = left <= 0;
  const b: Booking = {
    id: newId('b'), sessionId, memberId, status: full ? 'waitlist' : 'booked', passId: full ? null : pass?.id ?? null,
    createdAt: now.toISOString(), cancelledAt: null, promotedAt: null,
  };
  if (!full) charge(d, b.passId);
  d.bookings.push(b);
  return { ok: true, data: d, booking: b };
}

/** Porta in lezione chi è in lista d'attesa, finché ci sono posti. Salta chi non ha un abbonamento valido o ha un'altra lezione. */
function promote(d: Data, s: Session, now: Date): Booking[] {
  const promoted: Booking[] = [];
  if (s.status !== 'scheduled' || now.getTime() >= startOf(s.startsAt)) return promoted;
  for (const w of waitlistOf(d, s.id)) {
    if (seatsLeft(d, s) <= 0) break;
    const pass = pickPass(d, w.memberId, s);
    if (!pass || overlaps(d, w.memberId, s)) continue;
    w.status = 'booked';
    w.passId = pass.id;
    w.promotedAt = now.toISOString();
    charge(d, pass.id);
    notice(d, w.memberId, 'promoted', `Si è liberato un posto: sei dentro a ${typeName(d, s)}, ${whenIt(s.startsAt)}.`, now);
    promoted.push(w);
  }
  return promoted;
}

export function promoteWaitlist(d0: Data, sessionId: Id, now: Date): Result<{ data: Data; promoted: number }> {
  const s = d0.sessions.find((x) => x.id === sessionId);
  if (!s) return fail('session_not_found');
  const d = structuredClone(d0);
  const n = promote(d, d.sessions.find((x) => x.id === sessionId)!, now).length;
  return { ok: true, data: d, promoted: n };
}

export function cancelBooking(
  d0: Data,
  o: { bookingId: Id; now: Date; actor: Actor },
): Result<{ data: Data; status: 'cancelled' | 'late_cancelled'; refunded: boolean; promoted: number }> {
  const { bookingId, now, actor } = o;
  const b0 = d0.bookings.find((x) => x.id === bookingId);
  if (!b0) return fail('booking_not_found');
  if (actor.role === 'client' && b0.memberId !== actor.memberId) return fail('forbidden');
  if (b0.status !== 'booked' && b0.status !== 'waitlist') return fail('not_cancellable');
  const s0 = d0.sessions.find((x) => x.id === b0.sessionId);
  if (!s0) return fail('session_not_found');
  const owner = actor.role === 'owner';
  if (!owner && now.getTime() >= startOf(s0.startsAt)) return fail('session_started');

  const d = structuredClone(d0);
  const b = d.bookings.find((x) => x.id === bookingId)!;
  const s = d.sessions.find((x) => x.id === b.sessionId)!;
  const wasSeat = b.status === 'booked';
  const late = !owner && wasSeat && startOf(s.startsAt) - now.getTime() < d.settings.cancelWindowHours * HOUR;
  b.status = late ? 'late_cancelled' : 'cancelled';
  b.cancelledAt = now.toISOString();
  const refunded = wasSeat && !late;
  if (refunded) refund(d, b.passId);
  const promoted = wasSeat ? promote(d, s, now).length : 0;
  return { ok: true, data: d, status: b.status as 'cancelled' | 'late_cancelled', refunded, promoted };
}

/** L'owner annulla una lezione: tutti vengono rimborsati e avvisati. */
export function cancelSession(d0: Data, o: { sessionId: Id; now: Date }): Result<{ data: Data; affected: number }> {
  const s0 = d0.sessions.find((x) => x.id === o.sessionId);
  if (!s0) return fail('session_not_found');
  if (s0.status === 'cancelled') return fail('session_cancelled');
  const d = structuredClone(d0);
  const s = d.sessions.find((x) => x.id === o.sessionId)!;
  s.status = 'cancelled';
  let affected = 0;
  for (const b of d.bookings) {
    if (b.sessionId !== s.id) continue;
    if (b.status === 'booked') {
      b.status = 'cancelled'; b.cancelledAt = o.now.toISOString(); refund(d, b.passId); affected += 1;
      notice(d, b.memberId, 'session_cancelled', `${typeName(d, s)} di ${whenIt(s.startsAt)} è stato annullato. La lezione è tornata nel tuo abbonamento.`, o.now);
    } else if (b.status === 'waitlist') {
      b.status = 'cancelled'; b.cancelledAt = o.now.toISOString(); affected += 1;
      notice(d, b.memberId, 'session_cancelled', `${typeName(d, s)} di ${whenIt(s.startsAt)} è stato annullato.`, o.now);
    }
  }
  return { ok: true, data: d, affected };
}

export function markAttendance(d0: Data, o: { bookingId: Id; status: 'attended' | 'no_show' | 'booked' }): Result<{ data: Data }> {
  const b0 = d0.bookings.find((x) => x.id === o.bookingId);
  if (!b0) return fail('booking_not_found');
  if (!SEAT.has(b0.status)) return fail('not_cancellable');
  const d = structuredClone(d0);
  d.bookings.find((x) => x.id === o.bookingId)!.status = o.status;
  return { ok: true, data: d };
}

/** Cambia capienza, istruttore, note o orario di una lezione. Se si libera spazio, scala la lista d'attesa. */
export function editSession(
  d0: Data,
  o: { sessionId: Id; now: Date; patch: Partial<Pick<Session, 'capacity' | 'trainer' | 'note' | 'startsAt' | 'duration'>> },
): Result<{ data: Data; promoted: number }> {
  const s0 = d0.sessions.find((x) => x.id === o.sessionId);
  if (!s0) return fail('session_not_found');
  const p = o.patch;
  if (p.capacity != null && (!Number.isInteger(p.capacity) || p.capacity < 1 || p.capacity < counts(d0, s0.id).booked)) return fail('invalid');
  if (p.duration != null && (!Number.isInteger(p.duration) || p.duration < 10)) return fail('invalid');
  const d = structuredClone(d0);
  const s = d.sessions.find((x) => x.id === o.sessionId)!;
  const moved = p.startsAt != null && p.startsAt !== s.startsAt;
  Object.assign(s, p);
  if (moved) {
    for (const b of d.bookings) {
      if (b.sessionId === s.id && (b.status === 'booked' || b.status === 'waitlist')) notice(d, b.memberId, 'info', `${typeName(d, s)} è stato spostato a ${whenIt(s.startsAt)}.`, o.now);
    }
  }
  const promoted = promote(d, s, o.now).length;
  return { ok: true, data: d, promoted };
}

/** Crea una lezione singola (fuori dall'orario settimanale). */
export function addSession(
  d0: Data,
  o: { typeId: Id; startsAt: string; capacity: number; duration: number; trainer: string; note?: string },
): Result<{ data: Data; session: Session }> {
  if (!d0.types.some((t) => t.id === o.typeId) || !Number.isInteger(o.capacity) || o.capacity < 1 || Number.isNaN(new Date(o.startsAt).getTime())) return fail('invalid');
  const d = structuredClone(d0);
  const s: Session = { id: newId('s'), typeId: o.typeId, startsAt: new Date(o.startsAt).toISOString(), duration: o.duration, capacity: o.capacity, trainer: o.trainer, status: 'scheduled', templateId: null, note: o.note ?? '' };
  d.sessions.push(s);
  return { ok: true, data: d, session: s };
}

/** Vende un pacchetto a un iscritto. */
export function assignPass(
  d0: Data,
  o: { memberId: Id; packId: Id; startsOn: string; now: Date; note?: string },
): Result<{ data: Data; pass: Pass }> {
  if (!d0.members.some((m) => m.id === o.memberId)) return fail('member_not_found');
  const pack: Pack | undefined = d0.packs.find((p) => p.id === o.packId);
  if (!pack) return fail('pack_not_found');
  const d = structuredClone(d0);
  const pass: Pass = {
    id: newId('p'), memberId: o.memberId, packId: pack.id, name: pack.name, kind: pack.kind,
    creditsTotal: pack.kind === 'pack' ? pack.lessons ?? 0 : null, creditsLeft: pack.kind === 'pack' ? pack.lessons ?? 0 : null,
    startsOn: o.startsOn, expiresOn: addDays(o.startsOn, Math.max(1, pack.validityDays) - 1),
    typeIds: [...pack.typeIds], weeklyLimit: pack.weeklyLimit, note: o.note ?? '', createdAt: o.now.toISOString(),
  };
  d.passes.push(pass);
  return { ok: true, data: d, pass };
}

/** Correzione manuale dei crediti di un pacchetto lezioni. */
export function adjustCredits(d0: Data, o: { passId: Id; delta: number }): Result<{ data: Data }> {
  const p0 = d0.passes.find((x) => x.id === o.passId);
  if (!p0) return fail('pass_not_found');
  if (p0.kind !== 'pack' || p0.creditsLeft == null) return fail('invalid');
  const d = structuredClone(d0);
  const p = d.passes.find((x) => x.id === o.passId)!;
  p.creditsLeft = Math.max(0, (p.creditsLeft ?? 0) + o.delta);
  p.creditsTotal = Math.max(p.creditsTotal ?? 0, p.creditsLeft);
  return { ok: true, data: d };
}

/** Crea le lezioni dall'orario settimanale nell'intervallo [from, to] (giorni di Roma). Non duplica quelle già presenti. */
export function generateSessions(d0: Data, o: { from: string; to: string }): { data: Data; created: number } {
  const d = structuredClone(d0);
  const have = new Set(d.sessions.filter((s) => s.templateId).map((s) => `${s.templateId}|${new Date(s.startsAt).getTime()}`));
  let created = 0;
  for (const day of eachDay(o.from, o.to)) {
    const wd = ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
    for (const t of d.templates as Template[]) {
      if (!t.active || t.weekday !== wd) continue;
      const when = romeWall(day, t.time);
      const key = `${t.id}|${when.getTime()}`;
      if (have.has(key)) continue;
      have.add(key);
      d.sessions.push({ id: newId('s'), typeId: t.typeId, startsAt: when.toISOString(), duration: t.duration, capacity: t.capacity, trainer: t.trainer, status: 'scheduled', templateId: t.id, note: '' });
      created += 1;
    }
  }
  return { data: d, created };
}

export function newMember(d0: Data, o: { name: string; email?: string; phone?: string; role?: Member['role']; now: Date }): Result<{ data: Data; member: Member }> {
  const name = o.name.trim();
  if (!name) return fail('invalid');
  const d = structuredClone(d0);
  const m: Member = { id: newId('m'), name, email: (o.email ?? '').trim().toLowerCase(), phone: (o.phone ?? '').trim(), role: o.role ?? 'client', notes: '', createdAt: o.now.toISOString() };
  d.members.push(m);
  return { ok: true, data: d, member: m };
}
