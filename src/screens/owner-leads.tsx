import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Avatar, Badge, Btn, Empty, Field, Icon, Sheet } from '../ui';
import { PageHead } from './common';
import { LEAD_OPEN, LEAD_SLOTS, LEAD_STATUS, ago, leadLabel, leadsNew, phoneKey } from '../lib/leads';
import { dayDMY, plural, waLink } from '../lib/format';
import { romeDay } from '../lib/time';
import type { Data, Lead, LeadStatus } from '../lib/types';
import nutri from '../data/nutritionist.json';

type Filter = 'open' | 'new' | 'trial' | 'nutrition' | 'closed';
type Tone = 'ok' | 'warn' | 'bad' | 'mute' | 'accent' | 'rust';

const TONE: Record<LeadStatus, Tone> = { new: 'accent', contacted: 'warn', scheduled: 'ok', done: 'rust', joined: 'ok', lost: 'mute' };
export const statusOf = (s: LeadStatus) => LEAD_STATUS.find((x) => x.id === s)!;

const slotText = (l: Lead) => l.slots.map((x) => LEAD_SLOTS.find((s) => s.id === x)?.label ?? x).join(', ');

function message(d: Data, l: Lead): string {
  const first = l.name.split(' ')[0];
  if (l.kind === 'nutrition') return `Ciao ${first}, ti scrivo da KUKO LAB: hai chiesto una consulenza nutrizionale gratuita. Quando ti farebbe comodo?`;
  const t = d.types.find((x) => x.id === l.topic)?.name.toLowerCase() ?? 'una lezione';
  return `Ciao ${first}, ti scrivo da KUKO LAB: hai chiesto una prova gratuita di ${t}. Quando ti va di passare?`;
}

/** Iscritto già presente con lo stesso telefono o la stessa email. */
const existingMember = (d: Data, l: Lead) => d.members.find((m) => m.role === 'client' && ((m.phone && phoneKey(m.phone) === phoneKey(l.phone)) || (l.email && m.email.toLowerCase() === l.email)));

