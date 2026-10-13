import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { Badge, Btn, Empty, Field, Icon, Sheet, toneClass } from '../ui';
import { PageHead, PasswordForm, PassStateBadge, typeNames, validity, weekUsage } from './common';
import { BLOCK_TEXT, activePasses, memberStatus, myBookings, passState, passesOf, sessionsOnDay, unreadNotices, viewSession } from '../lib/selectors';
import type { SessionView } from '../lib/selectors';
import { addDays, romeDay } from '../lib/time';
import { cap, dayDM, dayDMY, dayLong, dayNum, dayShort, euro, plural, timeOf } from '../lib/format';
import type { Booking, Data, Session } from '../lib/types';

import { STUDIO } from '../config';
const STUDIO_WA = STUDIO.whatsapp;

// ------------------------------------------------------------------ Corsi
export function Schedule() {
  const s = useStore();
  const d = s.data!, me = s.me!;
  const today = romeDay(s.now);
  const days = useMemo(() => Array.from({ length: d.settings.bookingHorizonDays + 1 }, (_, i) => addDays(today, i)), [today, d.settings.bookingHorizonDays]);
  const [day, setDay] = useState(today);
  const [type, setType] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);
  const strip = useRef<HTMLDivElement>(null);

  const mine = myBookings(d, me.id, s.now).upcoming;
  const bookedDays = new Set(mine.map((r) => romeDay(new Date(r.session.startsAt))));
  const views = sessionsOnDay(d, day).filter((x) => type === 'all' || x.typeId === type).map((x) => viewSession(d, x, me.id, s.now));
  const act = activePasses(d, me.id, s.now);

  useEffect(() => { strip.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, [day]);

  const book = async (v: SessionView) => {
    setBusy(v.session.id);
    await s.run(s.api.book(v.session.id), (r) => {
      const b = r.data.bookings.find((x) => x.sessionId === v.session.id && x.memberId === me.id && (x.status === 'booked' || x.status === 'waitlist'));
      if (b?.status === 'waitlist') return `Sei in lista d’attesa per ${v.type.name} delle ${timeOf(v.session.startsAt)}. Ti avvisiamo se si libera un posto.`;
      const p = r.data.passes.find((x) => x.id === b?.passId);
      const left = p?.kind === 'pack' ? ` Ti restano ${p.creditsLeft} ${plural(p.creditsLeft ?? 0, 'lezione', 'lezioni')}.` : '';
      return `Prenotato: ${v.type.name}, ${timeOf(v.session.startsAt)}.${left}`;
    });
    setBusy(null);
  };

  return (
    <>
      <PageHead title="Prenota" sub="Scegli il giorno e il corso." />
      {act.length === 0 && <NoPass />}
      <div className="days" ref={strip} role="tablist" aria-label="Giorno">
        {days.map((x) => (
          <button key={x} role="tab" aria-selected={x === day} aria-current={x === day ? 'true' : undefined} className={`day${x === day ? ' on' : ''}${x === today ? ' today' : ''}`} onClick={() => setDay(x)}>
            <small>{x === today ? 'Oggi' : dayShort(x)}</small>
            <b>{dayNum(x)}</b>
            <i className={bookedDays.has(x) ? 'dot' : 'dot off'} aria-label={bookedDays.has(x) ? 'Hai una prenotazione' : undefined} />
          </button>
        ))}
      </div>
      <div className="filters" role="group" aria-label="Corso">
        <button className={`chip${type === 'all' ? ' on' : ''}`} aria-pressed={type === 'all'} onClick={() => setType('all')}>Tutti</button>
        {d.types.map((t) => <button key={t.id} className={`chip ${toneClass(t.tone)}${type === t.id ? ' on' : ''}`} aria-pressed={type === t.id} onClick={() => setType(t.id)}>{t.name}</button>)}
      </div>
      <h2 className="day-title">{cap(dayLong(day))}</h2>
      {views.length === 0 ? (
        <Empty title="Nessuna lezione" text={type === 'all' ? 'Per questo giorno non ci sono lezioni in programma.' : 'Nessuna lezione di questo corso nel giorno scelto.'} />
      ) : (
        <div className="slots">
          {views.map((v) => <SlotCard key={v.session.id} v={v} busy={busy === v.session.id} onBook={() => book(v)} onLeave={() => leave(v)} />)}
        </div>
      )}
    </>
  );

  async function leave(v: SessionView) {
    if (!v.mine) return;
    const wait = v.mine.status === 'waitlist';
    const pass = d.passes.find((p) => p.id === v.mine!.passId);
    const text = wait ? 'Non verrà addebitato nulla.'
      : v.lateCancel
        ? `Mancano meno di ${d.settings.cancelWindowHours} ore: ${pass?.kind === 'pack' ? 'la lezione non ti verrà restituita' : 'la lezione conta nel limite settimanale'}.`
        : pass?.kind === 'pack' ? 'La lezione torna nel tuo abbonamento.' : 'Nessun addebito.';
    const ok = await s.ask({ title: wait ? 'Uscire dalla lista d’attesa?' : 'Annullare la prenotazione?', text: `${v.type.name}, ${cap(dayLong(romeDay(new Date(v.session.startsAt))))} alle ${timeOf(v.session.startsAt)}. ${text}`, confirm: wait ? 'Esci dalla lista' : 'Annulla prenotazione', cancel: 'Tieni', danger: !wait && v.lateCancel });
    if (!ok) return;
    setBusy(v.session.id);
    await s.run(s.api.cancel(v.mine.id), (r) => (r.status === 'late_cancelled' ? 'Prenotazione annullata. La lezione non è stata restituita.' : 'Prenotazione annullata.'));
    setBusy(null);
  }
}

