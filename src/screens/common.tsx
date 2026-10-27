import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Data, Id, Member, Pass } from '../lib/types';
import { dayDM, dayDMY, plural } from '../lib/format';
import { passState } from '../lib/selectors';
import { mondayOf, romeDay } from '../lib/time';
import { Avatar, Badge, Btn, Field, Icon } from '../ui';
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

/** Campo "Istruttore" con i suggerimenti: i Trainer del team e i nomi già usati nell'orario. Scrivere lo stesso nome del Trainer lo abbina alle sue lezioni. */
export function TrainerInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const d = useStore().data!;
  const names = [...new Set([...d.members.filter((m) => m.role === 'trainer').map((m) => m.name), ...d.templates.map((t) => t.trainer)].map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return (
    <>
      <input value={value} onChange={(e) => onChange(e.target.value)} list="kuko-trainers" autoComplete="off" />
      <datalist id="kuko-trainers">{names.map((n) => <option key={n} value={n} />)}</datalist>
    </>
  );
}

/** Cerca un iscritto per nome, email o telefono e lo sceglie. `value` è l'id scelto. */
export function MemberSearch({ value, onChange, label = 'Iscritto', optional }: { value: Id | null; onChange: (m: Member | null) => void; label?: string; optional?: boolean }) {
  const d = useStore().data!;
  const [q, setQ] = useState('');
  const picked = value ? d.members.find((m) => m.id === value) : undefined;
  const t = q.trim().toLowerCase();
  const found = t ? d.members.filter((m) => m.role === 'client' && `${m.name} ${m.email} ${m.phone}`.toLowerCase().includes(t)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 6) : [];
  if (picked) {
    return (
      <div className="field">
        <span>{label}</span>
        <div className="picked"><Avatar name={picked.name} size={32} /><b>{picked.name}</b><button type="button" className="icon-btn sm" onClick={() => { onChange(null); setQ(''); }} aria-label={`Cambia ${label.toLowerCase()}`}><Icon n="x" size={16} /></button></div>
      </div>
    );
  }
  return (
    <div className="field">
      <label htmlFor="msearch">{label}{optional ? ' (facoltativo)' : ''}</label>
      <input id="msearch" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome, email o telefono" autoComplete="off" data-autofocus />
      {t && (
        <ul className="picker compact">
          {found.map((m) => (
            <li key={m.id}><Avatar name={m.name} size={32} /><div className="who"><b>{m.name}</b><small>{m.phone || m.email || '—'}</small></div><Btn size="sm" kind="ghost" onClick={() => { onChange(m); setQ(''); }}>Scegli</Btn></li>
          ))}
          {found.length === 0 && <li className="muted">Nessun iscritto trovato.</li>}
        </ul>
      )}
    </div>
  );
}
