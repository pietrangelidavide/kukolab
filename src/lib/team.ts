// Il team dello studio: la Segreteria (un solo account, quello del banco) e i Trainer. Lo gestisce solo l'owner.
// Stessa logica di public.add_team_member e public.remove_team_member in supabase/schema.sql.
import type { Data, Err, Id, Member, Result } from './types';
import { newId } from './ids';

const fail = (error: Err): { ok: false; error: Err } => ({ ok: false, error });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Le persone del team. Chi entra con un codice via email ha bisogno di un'email vera: per la Segreteria meglio una casella dello studio. */
export const teamOf = (d: Data): Member[] => d.members.filter((m) => m.role === 'staff' || m.role === 'trainer');

export function addTeamMember(
  d0: Data,
  o: { name: string; email: string; role: 'staff' | 'trainer'; phone?: string; now: Date },
): Result<{ data: Data; member: Member }> {
  const name = o.name.trim().replace(/\s+/g, ' ');
  const email = o.email.trim().toLowerCase();
  if (o.role !== 'staff' && o.role !== 'trainer') return fail('invalid');
  if (!name || !EMAIL.test(email) || email.length > 120) return fail('invalid');
  if (o.role === 'staff' && d0.members.some((m) => m.role === 'staff')) return fail('staff_exists');
  const d = structuredClone(d0);
  const ex = d.members.find((m) => m.email.toLowerCase() === email);
  if (ex) {
    // già iscritto: passa al team senza perdere abbonamenti e prenotazioni. L'account di un'altra persona del team non si riassegna.
    if (ex.role !== 'client') return fail('email_in_use');
    ex.role = o.role;
    ex.name = name;
    if (o.phone?.trim()) ex.phone = o.phone.trim();
    return { ok: true, data: d, member: ex };
  }
  const member: Member = { id: newId('m'), name, email, phone: (o.phone ?? '').trim(), role: o.role, notes: '', createdAt: o.now.toISOString() };
  d.members.push(member);
  return { ok: true, data: d, member };
}

/** Toglie dal team. Chi ha abbonamenti, prenotazioni o incassi a suo nome resta tra gli iscritti; gli altri spariscono. */
export function removeTeamMember(d0: Data, o: { memberId: Id }): Result<{ data: Data; kept: boolean }> {
  const m0 = d0.members.find((m) => m.id === o.memberId);
  if (!m0 || (m0.role !== 'staff' && m0.role !== 'trainer')) return fail('member_not_found');
  const kept = d0.bookings.some((b) => b.memberId === o.memberId) || d0.passes.some((p) => p.memberId === o.memberId) || d0.payments.some((p) => p.memberId === o.memberId);
  const d = structuredClone(d0);
  if (kept) d.members.find((m) => m.id === o.memberId)!.role = 'client';
  else d.members = d.members.filter((m) => m.id !== o.memberId);
  return { ok: true, data: d, kept };
}