// ------------------------------------------------------------------ Elenco
export function Leads() {
  const s = useStore();
  const d = s.data!;
  const [f, setF] = useState<Filter>('open');
  const [openId, setOpenId] = useState<string | null>(null);

  const count = useMemo(() => ({
    open: d.leads.filter((l) => LEAD_OPEN.includes(l.status)).length,
    new: leadsNew(d).length,
    trial: d.leads.filter((l) => l.kind === 'trial').length,
    nutrition: d.leads.filter((l) => l.kind === 'nutrition').length,
    closed: d.leads.filter((l) => !LEAD_OPEN.includes(l.status)).length,
  }), [d]);
  const shown = d.leads.filter((l) => {
    if (f === 'open') return LEAD_OPEN.includes(l.status);
    if (f === 'new') return l.status === 'new';
    if (f === 'closed') return !LEAD_OPEN.includes(l.status);
    return l.kind === f;
  });
  const lead = d.leads.find((l) => l.id === openId) ?? null;

  return (
    <>
      <PageHead title="Richieste" sub={count.new ? `${count.new} ${plural(count.new, 'nuova da richiamare', 'nuove da richiamare')}.` : 'Prove gratuite e consulenze nutrizionali arrivate dal sito.'} />
      <div className="filters" role="group" aria-label="Filtro">
        {([['open', 'Da seguire'], ['new', 'Nuove'], ['trial', 'Prove'], ['nutrition', 'Nutrizionista'], ['closed', 'Chiuse']] as [Filter, string][]).map(([v, t]) => (
          <button key={v} className={`chip${f === v ? ' on' : ''}`} aria-pressed={f === v} onClick={() => setF(v)}>{t} <small>{count[v]}</small></button>
        ))}
      </div>
      {shown.length === 0 ? (
        <Empty icon="bell" title={f === 'open' || f === 'new' ? 'Tutto in ordine' : 'Nessuna richiesta'} text={f === 'open' || f === 'new' ? 'Quando qualcuno compila il modulo della prova gratuita sul sito, la trovi qui.' : 'Niente da mostrare con questo filtro.'} />
      ) : (
        <ul className="leads">
          {shown.map((l) => {
            const st = statusOf(l.status);
            const wa = waLink(l.phone, message(d, l));
            return (
              <li key={l.id} className={`lead k-${l.kind}${l.status === 'new' ? ' is-new' : ''}`}>
                <button className="lead-main" onClick={() => setOpenId(l.id)} aria-label={`Apri la richiesta di ${l.name}`}>
                  <Avatar name={l.name} size={42} />
                  <span className="who">
                    <b>{l.name}</b>
                    <small>{leadLabel(d, l)}{l.source === 'app' ? ' · dall’app' : ''} · {ago(l.createdAt, s.now)}</small>
                    {l.slots.length > 0 && <small>Meglio: {slotText(l)}</small>}
                  </span>
                  <Badge tone={TONE[l.status]}>{st.short}</Badge>
                </button>
                <span className="lead-act">
                  <a className="icon-btn sm" href={`tel:${l.phone.replace(/\s/g, '')}`} aria-label={`Chiama ${l.name}`}><Icon n="phone" size={16} /></a>
                  {wa && <a className="icon-btn sm" href={wa} target="_blank" rel="noopener" aria-label={`Scrivi a ${l.name} su WhatsApp`}><Icon n="wa" size={16} /></a>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {lead && <LeadSheet key={lead.id} lead={lead} onClose={() => setOpenId(null)} />}
    </>
  );
}

// ------------------------------------------------------------------ Scheda richiesta
function LeadSheet({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const s = useStore();
  const d = s.data!;
  const [note, setNote] = useState(lead.ownerNote);
  const known = existingMember(d, lead);
  const wa = waLink(lead.phone, message(d, lead));
  const waNutri = lead.kind === 'nutrition' ? waLink(nutri.phone, `Ciao, ti passo una richiesta di consulenza arrivata da KUKO LAB: ${lead.name}, tel. ${lead.phone}${lead.email ? `, ${lead.email}` : ''}.`) : null;

  const setStatus = (status: LeadStatus) => { if (status !== lead.status) s.run(s.api.saveLead({ id: lead.id, status }), `Segnata come “${statusOf(status).label.toLowerCase()}”.`); };
  const saveNote = () => s.run(s.api.saveLead({ id: lead.id, ownerNote: note.trim() }), 'Nota salvata.');
  const makeMember = async () => {
    const r = await s.run(s.api.addMember({ name: lead.name, email: lead.email, phone: lead.phone }));
    if (!r.ok) return;
    await s.run(s.api.saveLead({ id: lead.id, status: 'joined' }), `${lead.name.split(' ')[0]} è tra gli iscritti.`);
    onClose();
    s.route.go(`/iscritti/${r.member.id}`);
  };
  const remove = async () => {
    const ok = await s.ask({ title: 'Cancellare la richiesta?', text: `${lead.name}: la richiesta sparisce e non si recupera.`, confirm: 'Cancella', danger: true });
    if (!ok) return;
    const r = await s.run(s.api.deleteLead(lead.id), 'Richiesta cancellata.');
    if (r.ok) onClose();
  };

  return (
    <Sheet open onClose={onClose} title={lead.name} wide footer={<><Btn kind="quiet" onClick={remove}><Icon n="trash" size={16} /> Cancella</Btn><Btn onClick={onClose}>Chiudi</Btn></>}>
      <div className="lead-sheet">
        <p className="mcontacts">
          <a href={`tel:${lead.phone.replace(/\s/g, '')}`}><Icon n="phone" size={15} /> {lead.phone}</a>
          {wa && <a href={wa} target="_blank" rel="noopener"><Icon n="wa" size={15} /> WhatsApp</a>}
          {lead.email && <a href={`mailto:${lead.email}`}>{lead.email}</a>}
        </p>
        <dl className="lead-facts">
          <div><dt>Ha chiesto</dt><dd>{leadLabel(d, lead)}</dd></div>
          <div><dt>Arrivata</dt><dd>{dayDMY(romeDay(new Date(lead.createdAt)))} · {ago(lead.createdAt, s.now)}</dd></div>
          {lead.slots.length > 0 && <div><dt>Momenti comodi</dt><dd>{slotText(lead)}</dd></div>}
        </dl>
        {lead.note && <div className="note"><Icon n="info" size={20} /><div><b>Ha scritto</b><p>{lead.note}</p></div></div>}

        <div className="field">
          <span>Come sta andando</span>
          <div className="filters wrap" role="group" aria-label="Stato della richiesta">
            {LEAD_STATUS.map((x) => <button key={x.id} className={`chip${lead.status === x.id ? ' on' : ''}`} aria-pressed={lead.status === x.id} onClick={() => setStatus(x.id)}>{x.label}</button>)}
          </div>
        </div>

        <Field label="Nota tua" hint="Visibile solo a te: cosa vi siete detti, quando richiamare.">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </Field>
        <div className="row"><Btn kind="ghost" size="sm" onClick={saveNote} disabled={note.trim() === lead.ownerNote}>Salva nota</Btn></div>

        {lead.kind === 'nutrition' && (
          <div className="note">
            <Icon n="info" size={20} />
            <div>
              <b>Consulenza con {nutri.name}</b>
              <p>Contatta tu la persona oppure passa il nome al professionista: {nutri.phone} · {nutri.email}.</p>
              {waNutri && <p><a href={waNutri} target="_blank" rel="noopener">Passa la richiesta su WhatsApp</a></p>}
            </div>
          </div>
        )}

        <div className="row lead-end">
          {known
            ? <Btn kind="ghost" size="sm" onClick={() => { onClose(); s.route.go(`/iscritti/${known.id}`); }}>Apri la scheda di {known.name.split(' ')[0]}</Btn>
            : <Btn size="sm" onClick={makeMember} disabled={lead.status === 'lost'}><Icon n="plus" size={16} /> Crea iscritto</Btn>}
        </div>
      </div>
    </Sheet>
  );
}
