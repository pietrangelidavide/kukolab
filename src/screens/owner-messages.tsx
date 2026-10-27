import { useMemo, useState } from 'react';
import type { Data } from '../lib/types';
import { useStore } from '../store';
import { Avatar, Badge, Btn, Empty, Icon } from '../ui';
import { PageHead } from './common';
import { MSG_KINDS, fillSuggestions, pendingMessages } from '../lib/messages';
import type { Candidate, FillSlot, Outgoing } from '../lib/messages';
import { cap, plural, waLink } from '../lib/format';
import { HOUR } from '../lib/time';
import { markSent, unmarkSent, useSentLog } from '../sentlog';
import type { SentLog } from '../sentlog';

/** Indirizzo dell'app da scrivere nei messaggi (quello da cui sta lavorando lo studio). */
const appUrl = () => `${location.origin}/app/`;

/** Quanti messaggi ci sono ancora da mandare (per il numeretto nel menu). */
export function messagesToSend(d: Data, now: Date, sent: SentLog): number {
  return pendingMessages(d, now, { appUrl: appUrl() }).filter((m) => !sent[m.key]).length;
}

function Row({ m }: { m: Outgoing }) {
  const s = useStore();
  const link = m.phone ? waLink(m.phone, m.text) : null;
  return (
    <li className="msg">
      <div className="msg-top">
        <Avatar name={m.name} size={38} />
        <div className="who"><b>{m.name}</b><small>{m.detail}</small></div>
        <div className="msg-act">
          {link
            ? <a className="btn btn-primary btn-sm" href={link} target="_blank" rel="noopener" onClick={() => markSent(m.key)}><span><Icon n="wa" size={16} /> Invia</span></a>
            : <a className="btn btn-ghost btn-sm" href={`#/iscritti/${m.memberId}`} onClick={(e) => { e.preventDefault(); s.route.go(`/iscritti/${m.memberId}`); }}><span>Manca il telefono</span></a>}
          <button className="icon-btn sm" onClick={() => markSent(m.key)} aria-label={`Non serve mandarlo a ${m.name}`} title="Non serve"><Icon n="x" size={16} /></button>
        </div>
      </div>
      <details className="msg-text"><summary>Vedi il messaggio</summary><p>{m.text}</p></details>
    </li>
  );
}

function Invite({ c }: { c: Candidate }) {
  const link = waLink(c.member.phone, c.text);
  const why = c.reasons.slice(0, 2);
  return (
    <li className="msg">
      <div className="msg-top">
        <Avatar name={c.member.name} size={38} />
        <div className="who"><b>{c.member.name}</b><small>{why.length ? cap(why.join(', ')) : 'Può prenotare questa lezione'}</small></div>
        <div className="msg-act">
          {link && <a className="btn btn-primary btn-sm" href={link} target="_blank" rel="noopener" onClick={() => markSent(c.key)}><span><Icon n="wa" size={16} /> Invita</span></a>}
          <button className="icon-btn sm" onClick={() => markSent(c.key)} aria-label={`Non invitare ${c.member.name}`} title="Non invitare"><Icon n="x" size={16} /></button>
        </div>
      </div>
      <details className="msg-text"><summary>Vedi il messaggio</summary><p>{c.text}</p></details>
    </li>
  );
}

function Slot({ slot }: { slot: FillSlot }) {
  return (
    <section className="fill-slot" aria-label={slot.label}>
      <div className="fill-head"><b>{cap(slot.label)}</b><Badge tone="warn">{slot.seats} {plural(slot.seats, 'posto libero', 'posti liberi')}</Badge></div>
      <ul className="msgs">{slot.candidates.map((c) => <Invite key={c.key} c={c} />)}</ul>
    </section>
  );
}

export function Messages() {
  const s = useStore();
  const d = s.data!;
  const sent = useSentLog();
  const [more, setMore] = useState(false);
  const url = appUrl();
  const nowKey = Math.floor(s.now.getTime() / 60000);

  const all = useMemo(() => pendingMessages(d, s.now, { appUrl: url }), [d, nowKey, url]); // eslint-disable-line react-hooks/exhaustive-deps
  const todo = all.filter((m) => !sent[m.key]);
  const done = all.filter((m) => sent[m.key]);

  const skip = useMemo(() => new Set(Object.keys(sent).filter((k) => k.startsWith('invite:'))), [sent]);
  const recent = useMemo(() => {
    const out = new Set<string>();
    for (const [k, at] of Object.entries(sent)) if (k.startsWith('invite:') && s.now.getTime() - at < 24 * HOUR) out.add(k.split(':')[2]);
    return out;
  }, [sent, nowKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const slots = useMemo(() => fillSuggestions(d, s.now, { appUrl: url, skip, recent }), [d, nowKey, url, skip, recent]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = more ? slots : slots.slice(0, 4);

  return (
    <>
      <PageHead title="Messaggi" sub="Chi avvisare su WhatsApp, con il testo già scritto." />
      <div className="note">
        <Icon n="info" size={20} />
        <div>
          <b>Come funziona</b>
          <p>Tocca Invia: si apre WhatsApp col messaggio pronto, controllalo e premi invio. Qui ricordo cosa hai già mandato, solo su questo dispositivo.</p>
        </div>
      </div>

      {todo.length === 0 && slots.length === 0 && (
        <Empty icon="wa" title="Niente da mandare" text="Quando c’è qualcuno da avvisare (promemoria, posti liberati, abbonamenti in scadenza) lo trovi qui." />
      )}

      {MSG_KINDS.map((k) => {
        const list = todo.filter((m) => m.kind === k.id);
        if (list.length === 0) return null;
        return (
          <section key={k.id} aria-label={k.title}>
            <h2 className="sec">{k.title} <Badge tone="accent">{list.length}</Badge></h2>
            <p className="msg-hint">{k.hint}</p>
            <ul className="msgs">{list.map((m) => <Row key={m.key} m={m} />)}</ul>
          </section>
        );
      })}

      {slots.length > 0 && (
        <section aria-label="Posti da riempire">
          <h2 className="sec">Posti da riempire <Badge tone="accent">{slots.length}</Badge></h2>
          <p className="msg-hint">Lezioni delle prossime 36 ore con posti liberi, e le persone più adatte da invitare: chi fa già quel tipo di allenamento, può prenotare e non ha lezioni sovrapposte.</p>
          <div className="fill-list">{shown.map((x) => <Slot key={x.session.id} slot={x} />)}</div>
          {slots.length > 4 && <div className="row"><Btn kind="ghost" size="sm" onClick={() => setMore(!more)}>{more ? 'Mostra meno' : `Mostra le altre ${slots.length - 4}`}</Btn></div>}
        </section>
      )}

      {done.length > 0 && (
        <details className="msg-done">
          <summary>Già mandati o scartati ({done.length})</summary>
          <ul className="msgs">
            {done.map((m) => (
              <li key={m.key} className="msg msg-off">
                <div className="msg-top">
                  <Avatar name={m.name} size={32} />
                  <div className="who"><b>{m.name}</b><small>{m.detail}</small></div>
                  <div className="msg-act"><Btn kind="quiet" size="sm" onClick={() => unmarkSent(m.key)}>Rimetti da mandare</Btn></div>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
