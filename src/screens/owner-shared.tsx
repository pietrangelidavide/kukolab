import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Avatar, Badge, Btn, Field, Icon, Sheet, toneClass } from '../ui';
import { TrainerInput } from './common';
import { can } from '../lib/access';
import { memberStatus, rosterOf, slotState, typeOf } from '../lib/selectors';
import { counts } from '../lib/rules';
import { cap, dayLong, timeOf } from '../lib/format';
import { MIN, romeDay, romeHM, romeWall } from '../lib/time';
import type { Id, Member, Session } from '../lib/types';

export const sessionTitle = (type: string, s: Session) => `${type} · ${cap(dayLong(romeDay(new Date(s.startsAt))))} ${timeOf(s.startsAt)}`;

/** Elenco dei partecipanti di una lezione con presenze, rimozione e aggiunta. */
export function Roster({ sessionId }: { sessionId: Id }) {
  const s = useStore();
  const d = s.data!;
  const sess = d.sessions.find((x) => x.id === sessionId);
  const [picker, setPicker] = useState(false);
  if (!sess) return null;
  // chi può fare cosa lo decide il database; qui si mostrano solo i pulsanti giusti. Il Trainer segna le presenze dall'inizio della lezione.
  const role = s.me!.role;
  const canBook = can(role, 'book');
  const canLink = can(role, 'members');
  const started = new Date(sess.startsAt).getTime() - 30 * MIN <= s.now.getTime();
  const canMark = can(role, 'attendance') && (role !== 'trainer' || started);
  const nameOf = (m: Member) => (canLink ? <a href={`#/iscritti/${m.id}`} onClick={(e) => { e.preventDefault(); s.route.go(`/iscritti/${m.id}`); }}>{m.name}</a> : <b>{m.name}</b>);
  const rows = rosterOf(d, sessionId);
  const seated = rows.filter((r) => r.booking.status !== 'waitlist');
  const wait = rows.filter((r) => r.booking.status === 'waitlist');
  const cancelled = sess.status === 'cancelled';

  const mark = (id: Id, cur: string, to: 'attended' | 'no_show') => s.run(s.api.setAttendance(id, cur === to ? 'booked' : to));
  const remove = async (id: Id, name: string, isWait: boolean) => {
    const ok = await s.ask({ title: isWait ? 'Togliere dalla lista d’attesa?' : `Togliere ${name} dalla lezione?`, text: isWait ? name : 'La lezione torna nel suo abbonamento e, se c’è una lista d’attesa, entra la prima persona.', confirm: 'Togli', danger: true });
    if (ok) await s.run(s.api.ownerCancel(id), (r) => (r.promoted ? 'Tolto. Un posto è passato a chi era in lista.' : 'Tolto dalla lezione.'));
  };

  return (
    <div className="roster">
      {seated.length === 0 && wait.length === 0 && <p className="muted">Nessuna prenotazione.</p>}
      {!canMark && role === 'trainer' && seated.length > 0 && !cancelled && <p className="muted small">Le presenze si segnano da poco prima dell&#8217;inizio della lezione.</p>}
      {seated.length > 0 && (
        <ul>
          {seated.map(({ booking: b, member: m }) => (
            <li key={b.id}>
              <Avatar name={m.name} size={36} />
              <div className="who">
                {nameOf(m)}
                {canLink && <small>{b.passId ? d.passes.find((p) => p.id === b.passId)?.name ?? '' : 'Senza abbonamento'}</small>}
              </div>
              {canMark ? (
                <div className="att" role="group" aria-label={`Presenza di ${m.name}`}>
                  <button className={b.status === 'attended' ? 'on ok' : ''} aria-pressed={b.status === 'attended'} onClick={() => mark(b.id, b.status, 'attended')} aria-label="Presente"><Icon n="check" size={17} /><span>Presente</span></button>
                  <button className={b.status === 'no_show' ? 'on bad' : ''} aria-pressed={b.status === 'no_show'} onClick={() => mark(b.id, b.status, 'no_show')} aria-label="Assente"><Icon n="x" size={17} /><span>Assente</span></button>
                </div>
              ) : b.status === 'attended' ? <Badge tone="ok">Presente</Badge> : b.status === 'no_show' ? <Badge tone="bad">Assente</Badge> : <span />}
              {canBook && <button className="icon-btn sm" onClick={() => remove(b.id, m.name, false)} aria-label={`Togli ${m.name}`}><Icon n="trash" size={16} /></button>}
            </li>
          ))}
        </ul>
      )}
      {wait.length > 0 && (
        <>
          <h4>In lista d&#8217;attesa</h4>
          <ul>
            {wait.map(({ booking: b, member: m }, i) => (
              <li key={b.id}>
                <Avatar name={m.name} size={36} />
                <div className="who">{nameOf(m)}<small>{i + 1}° in lista</small></div>
                <Badge tone="warn">In attesa</Badge>
                {canBook && <button className="icon-btn sm" onClick={() => remove(b.id, m.name, true)} aria-label={`Togli ${m.name}`}><Icon n="trash" size={16} /></button>}
              </li>
            ))}
          </ul>
        </>
      )}
      {!cancelled && canBook && <div className="row"><Btn kind="ghost" size="sm" onClick={() => setPicker(true)}><Icon n="plus" size={16} /> Aggiungi iscritto</Btn></div>}
      {canBook && <MemberPicker open={picker} onClose={() => setPicker(false)} sessionId={sessionId} />}
    </div>
  );
}

export function MemberPicker({ open, onClose, sessionId }: { open: boolean; onClose: () => void; sessionId: Id }) {
  const s = useStore();
  const d = s.data!;
  const [q, setQ] = useState('');
  const taken = new Set(d.bookings.filter((b) => b.sessionId === sessionId && ['booked', 'waitlist', 'attended', 'no_show'].includes(b.status)).map((b) => b.memberId));
  const list = useMemo(() => d.members.filter((m) => m.role === 'client' && !taken.has(m.id) && m.name.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)), [d, q, sessionId]); // eslint-disable-line

  const add = async (m: Member) => {
    const r = await s.api.ownerBook(m.id, sessionId, false);
    if (!r.ok && r.error === 'no_pass') {
      const ok = await s.ask({ title: 'Nessun abbonamento valido', text: `${m.name} non ha un abbonamento per questa lezione. Aggiungerla comunque, senza scalare lezioni?`, confirm: 'Aggiungi comunque' });
      if (!ok) return;
      const r2 = await s.run(s.api.ownerBook(m.id, sessionId, true), 'Aggiunto alla lezione.');
      if (r2.ok) onClose();
      return;
    }
    const r3 = await s.run(Promise.resolve(r), (x) => (x.status === 'waitlist' ? 'Aggiunto alla lista d’attesa.' : 'Aggiunto alla lezione.'));
    if (r3.ok) onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Aggiungi iscritto">
      <Field label="Cerca per nome"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Es. Martina" data-autofocus /></Field>
      <ul className="picker">
        {list.map((m) => {
          const st = memberStatus(d, m.id, s.now);
          return (
            <li key={m.id}>
              <Avatar name={m.name} size={36} />
              <div className="who"><b>{m.name}</b><small>{st.label}{st.detail ? ` · ${st.detail}` : ''}</small></div>
              <Btn size="sm" kind="ghost" onClick={() => add(m)}>Aggiungi</Btn>
            </li>
          );
        })}
        {list.length === 0 && <li className="muted">Nessun iscritto trovato.</li>}
      </ul>
    </Sheet>
  );
}

