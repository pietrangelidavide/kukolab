import type { ReactNode } from 'react';
import type { Data, Pass } from '../lib/types';
import { dayDM, dayDMY, plural } from '../lib/format';
import { passState } from '../lib/selectors';
import { mondayOf, romeDay } from '../lib/time';
import { Badge } from '../ui';

export function PageHead({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export const typeNames = (d: Data, ids: string[]) => (ids.length === 0 ? 'Tutti i corsi' : ids.map((i) => d.types.find((t) => t.id === i)?.name ?? i).join(' + '));

/** Quante lezioni un abbonamento a tempo ha già consumato nella settimana di `day`. */
export function weekUsage(d: Data, pass: Pass, day: string): number {
  const wk = mondayOf(day);
  const sessions = new Map(d.sessions.map((s) => [s.id, s]));
  return d.bookings.filter((b) => {
    if (b.passId !== pass.id || !['booked', 'attended', 'no_show', 'late_cancelled'].includes(b.status)) return false;
    const s = sessions.get(b.sessionId);
    return !!s && mondayOf(romeDay(new Date(s.startsAt))) === wk;
  }).length;
}

export function passSummary(p: Pass): string {
  if (p.kind === 'pack') return `${p.creditsLeft ?? 0} ${plural(p.creditsLeft ?? 0, 'lezione rimasta', 'lezioni rimaste')}`;
  return p.weeklyLimit ? `Fino a ${p.weeklyLimit} a settimana` : 'Lezioni illimitate';
}

export function PassStateBadge({ p, today }: { p: Pass; today: string }) {
  const st = passState(p, today);
  if (st === 'active') return <Badge tone="ok">Attivo</Badge>;
  if (st === 'upcoming') return <Badge tone="accent">Dal {dayDM(p.startsOn)}</Badge>;
  if (st === 'empty') return <Badge tone="bad">Lezioni finite</Badge>;
  return <Badge tone="mute">Scaduto</Badge>;
}

export const validity = (p: Pass) => `${dayDMY(p.startsOn)} – ${dayDMY(p.expiresOn)}`;
