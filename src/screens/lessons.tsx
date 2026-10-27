import { useState } from 'react';
import { useStore } from '../store';
import { Badge, Empty, Icon, toneClass } from '../ui';
import { PageHead } from './common';
import { Roster } from './owner-shared';
import { typeOf } from '../lib/selectors';
import { counts } from '../lib/rules';
import { teaches } from '../lib/access';
import { addDays, endOf, romeDay } from '../lib/time';
import { cap, dayLong, plural, timeOf } from '../lib/format';
import type { Session } from '../lib/types';

/** Area del Trainer: le sue lezioni di oggi, dei prossimi giorni e degli ultimi, con chi viene e le presenze. */
export function Lessons() {
  const s = useStore();
  const d = s.data!;
  const me = s.me!;
  const today = romeDay(s.now);
  const mine = d.sessions.filter((x) => teaches(me, x)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const dayOf = (x: Session) => romeDay(new Date(x.startsAt));
  const ended = (x: Session) => s.now.getTime() >= endOf(x.startsAt, x.duration);
  const first = me.name.split(' ')[0];

  const todays = mine.filter((x) => dayOf(x) === today);
  const later = mine.filter((x) => dayOf(x) > today && dayOf(x) <= addDays(today, 7));
  const recent = mine.filter((x) => dayOf(x) < today && dayOf(x) >= addDays(today, -3)).reverse();
  const toMark = (x: Session) => x.status === 'scheduled' && ended(x) && d.bookings.some((b) => b.sessionId === x.id && b.status === 'booked');
  const pending = [...todays, ...recent].filter(toMark).length;
  const [open, setOpen] = useState<string | null>(() => todays.find((x) => x.status === 'scheduled' && !ended(x))?.id ?? null);

  const card = (x: Session) => {
    const t = typeOf(d, x.typeId);
    const c = counts(d, x.id);
    const isOpen = open === x.id;
    const over = ended(x);
    return (
      <li key={x.id} className={`osess ${toneClass(t.tone)}${x.status === 'cancelled' ? ' st-cancelled' : over ? ' st-past' : ''}`}>
        <button className="osess-head" aria-expanded={isOpen} aria-controls={`l-${x.id}`} onClick={() => setOpen(isOpen ? null : x.id)}>
          <span className="slot-time"><b>{timeOf(x.startsAt)}</b><span>{x.duration} min</span></span>
          <span className="osess-main"><b>{t.name}</b><small>{dayOf(x) === today ? 'Oggi' : cap(dayLong(dayOf(x)))}</small></span>
          <span className="osess-seats">
            {x.status === 'cancelled' ? <Badge tone="bad">Annullata</Badge> : (
              <>
                <span className="meter sm" role="img" aria-label={`${c.booked} su ${x.capacity}`}><i style={{ width: `${Math.min(100, (c.booked / x.capacity) * 100)}%` }} /></span>
                <b>{c.booked}<small>/{x.capacity}</small></b>
                {toMark(x) && <Badge tone="warn">Da segnare</Badge>}
              </>
            )}
          </span>
          <Icon n={isOpen ? 'down' : 'right'} size={18} className="osess-chev" />
        </button>
        {isOpen && <div className="osess-body" id={`l-${x.id}`}><Roster sessionId={x.id} /></div>}
      </li>
    );
  };

  return (
    <>
      <PageHead title="Le mie lezioni" sub={`Ciao ${first}. ${cap(dayLong(today))}.`} />
      {mine.length === 0 ? (
        <Empty icon="calendar" title="Ancora nessuna lezione" text="Le tue lezioni compaiono qui quando nell’orario, come istruttore, c’è il tuo nome. Se ti aspettavi di vederne, chiedi allo studio di controllare il nome." />
      ) : (
        <>
          {pending > 0 && (
            <div className="note warn">
              <Icon n="alert" size={20} />
              <div><b>Presenze da segnare</b><p>{pending === 1 ? 'Hai una lezione conclusa' : `Hai ${pending} lezioni concluse`} con presenze ancora da segnare.</p></div>
            </div>
          )}
          <h2 className="sec first">Oggi</h2>
          {todays.length === 0 ? <p className="muted">Oggi non hai lezioni.</p> : <ul className="osess-list">{todays.map(card)}</ul>}

          <h2 className="sec">Prossimi giorni</h2>
          {later.length === 0 ? <p className="muted">Nessuna lezione nei prossimi 7 giorni.</p> : <ul className="osess-list">{later.map(card)}</ul>}

          {recent.length > 0 && (
            <>
              <h2 className="sec">Ultimi giorni</h2>
              <p className="muted small">{recent.length} {plural(recent.length, 'lezione', 'lezioni')} degli ultimi tre giorni: puoi ancora segnare le presenze.</p>
              <ul className="osess-list">{recent.map(card)}</ul>
            </>
          )}
        </>
      )}
    </>
  );
}