/** Finestra con tutto quello che si può fare su una lezione. */
export function SessionSheet({ id, onClose }: { id: Id | null; onClose: () => void }) {
  const s = useStore();
  const d = s.data!;
  const sess = id ? d.sessions.find((x) => x.id === id) : undefined;
  const [edit, setEdit] = useState(false);
  const canEdit = can(s.me!.role, 'schedule');
  if (!sess) return <Sheet open={false} onClose={onClose} title="" children={null} />;
  const type = typeOf(d, sess.typeId);
  const c = counts(d, sess.id);
  const st = slotState(d, sess, s.now);

  const cancel = async () => {
    const ok = await s.ask({ title: 'Annullare la lezione?', text: `${sessionTitle(type.name, sess)}. ${c.booked + c.waitlist ? `Le ${c.booked + c.waitlist} persone prenotate vengono avvisate e le lezioni tornano nei loro abbonamenti.` : 'Nessuno è prenotato.'}`, confirm: 'Annulla lezione', cancel: 'Indietro', danger: true });
    if (!ok) return;
    const r = await s.run(s.api.cancelSession(sess.id), (x) => (x.affected ? `Lezione annullata. Avvisate ${x.affected} persone.` : 'Lezione annullata.'));
    if (r.ok) onClose();
  };

  return (
    <Sheet open onClose={onClose} title={sessionTitle(type.name, sess)} wide>
      <div className={`sess-sum ${toneClass(type.tone)}`}>
        <span><b>{c.booked}</b>/{sess.capacity} posti</span>
        <span>{sess.duration} min</span>
        <span>{sess.trainer}</span>
        {st === 'cancelled' && <Badge tone="bad">Annullata</Badge>}
        {st === 'past' && <Badge tone="mute">Conclusa</Badge>}
        {sess.note && <span className="muted">{sess.note}</span>}
      </div>
      <Roster sessionId={sess.id} />
      {sess.status === 'scheduled' && canEdit && (
        <div className="row split">
          <Btn kind="quiet" size="sm" onClick={() => setEdit(!edit)} aria-expanded={edit}><Icon n="edit" size={16} /> Modifica lezione</Btn>
          <Btn kind="quiet" size="sm" onClick={cancel}><Icon n="trash" size={16} /> Annulla lezione</Btn>
        </div>
      )}
      {edit && canEdit && sess.status === 'scheduled' && <EditSession sess={sess} onDone={() => setEdit(false)} />}
    </Sheet>
  );
}