function NoPass() {
  const s = useStore();
  return (
    <div className="note warn">
      <Icon n="alert" size={20} />
      <div>
        <b>Nessun abbonamento attivo</b>
        <p>Per prenotare serve un abbonamento o un pacchetto lezioni: attivalo con noi in studio.</p>
        <button className="link" onClick={() => s.route.go('/abbonamento')}>Vedi i pacchetti</button>
      </div>
    </div>
  );
}

function SlotCard({ v, busy, onBook, onLeave }: { v: SessionView; busy: boolean; onBook: () => void; onLeave: () => void }) {
  const { session: x, type } = v;
  const full = v.state === 'full';
  let seats: string;
  if (v.state === 'cancelled') seats = 'Lezione annullata';
  else if (v.state === 'past') seats = 'Conclusa';
  else if (full) seats = v.waitlist ? `Completo · ${v.waitlist} in attesa` : 'Completo';
  else seats = `${v.seatsLeft} ${plural(v.seatsLeft, 'posto libero', 'posti liberi')} su ${x.capacity}`;
  const few = v.state === 'open' && v.seatsLeft > 0 && v.seatsLeft <= 2 && x.capacity > 2;
  return (
    <article className={`slot ${toneClass(type.tone)} st-${v.state}${v.mine ? ' mine' : ''}`}>
      <div className="slot-time"><b>{timeOf(x.startsAt)}</b><span>{x.duration} min</span></div>
      <div className="slot-main">
        <h3>{type.name}</h3>
        <p>{x.trainer}{x.note ? ` · ${x.note}` : ''}</p>
        <p className={`seats${few ? ' few' : ''}${full ? ' full' : ''}`}>{seats}</p>
      </div>
      <div className="slot-act">
        {v.mine?.status === 'booked' && <Badge tone="ok"><Icon n="check" size={14} /> Prenotato</Badge>}
        {v.mine?.status === 'waitlist' && <Badge tone="warn">In lista{v.position ? ` · ${v.position}°` : ''}</Badge>}
        {v.mine && (v.state === 'open' || v.state === 'full') && <Btn kind="quiet" size="sm" disabled={busy} onClick={onLeave}>{v.mine.status === 'waitlist' ? 'Esci' : 'Annulla'}</Btn>}
        {!v.mine && v.state === 'open' && (v.eligible ? <Btn size="sm" disabled={busy} onClick={onBook}>Prenota</Btn> : <span className="hint">{BLOCK_TEXT[v.block]}</span>)}
        {!v.mine && full && (v.eligible ? <Btn kind="ghost" size="sm" disabled={busy} onClick={onBook}>Lista d&#8217;attesa</Btn> : <span className="hint">{BLOCK_TEXT[v.block]}</span>)}
        {!v.mine && v.state === 'closed' && <span className="hint">Prenotazioni chiuse</span>}
      </div>
    </article>
  );
}

// ------------------------------------------------------------------ Prenotazioni
export function MyBookings() {
  const s = useStore();
  const d = s.data!, me = s.me!;
  const { upcoming, past } = myBookings(d, me.id, s.now);
  const [busy, setBusy] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  const leave = async (b: Booking, x: Session) => {
    const v = viewSession(d, x, me.id, s.now);
    const wait = b.status === 'waitlist';
    const pass = d.passes.find((p) => p.id === b.passId);
    const text = wait ? 'Non verrà addebitato nulla.'
      : v.lateCancel
        ? `Mancano meno di ${d.settings.cancelWindowHours} ore: ${pass?.kind === 'pack' ? 'la lezione non ti verrà restituita' : 'la lezione conta nel limite settimanale'}.`
        : pass?.kind === 'pack' ? 'La lezione torna nel tuo abbonamento.' : 'Nessun addebito.';
    const ok = await s.ask({ title: wait ? 'Uscire dalla lista d’attesa?' : 'Annullare la prenotazione?', text: `${v.type.name}, ${cap(dayLong(romeDay(new Date(x.startsAt))))} alle ${timeOf(x.startsAt)}. ${text}`, confirm: wait ? 'Esci dalla lista' : 'Annulla prenotazione', cancel: 'Tieni', danger: !wait && v.lateCancel });
    if (!ok) return;
    setBusy(b.id);
    await s.run(s.api.cancel(b.id), (r) => (r.status === 'late_cancelled' ? 'Prenotazione annullata. La lezione non è stata restituita.' : 'Prenotazione annullata.'));
    setBusy(null);
  };

  const label: Record<string, [string, 'ok' | 'bad' | 'mute' | 'warn']> = {
    attended: ['Presente', 'ok'], no_show: ['Assente', 'bad'], cancelled: ['Annullata', 'mute'], late_cancelled: ['Annullata in ritardo', 'warn'], booked: ['Prenotata', 'mute'], waitlist: ['Lista d’attesa', 'mute'],
  };

  return (
    <>
      <PageHead title="Le mie prenotazioni" />
      <h2 className="sec">In programma</h2>
      {upcoming.length === 0 ? (
        <Empty icon="calendar" title="Niente in programma" text="Scegli una lezione dal calendario." action={<Btn size="sm" onClick={() => s.route.go('/corsi')}>Vai ai corsi</Btn>} />
      ) : (
        <div className="slots">
          {upcoming.map(({ booking: b, session: x }) => {
            const t = d.types.find((y) => y.id === x.typeId)!;
            const v = viewSession(d, x, me.id, s.now);
            return (
              <article key={b.id} className={`slot ${toneClass(t.tone)} mine`}>
                <div className="slot-time"><b>{timeOf(x.startsAt)}</b><span>{dayDM(romeDay(new Date(x.startsAt)))}</span></div>
                <div className="slot-main">
                  <h3>{t.name}</h3>
                  <p>{cap(dayLong(romeDay(new Date(x.startsAt))))} · {x.trainer}</p>
                  <p className="seats">{b.status === 'waitlist' ? `In lista d’attesa${v.position ? ` · ${v.position}°` : ''}` : 'Prenotato'}</p>
                </div>
                <div className="slot-act">
                  {b.status === 'booked' ? <Badge tone="ok"><Icon n="check" size={14} /> Confermata</Badge> : <Badge tone="warn">In attesa</Badge>}
                  <Btn kind="quiet" size="sm" disabled={busy === b.id} onClick={() => leave(b, x)}>{b.status === 'waitlist' ? 'Esci' : 'Annulla'}</Btn>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="policy"><Icon n="info" size={16} /> Puoi annullare gratis fino a {d.settings.cancelWindowHours} ore prima della lezione.</p>

      <h2 className="sec">Storico</h2>
      {past.length === 0 ? <p className="muted">Ancora nessuna lezione.</p> : (
        <ul className="hist">
          {(all ? past : past.slice(0, 8)).map(({ booking: b, session: x }) => {
            const t = d.types.find((y) => y.id === x.typeId)!;
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
    </>
  );
}

// ------------------------------------------------------------------ Abbonamento
export function PassScreen() {
  const s = useStore();
  const d = s.data!, me = s.me!;
  const today = romeDay(s.now);
  const all = passesOf(d, me.id);
  const current = all.filter((p) => ['active', 'upcoming'].includes(passState(p, today)));
  const old = all.filter((p) => !current.includes(p));
  const [showOld, setShowOld] = useState(false);
  const catalog = d.packs.filter((p) => p.active);
  const wa = `https://wa.me/${STUDIO_WA}?text=${encodeURIComponent(`Ciao KUKO LAB, sono ${me.name}: vorrei attivare o rinnovare un abbonamento.`)}`;

  return (
    <>
      <PageHead title="Abbonamento" sub="Il tuo abbonamento e i pacchetti disponibili." />
      {current.length === 0 ? (
        <Empty icon="ticket" title="Nessun abbonamento attivo" text="Attivalo con noi in studio oppure scrivici: ti aiutiamo a scegliere il pacchetto giusto." action={<a className="btn btn-primary btn-sm" href={wa} target="_blank" rel="noopener"><span>Scrivici su WhatsApp</span></a>} />
      ) : (
        <div className="passes">{current.map((p) => <PassCard key={p.id} p={p} d={d} today={today} />)}</div>
      )}
      {old.length > 0 && (
        <>
          <button className="link-row" onClick={() => setShowOld(!showOld)} aria-expanded={showOld}><span>Storico abbonamenti ({old.length})</span><Icon n={showOld ? 'down' : 'right'} size={18} /></button>
          {showOld && <div className="passes">{old.map((p) => <PassCard key={p.id} p={p} d={d} today={today} />)}</div>}
        </>
      )}
      <h2 className="sec">Pacchetti in studio</h2>
      <ul className="catalog">
        {catalog.map((p) => (
          <li key={p.id}>
            <div><b>{p.name}</b><small>{p.kind === 'pack' ? `${p.lessons} ${plural(p.lessons ?? 0, 'lezione', 'lezioni')} · valido ${p.validityDays} giorni` : `${p.validityDays} giorni${p.weeklyLimit ? ` · fino a ${p.weeklyLimit} a settimana` : ' · illimitato'}`} · {typeNames(d, p.typeIds)}</small></div>
            <span className="price">{euro(p.priceCents)}</span>
          </li>
        ))}
      </ul>
      <p className="policy"><Icon n="info" size={16} /> Pagamento e attivazione si fanno in studio. Poi trovi tutto qui.</p>
      <a className="btn btn-ghost btn-md" href={wa} target="_blank" rel="noopener"><span>Scrivici su WhatsApp</span></a>
    </>
  );
}

export function PassCard({ p, d, today }: { p: import('../lib/types').Pass; d: Data; today: string }) {
  const pack = p.kind === 'pack';
  const total = p.creditsTotal ?? 0, left = p.creditsLeft ?? 0;
  const used = weekUsage(d, p, today);
  return (
    <article className="pass">
      <header>
        <h3>{p.name}</h3>
        <PassStateBadge p={p} today={today} />
      </header>
      {pack ? (
        <>
          <div className="big"><b>{left}</b><span>su {total} {plural(total, 'lezione', 'lezioni')}</span></div>
          <div className="meter" role="img" aria-label={`${left} lezioni su ${total}`}><i style={{ width: `${total ? Math.max(0, Math.min(100, (left / total) * 100)) : 0}%` }} /></div>
        </>
      ) : (
        <>
          <div className="big"><b>{p.weeklyLimit ? p.weeklyLimit : '∞'}</b><span>{p.weeklyLimit ? 'lezioni a settimana' : 'lezioni illimitate'}</span></div>
          {p.weeklyLimit ? <div className="meter" role="img" aria-label={`${used} usate su ${p.weeklyLimit} questa settimana`}><i style={{ width: `${Math.min(100, (used / p.weeklyLimit) * 100)}%` }} /></div> : null}
          {p.weeklyLimit ? <p className="muted">Questa settimana: {used} su {p.weeklyLimit}</p> : null}
        </>
      )}
      <dl>
        <div><dt>Validità</dt><dd>{validity(p)}</dd></div>
        <div><dt>Corsi</dt><dd>{typeNames(d, p.typeIds)}</dd></div>
      </dl>
    </article>
  );
}

// ------------------------------------------------------------------ Profilo
export function Profile() {
  const s = useStore();
  const me = s.me!, d = s.data!;
  const [name, setName] = useState(me.name);
  const [phone, setPhone] = useState(me.phone);
  const dirty = name.trim() !== me.name || phone.trim() !== me.phone;
  const st = memberStatus(d, me.id, s.now);
  return (
    <>
      <PageHead title="Profilo" />
      <form className="form" onSubmit={async (e) => { e.preventDefault(); await s.run(s.api.updateProfile({ name, phone }), 'Profilo aggiornato.'); }}>
        <Field label="Nome e cognome"><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></Field>
        <Field label="Telefono" hint="Serve allo studio per avvisarti se una lezione cambia."><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" /></Field>
        <Field label="Email"><input value={me.email || '—'} disabled /></Field>
        <Btn disabled={!dirty || !name.trim()} onClick={undefined} type="submit">Salva</Btn>
      </form>
      <div className="note">
        <Icon n="info" size={20} />
        <div>
          <b>Come funziona</b>
          <p>Annulli gratis fino a {d.settings.cancelWindowHours} ore prima. Più tardi la lezione non ti viene restituita. Se la lezione è piena puoi metterti in lista d&#8217;attesa: se si libera un posto entri da solo e ti avvisiamo.</p>
          <p className="muted">Il tuo stato: {st.label}{st.detail ? ` · ${st.detail}` : ''}</p>
        </div>
      </div>
      {s.api.mode === 'demo' && (
        <div className="demo-box">
          <b>Modalità demo</b>
          <p>I dati restano solo su questo dispositivo.</p>
          <div className="row">
            <Btn kind="ghost" size="sm" onClick={async () => { const r = await s.api.demoLogin!('owner'); if (r.ok) { s.setSession(r.me, r.data); s.route.go('/oggi'); } }}>Passa all&#8217;area owner</Btn>
            <Btn kind="quiet" size="sm" onClick={async () => { const ok = await s.ask({ title: 'Ripristinare i dati demo?', text: 'Si perdono le prenotazioni fatte in prova.', confirm: 'Ripristina' }); if (!ok) return; const r = await s.api.resetDemo!(); if (r.ok) { s.setSession(r.me, r.data); s.toast('Dati demo ripristinati.', 'ok'); } }}>Ripristina i dati</Btn>
          </div>
        </div>
      )}
      {s.api.changePassword && <><h2 className="sec">Password</h2><PasswordForm /></>}
      <Btn kind="quiet" onClick={() => s.logout()}><Icon n="logout" size={18} /> Esci</Btn>
    </>
  );
}

// ------------------------------------------------------------------ Avvisi
export function Notices({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore();
  const d = s.data!, me = s.me!;
  const list = d.notices.filter((n) => n.memberId === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
  const unread = unreadNotices(d, me.id).length;
  const sent = useRef(false);
  useEffect(() => {
    if (open && unread > 0 && !sent.current) { sent.current = true; const t = setTimeout(() => { s.run(s.api.readNotices()); }, 1200); return () => clearTimeout(t); }
    if (!open) sent.current = false;
  }, [open, unread]); // eslint-disable-line
  return (
    <Sheet open={open} onClose={onClose} title="Avvisi">
      {list.length === 0 ? <p className="muted">Nessun avviso.</p> : (
        <ul className="notices">
          {list.map((n) => (
            <li key={n.id} className={n.read ? '' : 'new'}>
              <Icon n={n.kind === 'promoted' ? 'check' : n.kind === 'session_cancelled' ? 'alert' : 'info'} size={18} />
              <div><p>{n.text}</p><small>{dayDM(romeDay(new Date(n.createdAt)))} · {timeOf(n.createdAt)}</small></div>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

