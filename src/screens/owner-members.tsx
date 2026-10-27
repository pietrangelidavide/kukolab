import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Avatar, Badge, Btn, Empty, Field, Icon, Sheet, toneClass } from '../ui';
import { PageHead, PassStateBadge, passSummary, typeNames, validity } from './common';
import { memberStatus, myBookings, passState, passesOf, typeOf } from '../lib/selectors';
import { romeDay } from '../lib/time';
import { cap, dayDMY, dayLong, euro, plural, timeOf, waLink, waNumber } from '../lib/format';
import type { Id, Member } from '../lib/types';
import { STUDIO } from '../config';

type Filter = 'all' | 'active' | 'soon' | 'none';

// ------------------------------------------------------------------ Elenco
export function Members() {
  const s = useStore();
  const d = s.data!;
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filter>('all');
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => d.members
    .filter((m) => m.role === 'client')
    .map((m) => ({ m, st: memberStatus(d, m.id, s.now) }))
    .sort((a, b) => a.m.name.localeCompare(b.m.name)), [d, s.now]);
  const count = { all: rows.length, active: rows.filter((r) => r.st.label === 'Attivo').length, soon: rows.filter((r) => r.st.tone === 'warn').length, none: rows.filter((r) => r.st.label !== 'Attivo').length };
  const shown = rows.filter((r) => {
    if (q.trim() && !`${r.m.name} ${r.m.email} ${r.m.phone}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    if (f === 'active') return r.st.label === 'Attivo';
    if (f === 'soon') return r.st.tone === 'warn';
    if (f === 'none') return r.st.label !== 'Attivo';
    return true;
  });

  return (
    <>
      <PageHead title="Iscritti" sub={`${count.all} ${plural(count.all, 'persona', 'persone')}, ${count.active} con abbonamento attivo.`} right={<Btn size="sm" onClick={() => setAdding(true)}><Icon n="plus" size={16} /> Nuovo iscritto</Btn>} />
      <div className="searchbar">
        <Icon n="search" size={18} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome, email o telefono" aria-label="Cerca iscritti" />
      </div>
      <div className="filters" role="group" aria-label="Filtro">
        {([['all', 'Tutti'], ['active', 'Attivi'], ['soon', 'In scadenza'], ['none', 'Senza abbonamento']] as [Filter, string][]).map(([v, t]) => (
          <button key={v} className={`chip${f === v ? ' on' : ''}`} aria-pressed={f === v} onClick={() => setF(v)}>{t} <small>{count[v]}</small></button>
        ))}
      </div>
      {shown.length === 0 ? (
        <Empty icon="users" title="Nessun iscritto" text={q ? 'Nessun risultato per questa ricerca.' : 'Niente da mostrare con questo filtro.'} />
      ) : (
        <ul className="mlist">
          {shown.map(({ m, st }) => (
            <li key={m.id}>
              <a href={`#/iscritti/${m.id}`} onClick={(e) => { e.preventDefault(); s.route.go(`/iscritti/${m.id}`); }}>
                <Avatar name={m.name} size={42} />
                <span className="who"><b>{m.name}</b><small>{st.detail || (m.phone || m.email || '—')}</small></span>
                <Badge tone={st.label === 'Attivo' ? (st.tone === 'warn' ? 'warn' : 'ok') : 'mute'}>{st.label === 'Attivo' && st.tone === 'warn' ? 'In scadenza' : st.label}</Badge>
                <Icon n="right" size={16} className="mchev" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {adding && <NewMember onClose={() => setAdding(false)} />}
    </>
  );
}

function NewMember({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const save = async () => {
    const r = await s.run(s.api.addMember({ name, email, phone }), 'Iscritto aggiunto.');
    if (r.ok) { onClose(); s.route.go(`/iscritti/${r.member.id}`); }
  };
  return (
    <Sheet open onClose={onClose} title="Nuovo iscritto" footer={<><Btn kind="quiet" onClick={onClose}>Chiudi</Btn><Btn onClick={save} disabled={!name.trim()}>Aggiungi</Btn></>}>
      {s.api.codeLogin
        ? <p className="muted">Per entrare nell&#8217;app la persona scrive la sua email e riceve un codice: serve quindi l&#8217;email giusta. Dopo averla aggiunta puoi invitarla su WhatsApp dalla sua scheda.</p>
        : <p className="muted">Se ha già un profilo nell&#8217;app, usa la stessa email: i due profili si collegano da soli.</p>}
      <Field label="Nome e cognome"><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" data-autofocus /></Field>
      <Field label="Telefono"><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="off" /></Field>
      <Field label="Email" hint={s.api.codeLogin ? 'Serve per l\u2019accesso all\u2019app.' : 'Facoltativa.'}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></Field>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Scheda
export function MemberDetail({ id }: { id: Id }) {
  const s = useStore();
  const d = s.data!;
  const m = d.members.find((x) => x.id === id && x.role === 'client');
  const [edit, setEdit] = useState(false);
  const [sell, setSell] = useState(false);
  const [all, setAll] = useState(false);
  if (!m) return <Empty icon="users" title="Iscritto non trovato" action={<Btn size="sm" onClick={() => s.route.go('/iscritti')}>Torna all’elenco</Btn>} />;

  const today = romeDay(s.now);
  const passes = passesOf(d, m.id);
  const st = memberStatus(d, m.id, s.now);
  const { upcoming, past } = myBookings(d, m.id, s.now);
  const wa = m.phone ? waLink(m.phone, `Ciao ${m.name.split(' ')[0]}, ti scrivo da KUKO LAB.`) : null;
  // con l'archivio online l'owner vede se la persona ha già fatto il primo accesso e può invitarla su WhatsApp
  const online = !!s.api.codeLogin && m.hasAccount !== undefined;
  const invite = online && !m.hasAccount && m.phone && m.email
    ? waLink(m.phone, `Ciao ${m.name.split(' ')[0]}, sei iscritto a ${STUDIO.name}! Per prenotare le lezioni apri ${location.origin}/app/ e scrivi la tua email (${m.email}): ti arriva un codice per entrare. Nessuna password da ricordare.`)
    : null;
  const attended = d.bookings.filter((b) => b.memberId === m.id && b.status === 'attended').length;
  const noshow = d.bookings.filter((b) => b.memberId === m.id && b.status === 'no_show').length;

  const adjust = (passId: Id, delta: number) => s.run(s.api.adjustCredits(passId, delta));
  const removeBooking = async (bid: Id, label: string) => {
    const ok = await s.ask({ title: 'Togliere dalla lezione?', text: `${label}. La lezione torna nell’abbonamento di ${m.name.split(' ')[0]}.`, confirm: 'Togli', danger: true });
    if (ok) await s.run(s.api.ownerCancel(bid), 'Tolto dalla lezione.');
  };
  const label: Record<string, [string, 'ok' | 'bad' | 'mute' | 'warn']> = {
    attended: ['Presente', 'ok'], no_show: ['Assente', 'bad'], cancelled: ['Annullata', 'mute'], late_cancelled: ['Annullata in ritardo', 'warn'], booked: ['Prenotata', 'mute'], waitlist: ['Lista d’attesa', 'mute'],
  };

  return (
    <>
      <button className="back-link" onClick={() => s.route.go('/iscritti')}><Icon n="left" size={16} /> Iscritti</button>
      <header className="mhead">
        <Avatar name={m.name} size={64} />
        <div>
          <h1>{m.name}</h1>
          <p className="muted">Iscritto dal {dayDMY(romeDay(new Date(m.createdAt)))}{st.detail ? ` · ${st.detail}` : ''}</p>
          <p className="mcontacts">
            {m.phone ? <a href={`tel:${m.phone.replace(/\s/g, '')}`}><Icon n="phone" size={15} /> {m.phone}</a> : <span className="muted">Nessun telefono</span>}
            {wa && <a href={wa} target="_blank" rel="noopener"><Icon n="wa" size={15} /> WhatsApp</a>}
            {m.email && <a href={`mailto:${m.email}`}>{m.email}</a>}
          </p>
          {online && (
            <p className="macc">
              {m.hasAccount ? <Badge tone="ok">Account attivo</Badge> : <Badge tone="warn">Non ha ancora fatto il primo accesso</Badge>}
              {!m.hasAccount && !m.email && <span className="muted small">Manca l&#8217;email: senza non può entrare nell&#8217;app (puoi prenotare tu al suo posto).</span>}
              {invite && <a href={invite} target="_blank" rel="noopener"><Icon n="wa" size={15} /> Invita nell&#8217;app su WhatsApp</a>}
            </p>
          )}
        </div>
        <Btn kind="ghost" size="sm" onClick={() => setEdit(true)}><Icon n="edit" size={16} /> Modifica</Btn>
      </header>

      {m.notes && <div className="note"><Icon n="info" size={20} /><div><b>Note</b><p>{m.notes}</p></div></div>}

      <dl className="kpis small">
        <div><dt>Presenze</dt><dd>{attended}</dd></div>
        <div><dt>Assenze</dt><dd>{noshow}</dd></div>
        <div><dt>In programma</dt><dd>{upcoming.length}</dd></div>
      </dl>

      <div className="sec-row"><h2 className="sec">Abbonamenti</h2><Btn size="sm" onClick={() => setSell(true)}><Icon n="plus" size={16} /> Vendi pacchetto</Btn></div>
      {passes.length === 0 ? <Empty icon="ticket" title="Nessun abbonamento" text="Quando incassi un pacchetto, registralo qui: l’iscritto potrà prenotare." /> : (
        <ul className="opasses">
          {passes.map((p) => {
            const state = passState(p, today);
            return (
              <li key={p.id} className={state === 'active' || state === 'upcoming' ? '' : 'old'}>
                <div className="who">
                  <b>{p.name}</b>
                  <small>{validity(p)} · {typeNames(d, p.typeIds)}</small>
                  <small>{passSummary(p)}{p.note ? ` · ${p.note}` : ''}</small>
                </div>
                <PassStateBadge p={p} today={today} />
                {p.kind === 'pack' && (
                  <div className="stepper" role="group" aria-label={`Lezioni di ${p.name}`}>
                    <button className="icon-btn sm" onClick={() => adjust(p.id, -1)} disabled={(p.creditsLeft ?? 0) <= 0} aria-label="Togli una lezione"><Icon n="minus" size={15} /></button>
                    <b>{p.creditsLeft}</b>
                    <button className="icon-btn sm" onClick={() => adjust(p.id, 1)} aria-label="Aggiungi una lezione"><Icon n="plus" size={15} /></button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="sec">In programma</h2>
      {upcoming.length === 0 ? <p className="muted">Nessuna lezione prenotata.</p> : (
        <ul className="hist">
          {upcoming.map(({ booking: b, session: x }) => {
            const t = typeOf(d, x.typeId);
            const l = `${t.name}, ${cap(dayLong(romeDay(new Date(x.startsAt))))} alle ${timeOf(x.startsAt)}`;
            return (
              <li key={b.id}>
                <span className={`bar ${toneClass(t.tone)}`} />
                <div><b>{t.name}</b><small>{cap(dayLong(romeDay(new Date(x.startsAt))))} · {timeOf(x.startsAt)}{b.status === 'waitlist' ? ' · in lista d’attesa' : ''}</small></div>
                <button className="icon-btn sm" onClick={() => removeBooking(b.id, l)} aria-label={`Togli da ${l}`}><Icon n="trash" size={15} /></button>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="sec">Storico</h2>
      {past.length === 0 ? <p className="muted">Ancora nessuna lezione.</p> : (
        <ul className="hist">
          {(all ? past : past.slice(0, 8)).map(({ booking: b, session: x }) => {
            const t = typeOf(d, x.typeId);
            const [txt, tone] = label[x.status === 'cancelled' && b.status !== 'attended' ? 'cancelled' : b.status];
            return (
              <li key={b.id}>
                <span className={`bar ${toneClass(t.tone)}`} />
                <div><b>{t.name}</b><small>{dayDMY(romeDay(new Date(x.startsAt)))} · {timeOf(x.startsAt)}</small></div>
                <Badge tone={tone}>{txt}</Badge>
              </li>
            );
          })}
        </ul>
      )}
      {past.length > 8 && !all && <Btn kind="quiet" size="sm" onClick={() => setAll(true)}>Mostra tutto ({past.length})</Btn>}

      {edit && <EditMember m={m} onClose={() => setEdit(false)} />}
      {sell && <SellPack m={m} onClose={() => setSell(false)} />}
    </>
  );
}

function EditMember({ m, onClose }: { m: Member; onClose: () => void }) {
  const s = useStore();
  const [name, setName] = useState(m.name);
  const [phone, setPhone] = useState(m.phone);
  const [email, setEmail] = useState(m.email);
  const [notes, setNotes] = useState(m.notes);
  const bad = phone.trim() !== '' && waNumber(phone) === null;
  const save = async () => { const r = await s.run(s.api.saveMember({ id: m.id, name, email, phone, notes }), 'Scheda aggiornata.'); if (r.ok) onClose(); };
  return (
    <Sheet open onClose={onClose} title="Modifica scheda" footer={<><Btn kind="quiet" onClick={onClose}>Chiudi</Btn><Btn onClick={save} disabled={!name.trim()}>Salva</Btn></>}>
      <Field label="Nome e cognome"><input value={name} onChange={(e) => setName(e.target.value)} data-autofocus /></Field>
      <Field label="Telefono" hint={bad ? 'Il numero non sembra valido: controlla le cifre.' : 'Serve per i messaggi WhatsApp.'}><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></Field>
      <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Note" hint="Visibili solo a te: infortuni, preferenze, accordi."><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
    </Sheet>
  );
}

function SellPack({ m, onClose }: { m: Member; onClose: () => void }) {
  const s = useStore();
  const d = s.data!;
  const packs = d.packs.filter((p) => p.active);
  const [packId, setPackId] = useState(packs[0]?.id ?? '');
  const [startsOn, setStartsOn] = useState(romeDay(s.now));
  const [note, setNote] = useState('');
  const pack = packs.find((p) => p.id === packId);
  const save = async () => { const r = await s.run(s.api.assignPass(m.id, packId, startsOn, note.trim()), `${pack?.name ?? 'Pacchetto'} registrato per ${m.name.split(' ')[0]}.`); if (r.ok) onClose(); };
  return (
    <Sheet open onClose={onClose} title="Vendi pacchetto" footer={<><Btn kind="quiet" onClick={onClose}>Chiudi</Btn><Btn onClick={save} disabled={!packId || !startsOn}>Registra</Btn></>}>
      <p className="muted">Registra un pagamento già ricevuto in studio. Il pacchetto si attiva subito.</p>
      <Field label="Pacchetto">
        <select value={packId} onChange={(e) => setPackId(e.target.value)} data-autofocus>{packs.map((p) => <option key={p.id} value={p.id}>{p.name} · {euro(p.priceCents)}</option>)}</select>
      </Field>
      {pack && <p className="small muted">{pack.kind === 'pack' ? `${pack.lessons} ${plural(pack.lessons ?? 0, 'lezione', 'lezioni')}` : pack.weeklyLimit ? `Fino a ${pack.weeklyLimit} a settimana` : 'Lezioni illimitate'} · {pack.validityDays} giorni · {typeNames(d, pack.typeIds)}</p>}
      <Field label="Inizia il"><input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} /></Field>
      <Field label="Nota" hint="Facoltativa: ad esempio “pagato in contanti”."><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Sheet>
  );
}