function EditSession({ sess, onDone }: { sess: Session; onDone: () => void }) {
  const s = useStore();
  const d = s.data!;
  const booked = counts(d, sess.id).booked;
  const [day, setDay] = useState(romeDay(new Date(sess.startsAt)));
  const [time, setTime] = useState(romeHM(new Date(sess.startsAt)));
  const [capacity, setCapacity] = useState(String(sess.capacity));
  const [duration, setDuration] = useState(String(sess.duration));
  const [trainer, setTrainer] = useState(sess.trainer);
  const [note, setNote] = useState(sess.note);
  const save = async () => {
    const r = await s.run(s.api.editSession(sess.id, { startsAt: romeWall(day, time).toISOString(), capacity: Number(capacity), duration: Number(duration), trainer: trainer.trim(), note: note.trim() }), (x) => (x.promoted ? `Salvato. ${x.promoted} dalla lista d’attesa sono entrati.` : 'Lezione aggiornata.'));
    if (r.ok) onDone();
  };
  return (
    <form className="form edit-box" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="grid2">
        <Field label="Giorno"><input type="date" value={day} onChange={(e) => setDay(e.target.value)} required /></Field>
        <Field label="Ora"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></Field>
        <Field label="Posti" hint={booked ? `Almeno ${booked}: ci sono già ${booked} prenotati.` : undefined}><input type="number" min={Math.max(1, booked)} max={60} value={capacity} onChange={(e) => setCapacity(e.target.value)} required /></Field>
        <Field label="Durata (minuti)"><input type="number" min={10} max={240} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} required /></Field>
      </div>
      <Field label="Istruttore" hint="Se è il nome di un Trainer del team, la lezione compare nella sua area."><TrainerInput value={trainer} onChange={setTrainer} /></Field>
      <Field label="Nota per i clienti" hint="Si vede accanto alla lezione, ad esempio “Porta il tuo asciugamano”."><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="row"><Btn type="submit">Salva</Btn><Btn kind="quiet" onClick={onDone}>Chiudi</Btn></div>
    </form>
  );
}
