import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Data, Pass } from '../lib/types';
import { dayDM, dayDMY, plural } from '../lib/format';
import { passState } from '../lib/selectors';
import { mondayOf, romeDay } from '../lib/time';
import { Badge, Btn, Field } from '../ui';
import { useStore } from '../store';
import { ERR_TEXT } from '../lib/types';

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

/** Cambio password (solo con l'accesso reale). Dopo il link "password dimenticata" si arriva qui. */
export function PasswordForm() {
  const s = useStore();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  if (!s.api.changePassword) return null;
  return (
    <form className="form narrow" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      const r = await s.api.changePassword!(pw);
      setBusy(false);
      if (r.ok) { setPw(''); s.toast('Password cambiata.', 'ok'); } else s.toast(r.message ?? ERR_TEXT[r.error], 'error');
    }}>
      <Field label="Nuova password" hint="Almeno 8 caratteri."><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={8} required /></Field>
      <div className="row"><Btn type="submit" kind="ghost" size="sm" disabled={busy || pw.length < 8}>Cambia password</Btn></div>
    </form>
  );
}
