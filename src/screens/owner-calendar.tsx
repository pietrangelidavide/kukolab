import { useState } from 'react';
import { useStore } from '../store';
import { Btn, Empty, Field, Icon, Sheet, Toggle, toneClass } from '../ui';
import { PageHead } from './common';
import { SessionSheet } from './owner-shared';
import { TrainerInput } from './common';
import { can } from '../lib/access';
import { sessionsOnDay, typeOf } from '../lib/selectors';
import { counts } from '../lib/rules';
import { addDays, eachDay, mondayOf, romeDay, romeWall } from '../lib/time';
import { cap, dayLong, dayNum, dayShort, monthName, plural, timeOf } from '../lib/format';
import type { Id, Template } from '../lib/types';

const WD = ['', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const WD3 = ['', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

// ------------------------------------------------------------------ Orari (settimana)
export function Calendar() {
  const s = useStore();
  const d = s.data!;
  const today = romeDay(s.now);
  const [monday, setMonday] = useState(mondayOf(today));
  const [sheet, setSheet] = useState<Id | null>(null);
  const [adding, setAdding] = useState(false);
  const days = [...eachDay(monday, addDays(monday, 6))];
  const label = `${dayNum(monday)} ${monthName(monday) === monthName(addDays(monday, 6)) ? '' : monthName(monday) + ' '}– ${dayNum(addDays(monday, 6))} ${monthName(addDays(monday, 6))}`;
  const any = days.some((x) => sessionsOnDay(d, x).length > 0);
  const edit = can(s.me!.role, 'schedule');

  return (
    <>
      <PageHead title="Orari" sub="Le lezioni della settimana. Tocca una lezione per vedere chi viene." right={edit ? (
        <div className="row">
          <Btn kind="ghost" size="sm" onClick={() => s.route.go('/orari/modelli')}><Icon n="repeat" size={16} /> Orario settimanale</Btn>
          <Btn size="sm" onClick={() => setAdding(true)}><Icon n="plus" size={16} /> Nuova lezione</Btn>
        </div>
      ) : undefined} />
      <div className="weeknav" role="group" aria-label="Cambia settimana">
        <button className="icon-btn" onClick={() => setMonday(addDays(monday, -7))} aria-label="Settimana precedente"><Icon n="left" size={18} /></button>
        <b aria-live="polite">{label}</b>
        <button className="icon-btn" onClick={() => setMonday(addDays(monday, 7))} aria-label="Settimana successiva"><Icon n="right" size={18} /></button>
        <Btn kind="quiet" size="sm" disabled={monday === mondayOf(today)} onClick={() => setMonday(mondayOf(today))}>Questa settimana</Btn>
      </div>
      {!any && <Empty title="Settimana senza lezioni" text={edit ? 'Aggiungi una lezione singola oppure imposta l’orario settimanale: le lezioni si creano da sole.' : 'In questa settimana non ci sono lezioni.'} action={edit ? <Btn size="sm" onClick={() => s.route.go('/orari/modelli')}>Orario settimanale</Btn> : undefined} />}
      {any && (
        <div className="week">
          {days.map((x) => {
            const list = sessionsOnDay(d, x);
            return (
              <section key={x} className={`wday${x === today ? ' today' : ''}`} aria-label={cap(dayLong(x))}>
                <h3><span>{dayShort(x)}</span> <b>{dayNum(x)}</b></h3>
                {list.length === 0 ? <p className="wnone">Nessuna lezione</p> : (
                  <ul>
                    {list.map((y) => {
                      const t = typeOf(d, y.typeId);
                      const c = counts(d, y.id);
                      const full = c.booked >= y.capacity;
                      return (
                        <li key={y.id}>
                          <button className={`wsess ${toneClass(t.tone)}${y.status === 'cancelled' ? ' off' : ''}`} onClick={() => setSheet(y.id)}>
                            <b>{timeOf(y.startsAt)}</b>
                            <span>{t.name}</span>
                            <small>{y.status === 'cancelled' ? 'Annullata' : <>{c.booked}/{y.capacity}{full ? ' · pieno' : ''}{c.waitlist ? ` · +${c.waitlist}` : ''}</>}</small>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
      <SessionSheet key={sheet ?? 'none'} id={sheet} onClose={() => setSheet(null)} />
      {adding && edit && <NewSession onClose={() => setAdding(false)} day={monday <= today && today <= addDays(monday, 6) ? today : monday} />}
    </>
  );
}

function NewSession({ onClose, day: day0 }: { onClose: () => void; day: string }) {
  const s = useStore();
  const d = s.data!;
  const [typeId, setTypeId] = useState(d.types[0]?.id ?? '');
  const t = d.types.find((x) => x.id === typeId);
  const [day, setDay] = useState(day0);
  const [time, setTime] = useState('18:00');
  const [capacity, setCapacity] = useState(String(t?.capacity ?? 8));
  const [duration, setDuration] = useState(String(t?.duration ?? 50));
  const [trainer, setTrainer] = useState('Valerio');
  const [note, setNote] = useState('');
  const pick = (id: Id) => { setTypeId(id); const x = d.types.find((y) => y.id === id); if (x) { setCapacity(String(x.capacity)); setDuration(String(x.duration)); } };
  const save = async () => {
    const r = await s.run(s.api.addSession({ typeId, startsAt: romeWall(day, time).toISOString(), capacity: Number(capacity), duration: Number(duration), trainer: trainer.trim(), note: note.trim() }), 'Lezione aggiunta.');
    if (r.ok) onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Nuova lezione" footer={<><Btn kind="quiet" onClick={onClose}>Chiudi</Btn><Btn onClick={save} disabled={!typeId || !day || !time || Number(capacity) < 1}>Aggiungi</Btn></>}>
      <p className="muted">Una lezione singola, fuori dall&#8217;orario settimanale.</p>
      <Field label="Corso"><select value={typeId} onChange={(e) => pick(e.target.value)}>{d.types.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
      <div className="grid2">
        <Field label="Giorno"><input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
        <Field label="Ora"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        <Field label="Posti"><input type="number" min={1} max={60} value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
        <Field label="Durata (minuti)"><input type="number" min={10} max={240} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} /></Field>
      </div>
      <Field label="Istruttore"><TrainerInput value={trainer} onChange={setTrainer} /></Field>
      <Field label="Nota per i clienti" hint="Facoltativa."><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Orario settimanale (modelli)
export function Templates() {
  const s = useStore();
  const d = s.data!;
  const [edit, setEdit] = useState<Template | 'new' | null>(null);
  const byDay = [1, 2, 3, 4, 5, 6, 7].map((w) => ({ w, list: d.templates.filter((t) => t.weekday === w).sort((a, b) => a.time.localeCompare(b.time)) }));

  const toggle = (t: Template, on: boolean) => s.run(s.api.saveTemplate({ ...t, active: on }), (r) => (on ? `Orario attivato: ${r.created} ${plural(r.created, 'lezione creata', 'lezioni create')}.` : 'Orario sospeso: le lezioni future senza prenotazioni sono state tolte.'));
  const remove = async (t: Template) => {
    const name = typeOf(d, t.typeId).name;
    const ok = await s.ask({ title: 'Eliminare questa riga dell’orario?', text: `${name}, ${WD[t.weekday].toLowerCase()} alle ${t.time}. Le lezioni future senza prenotazioni vengono tolte. Quelle con prenotazioni restano.`, confirm: 'Elimina', danger: true });
    if (ok) await s.run(s.api.deleteTemplate(t.id), (r) => (r.removed ? `Eliminata. Tolte ${r.removed} lezioni future vuote.` : 'Eliminata.'));
  };

  return (
    <>
      <PageHead title="Orario settimanale" sub="Ogni riga si ripete ogni settimana e crea le lezioni da prenotare." right={
        <div className="row">
          <Btn kind="quiet" size="sm" onClick={() => s.route.go('/orari')}><Icon n="left" size={16} /> Orari</Btn>
          <Btn size="sm" onClick={() => setEdit('new')}><Icon n="plus" size={16} /> Nuova riga</Btn>
        </div>
      } />
      <div className="note"><Icon n="info" size={20} /><div><b>Come funziona</b><p>Le lezioni vengono create in anticipo per le prossime settimane. Se cambi o elimini una riga, le lezioni future senza prenotazioni si aggiornano. Quelle che hanno già prenotati restano come sono: per spostarle o annullarle usa la scheda della lezione, così i clienti vengono avvisati.</p></div></div>
      <div className="tpl-days">
        {byDay.map(({ w, list }) => (
          <section key={w} className="tpl-day">
            <h2>{WD[w]}</h2>
            {list.length === 0 ? <p className="muted">Nessuna lezione.</p> : (
              <ul>
                {list.map((t) => {
                  const ty = typeOf(d, t.typeId);
                  return (
                    <li key={t.id} className={`${toneClass(ty.tone)}${t.active ? '' : ' off'}`}>
                      <b className="tpl-time">{t.time}</b>
                      <div className="who"><b>{ty.name}</b><small>{t.trainer || 'Senza istruttore'} · {t.capacity} {plural(t.capacity, 'posto', 'posti')} · {t.duration} min</small></div>
                      <Toggle on={t.active} onChange={(v) => toggle(t, v)} label={`${ty.name} ${WD[w]} ${t.time} attivo`} />
                      <button className="icon-btn sm" onClick={() => setEdit(t)} aria-label="Modifica"><Icon n="edit" size={16} /></button>
                      <button className="icon-btn sm" onClick={() => remove(t)} aria-label="Elimina"><Icon n="trash" size={16} /></button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
      {edit && <TemplateSheet key={edit === 'new' ? 'new' : edit.id} tpl={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function TemplateSheet({ tpl, onClose }: { tpl: Template | null; onClose: () => void }) {
  const s = useStore();
  const d = s.data!;
  const first = d.types[0];
  const [typeId, setTypeId] = useState(tpl?.typeId ?? first?.id ?? '');
  const [days, setDays] = useState<number[]>(tpl ? [tpl.weekday] : [1, 3]);
  const [time, setTime] = useState(tpl?.time ?? '18:30');
  const [capacity, setCapacity] = useState(String(tpl?.capacity ?? first?.capacity ?? 8));
  const [duration, setDuration] = useState(String(tpl?.duration ?? first?.duration ?? 50));
  const [trainer, setTrainer] = useState(tpl?.trainer ?? 'Valerio');
  const [active, setActive] = useState(tpl?.active ?? true);
  const [busy, setBusy] = useState(false);

  const pick = (id: Id) => { setTypeId(id); if (!tpl) { const x = d.types.find((y) => y.id === id); if (x) { setCapacity(String(x.capacity)); setDuration(String(x.duration)); } } };
  const flip = (w: number) => setDays((cur) => (tpl ? [w] : cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w].sort()));
  const valid = typeId && days.length > 0 && /^\d{2}:\d{2}$/.test(time) && Number(capacity) >= 1 && Number(duration) >= 10;

  const save = async () => {
    setBusy(true);
    let created = 0, removed = 0, last = null as Awaited<ReturnType<typeof s.api.saveTemplate>> | null;
    for (const w of days) {
      const r = await s.api.saveTemplate({ id: tpl?.id ?? '', typeId, weekday: w, time, capacity: Number(capacity), duration: Number(duration), trainer: trainer.trim(), active });
      if (!r.ok) { s.toast(r.message ?? 'Non sono riuscito a salvare.', 'error'); setBusy(false); return; }
      created += r.created; removed += r.removed; last = r;
    }
    setBusy(false);
    if (last?.ok) {
      await s.run(Promise.resolve(last), tpl ? `Salvato.${removed || created ? ` ${created} lezioni create, ${removed} tolte.` : ''}` : `${days.length} ${plural(days.length, 'riga aggiunta', 'righe aggiunte')}. ${created} lezioni create.`);
      onClose();
    }
  };

  return (
    <Sheet open onClose={onClose} title={tpl ? 'Modifica riga' : 'Nuova riga dell’orario'} footer={<><Btn kind="quiet" onClick={onClose}>Chiudi</Btn><Btn onClick={save} disabled={!valid || busy}>Salva</Btn></>}>
      <Field label="Corso"><select value={typeId} onChange={(e) => pick(e.target.value)}>{d.types.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
      <div className="field">
        <span id="wd-l">{tpl ? 'Giorno' : 'Giorni della settimana'}</span>
        <div className="row wd" role="group" aria-labelledby="wd-l">
          {[1, 2, 3, 4, 5, 6, 7].map((w) => <button key={w} type="button" className={`chip${days.includes(w) ? ' on' : ''}`} aria-pressed={days.includes(w)} onClick={() => flip(w)}>{WD3[w]}</button>)}
        </div>
        {!tpl && <small>Puoi sceglierne più di uno: stessa ora e stessi posti per tutti.</small>}
      </div>
      <div className="grid2">
        <Field label="Ora"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        <Field label="Posti"><input type="number" min={1} max={60} value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
        <Field label="Durata (minuti)"><input type="number" min={10} max={240} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} /></Field>
        <Field label="Istruttore" hint="Se è il nome di un Trainer del team (anche solo il nome di battesimo), le lezioni compaiono nella sua area."><TrainerInput value={trainer} onChange={setTrainer} /></Field>
      </div>
      <div className="row between"><span id="act-l"><b>Attiva</b><br /><small className="muted">Se è spenta non crea lezioni.</small></span><Toggle on={active} onChange={setActive} label="Attiva" /></div>
    </Sheet>
  );
}
