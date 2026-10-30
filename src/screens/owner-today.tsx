import { useState } from 'react';
import { useStore } from '../store';
import { Badge, Btn, Empty, Icon, Sheet, toneClass } from '../ui';
import { PageHead } from './common';
import { Roster, SessionSheet } from './owner-shared';
import { NewMember, SellPack } from './owner-members';
import { NewPayment } from './payments';
import { MemberSearch } from './common';
import { can } from '../lib/access';
import { paymentsOn, totals } from '../lib/payments';
import { expiringPasses, kpiBetween, sessionsOnDay, slotState, typeOf } from '../lib/selectors';
import { counts } from '../lib/rules';
import { addDays, mondayOf, romeDay } from '../lib/time';
import { cap, dayDM, dayLong, euro, plural, timeOf, waLink } from '../lib/format';
import { ago, leadLabel, leadsNew } from '../lib/leads';
import { messagesToSend } from './owner-messages';
import { useSentLog } from '../sentlog';
import { attendanceToMark } from '../lib/insights';

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function Today() {
  const s = useStore();
  const d = s.data!;
  const today = romeDay(s.now);
  const [day, setDay] = useState(today);
  const list = sessionsOnDay(d, day);
  const [open, setOpen] = useState<string | null>(() => sessionsOnDay(d, today).find((x) => x.status === 'scheduled' && slotState(d, x, s.now) !== 'past')?.id ?? null);
  const [sheet, setSheet] = useState<string | null>(null);
  const role = s.me!.role;
  const owner = role === 'owner';
  const [quick, setQuick] = useState<'member' | 'sell' | 'pay' | null>(null);
  const [buyer, setBuyer] = useState<string | null>(null);
  const cash = totals(paymentsOn(d, today));

  const live = list.filter((x) => x.status === 'scheduled');
  const booked = live.reduce((n, x) => n + counts(d, x.id).booked, 0);
  const seats = live.reduce((n, x) => n + x.capacity, 0);
  const waiting = live.reduce((n, x) => n + counts(d, x.id).waitlist, 0);
  const wk = mondayOf(day);
  const week = kpiBetween(d, wk, addDays(wk, 6));

  const soon = expiringPasses(d, s.now, 7);
  const toMark = attendanceToMark(d, s.now);
  const fresh = leadsNew(d);
  const toSend = messagesToSend(d, s.now, useSentLog());
  const waits = d.sessions
    .filter((x) => x.status === 'scheduled' && x.startsAt >= s.now.toISOString() && romeDay(new Date(x.startsAt)) <= addDays(today, 7) && counts(d, x.id).waitlist > 0)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <>
      <PageHead title={day === today ? 'Oggi' : cap(dayLong(day))} sub={day === today ? cap(dayLong(day)) : undefined} right={
        <div className="daynav" role="group" aria-label="Cambia giorno">
          <button className="icon-btn" onClick={() => setDay(addDays(day, -1))} aria-label="Giorno precedente"><Icon n="left" size={18} /></button>
          <Btn kind="ghost" size="sm" disabled={day === today} onClick={() => setDay(today)}>Oggi</Btn>
          <button className="icon-btn" onClick={() => setDay(addDays(day, 1))} aria-label="Giorno successivo"><Icon n="right" size={18} /></button>
        </div>
      } />

      {!owner && (
        <div className="row quick" role="group" aria-label="Azioni del banco">
          <Btn size="sm" onClick={() => setQuick('member')}><Icon n="plus" size={16} /> Nuovo iscritto</Btn>
          <Btn size="sm" onClick={() => { setBuyer(null); setQuick('sell'); }}><Icon n="ticket" size={16} /> Vendi pacchetto</Btn>
          <Btn size="sm" kind="ghost" onClick={() => setQuick('pay')}><Icon n="cash" size={16} /> Registra incasso</Btn>
        </div>
      )}

      <dl className="kpis">
        <div><dt>Lezioni</dt><dd>{live.length}</dd></div>
        <div><dt>Prenotati</dt><dd>{booked}<small>/{seats}</small></dd></div>
        <div><dt>In attesa</dt><dd>{waiting}</dd></div>
        <div><dt>Riempimento settimana</dt><dd>{pct(week.fill)}</dd></div>
      </dl>

      <div className="today-grid">
        <section aria-label="Lezioni del giorno">
          {list.length === 0 ? (
            <Empty title="Nessuna lezione" text="Per questo giorno non ci sono lezioni. Puoi aggiungerne una dagli Orari." action={<Btn size="sm" onClick={() => s.route.go('/orari')}>Vai agli orari</Btn>} />
          ) : (
            <ul className="osess-list">
              {list.map((x) => {
                const t = typeOf(d, x.typeId);
                const c = counts(d, x.id);
                const st = slotState(d, x, s.now);
                const isOpen = open === x.id;
                return (
                  <li key={x.id} className={`osess ${toneClass(t.tone)} st-${st}`}>
                    <button className="osess-head" aria-expanded={isOpen} aria-controls={`r-${x.id}`} onClick={() => setOpen(isOpen ? null : x.id)}>
                      <span className="slot-time"><b>{timeOf(x.startsAt)}</b><span>{x.duration} min</span></span>
                      <span className="osess-main">
                        <b>{t.name}</b>
                        <small>{x.trainer}</small>
                      </span>
                      <span className="osess-seats">
                        {st === 'cancelled' ? <Badge tone="bad">Annullata</Badge> : (
                          <>
                            <span className="meter sm" role="img" aria-label={`${c.booked} su ${x.capacity}`}><i style={{ width: `${Math.min(100, (c.booked / x.capacity) * 100)}%` }} /></span>
                            <b>{c.booked}<small>/{x.capacity}</small></b>
                            {c.waitlist > 0 && <Badge tone="warn">+{c.waitlist} in attesa</Badge>}
                            {st === 'past' && <Badge tone="mute">Conclusa</Badge>}
                          </>
                        )}
                      </span>
                      <Icon n={isOpen ? 'down' : 'right'} size={18} className="osess-chev" />
                    </button>
                    {isOpen && (
                      <div className="osess-body" id={`r-${x.id}`}>
                        <Roster sessionId={x.id} />
                        {can(role, 'schedule') && <div className="row"><Btn kind="quiet" size="sm" onClick={() => setSheet(x.id)}><Icon n="edit" size={16} /> Modifica o annulla</Btn></div>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="follow" aria-label="Da seguire">
          <h2 className="sec first">Da seguire</h2>
          <div className="panel">
            <h3>{owner ? 'Incassi di oggi' : 'Cassa di oggi'}</h3>
            <p className="pay-big">{euro(cash.cents)}</p>
            <p className="muted">{cash.count === 0 ? 'Ancora nessun incasso.' : `${cash.count} ${plural(cash.count, 'incasso', 'incassi')}: ${euro(cash.byMethod.cash)} in contanti, ${euro(cash.byMethod.card)} con carta.`}</p>
            <div className="row"><Btn kind="ghost" size="sm" onClick={() => s.route.go(owner ? '/fatturazione' : '/cassa')}>{owner ? 'Apri la fatturazione' : 'Apri la cassa'}</Btn></div>
          </div>
          {owner && <div className="panel">
            <h3>Presenze da segnare{toMark.length > 0 && <Badge tone="accent">{toMark.length}</Badge>}</h3>
            <p className="muted">{toMark.length === 0 ? 'Tutte le presenze sono segnate.' : `${toMark.length} ${plural(toMark.length, 'lezione già fatta', 'lezioni già fatte')} con iscritti da segnare presenti o assenti.`}</p>
            {toMark.length > 0 && <div className="row"><Btn kind="ghost" size="sm" onClick={() => s.route.go('/prenotazioni')}>Segna le presenze</Btn></div>}
          </div>}
          {owner && <div className="panel">
            <h3>Messaggi WhatsApp{toSend > 0 && <Badge tone="accent">{toSend}</Badge>}</h3>
            <p className="muted">{toSend === 0 ? 'Nessun messaggio da mandare.' : `${toSend} ${plural(toSend, 'messaggio pronto da mandare', 'messaggi pronti da mandare')}: promemoria, posti liberati, abbonamenti in scadenza.`}</p>
            <div className="row"><Btn kind="ghost" size="sm" onClick={() => s.route.go('/messaggi')}>Apri i messaggi</Btn></div>
          </div>}
          {owner && <div className="panel panel-leads">
            <h3>Richieste dal sito{fresh.length > 0 && <Badge tone="accent">{fresh.length} {plural(fresh.length, 'nuova', 'nuove')}</Badge>}</h3>
            {fresh.length === 0 ? <p className="muted">Nessuna richiesta nuova.</p> : (
              <ul>
                {fresh.slice(0, 4).map((l) => (
                  <li key={l.id}>
                    <div className="who"><b>{l.name}</b><small>{leadLabel(d, l)} · {ago(l.createdAt, s.now)}</small></div>
                    {l.phone && <a className="icon-btn sm" href={`tel:${l.phone.replace(/\s/g, '')}`} aria-label={`Chiama ${l.name}`}><Icon n="phone" size={16} /></a>}
                  </li>
                ))}
              </ul>
            )}
            <div className="row"><Btn kind="ghost" size="sm" onClick={() => s.route.go('/richieste')}>{fresh.length > 4 ? `Vedi tutte (${fresh.length})` : 'Apri le richieste'}</Btn></div>
          </div>}
          <div className="panel">
            <h3>Abbonamenti in scadenza</h3>
            {soon.length === 0 ? <p className="muted">Nessuno nei prossimi 7 giorni.</p> : (
              <ul>
                {soon.slice(0, 6).map(({ pass: p, member: m, reason }) => {
                  const wa = m.phone ? waLink(m.phone, `Ciao ${m.name.split(' ')[0]}, ti scrivo da KUKO LAB: il tuo abbonamento “${p.name}” sta per terminare. Vuoi rinnovarlo?`) : null;
                  return (
                    <li key={p.id}>
                      <div className="who">
                        <a href={`#/iscritti/${m.id}`} onClick={(e) => { e.preventDefault(); s.route.go(`/iscritti/${m.id}`); }}>{m.name}</a>
                        <small>{p.name} · {reason === 'date' ? `scade il ${dayDM(p.expiresOn)}` : `${p.creditsLeft} ${plural(p.creditsLeft ?? 0, 'lezione rimasta', 'lezioni rimaste')}`}</small>
                      </div>
                      {wa && <a className="icon-btn sm" href={wa} target="_blank" rel="noopener" aria-label={`Scrivi a ${m.name} su WhatsApp`}><Icon n="wa" size={16} /></a>}
                    </li>
                  );
                })}
              </ul>
            )}
            {soon.length > 6 && <p className="muted small">E altri {soon.length - 6}.</p>}
          </div>
          <div className="panel">
            <h3>Liste d&#8217;attesa</h3>
            {waits.length === 0 ? <p className="muted">Nessuna lista d&#8217;attesa nei prossimi 7 giorni.</p> : (
              <ul>
                {waits.slice(0, 6).map((x) => (
                  <li key={x.id}>
                    <div className="who"><b>{typeOf(d, x.typeId).name}, {cap(dayLong(romeDay(new Date(x.startsAt)))).split(' ').slice(0, 2).join(' ')} {timeOf(x.startsAt)}</b><small>{counts(d, x.id).waitlist} in attesa · {counts(d, x.id).booked}/{x.capacity} posti</small></div>
                    <Btn kind="ghost" size="sm" onClick={() => setSheet(x.id)}>Apri</Btn>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
      <SessionSheet key={sheet ?? 'none'} id={sheet} onClose={() => setSheet(null)} />
      {quick === 'member' && <NewMember onClose={() => setQuick(null)} />}
      {quick === 'pay' && <NewPayment onClose={() => setQuick(null)} />}
      {quick === 'sell' && !buyer && (
        <Sheet open onClose={() => setQuick(null)} title="Vendi pacchetto">
          <p className="muted">A chi vendi il pacchetto?</p>
          <MemberSearch value={null} onChange={(m) => setBuyer(m?.id ?? null)} label="Iscritto" />
          <div className="row"><Btn kind="quiet" size="sm" onClick={() => { setQuick('member'); }}>Non è ancora iscritto</Btn></div>
        </Sheet>
      )}
      {quick === 'sell' && buyer && d.members.find((m) => m.id === buyer) && <SellPack m={d.members.find((m) => m.id === buyer)!} onClose={() => { setQuick(null); setBuyer(null); }} />}
    </>
  );
}
