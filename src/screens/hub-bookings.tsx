import { useState } from 'react';
import { useStore } from '../store';
import { Badge, Btn, Field, Toggle, toneClass } from '../ui';
import { PageHead } from './common';
import { Fast, Points, openPoint } from './area-ui';
import { Roster, SessionSheet } from './owner-shared';
import { attendanceToMark, lowFillSoon, waitlistSoon } from '../lib/insights';
import { kpiBetween, sessionsOnDay, typeOf } from '../lib/selectors';
import { counts } from '../lib/rules';
import { addDays, mondayOf, romeDay } from '../lib/time';
import { cap, dayLong, plural, timeOf } from '../lib/format';
import type { Session, Settings } from '../lib/types';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const label = (s: Session, name: string) => `${name} · ${cap(dayLong(romeDay(new Date(s.startsAt)))).split(' ').slice(0, 2).join(' ')} ${timeOf(s.startsAt)}`;

/** Gestione prenotazioni: cosa c'è da fare sulle lezioni (presenze, attese, lezioni da riempire) e le funzioni per organizzare l'orario. */
export function BookingsHub() {
  const s = useStore();
  const d = s.data!;
  const go = s.route.go;
  const today = romeDay(s.now);
  const [sheet, setSheet] = useState<string | null>(null);

  const live = sessionsOnDay(d, today).filter((x) => x.status === 'scheduled');
  const booked = live.reduce((n, x) => n + counts(d, x.id).booked, 0);
  const seats = live.reduce((n, x) => n + x.capacity, 0);
  const wk = mondayOf(today);
  const week = kpiBetween(d, wk, addDays(wk, 6));
  const toMark = attendanceToMark(d, s.now);
  const unmarked = toMark.reduce((n, x) => n + x.unmarked, 0);
  const waits = waitlistSoon(d, s.now, 7);
  const low = lowFillSoon(d, s.now, 3);
  const ahead = d.sessions.filter((x) => x.status === 'scheduled' && x.startsAt >= s.now.toISOString() && romeDay(new Date(x.startsAt)) <= addDays(today, 7)).length;
  const rows = d.templates.filter((t) => t.active).length;
  const st = d.settings;

  return (
    <>
      <PageHead title="Gestione prenotazioni" sub="Lezioni, presenze, liste d’attesa e orario: cominci da quello che c’è da fare." />

      <dl className="kpis">
        <div><dt>Lezioni oggi</dt><dd>{live.length}</dd></div>
        <div><dt>Prenotati oggi</dt><dd>{booked}<small>/{seats}</small></dd></div>
        <div><dt>Liste d&#8217;attesa</dt><dd>{waits.length}</dd></div>
        <div><dt>Riempimento settimana</dt><dd>{pct(week.fill)}</dd></div>
      </dl>

      <h2 className="sec first">Fai prima</h2>
      <Fast items={[
        { icon: 'check', title: 'Presenze da segnare', count: toMark.length, text: `${unmarked} ${plural(unmarked, 'iscritto', 'iscritti')} su ${toMark.length} ${plural(toMark.length, 'lezione', 'lezioni')} già fatte`, done: 'Tutte le presenze sono segnate', onClick: () => openPoint('presenze') },
        { icon: 'clock', title: 'Liste d’attesa', count: waits.length, text: `${waits.length} ${plural(waits.length, 'lezione piena', 'lezioni piene')} con gente in coda`, done: 'Nessuno in coda', onClick: () => openPoint('attesa') },
        { icon: 'bolt', title: 'Lezioni da riempire', count: low.length, text: 'Nei prossimi 3 giorni, con pochi iscritti', done: 'Le prossime lezioni sono ben avviate', onClick: () => openPoint('vuote') },
        { icon: 'calendar', title: 'Nuova lezione', text: 'Aggiungi una lezione extra o sposta una esistente', onClick: () => go('/orari') },
      ]} />

      <h2 className="sec">Funzioni</h2>
      <Points group="bookings" items={[
        {
          id: 'presenze', icon: 'check', title: 'Presenze', count: toMark.length,
          summary: toMark.length ? `${toMark.length} ${plural(toMark.length, 'lezione', 'lezioni')} da chiudere, ultimi 7 giorni` : 'Tutte segnate',
          children: toMark.length === 0 ? <p className="muted">Nessuna lezione in sospeso: chi è venuto e chi no è già registrato.</p> : (
            <>
              {toMark.slice(0, 4).map(({ session: x }) => (
                <section key={x.id} className={`pt-sess ${toneClass(typeOf(d, x.typeId).tone)}`}>
                  <h4>{label(x, typeOf(d, x.typeId).name)}<small>{x.trainer}</small></h4>
                  <Roster sessionId={x.id} />
                </section>
              ))}
              {toMark.length > 4 && <p className="muted small">E altre {toMark.length - 4}: finite queste compaiono qui.</p>}
            </>
          ),
        },
        {
          id: 'attesa', icon: 'clock', title: 'Liste d’attesa', count: waits.length,
          summary: waits.length ? `${waits.reduce((n, x) => n + counts(d, x.id).waitlist, 0)} persone in coda, prossimi 7 giorni` : 'Nessuna nei prossimi 7 giorni',
          text: 'Se si libera un posto entra da solo il primo della lista. Da qui puoi anche aggiungere un posto o spostare la lezione.',
          children: waits.length === 0 ? null : (
            <ul className="mini">
              {waits.map((x) => (
                <li key={x.id}>
                  <div className="who"><b>{label(x, typeOf(d, x.typeId).name)}</b><small>{counts(d, x.id).waitlist} in attesa · {counts(d, x.id).booked}/{x.capacity} posti</small></div>
                  <Btn kind="ghost" size="sm" onClick={() => setSheet(x.id)}>Apri</Btn>
                </li>
              ))}
            </ul>
          ),
        },
        {
          id: 'vuote', icon: 'bolt', title: 'Lezioni da riempire', count: low.length,
          summary: low.length ? `${low.length} con al massimo il 30% dei posti presi` : 'Niente da segnalare',
          text: 'Per riempirle puoi invitare gli iscritti che potrebbero venire: in Messaggi trovi già i nomi e il testo pronto.',
          children: low.length === 0 ? null : (
            <>
              <ul className="mini">
                {low.map(({ session: x, booked: b }) => (
                  <li key={x.id}>
                    <div className="who"><b>{label(x, typeOf(d, x.typeId).name)}</b><small>{b}/{x.capacity} posti · {x.trainer}</small></div>
                    <Btn kind="ghost" size="sm" onClick={() => setSheet(x.id)}>Apri</Btn>
                  </li>
                ))}
              </ul>
              <div className="row"><Btn size="sm" onClick={() => go('/messaggi')}>Invita su WhatsApp</Btn></div>
            </>
          ),
        },
        { id: 'oggi', icon: 'home', title: 'Lezioni di oggi', summary: `${live.length} ${plural(live.length, 'lezione', 'lezioni')} · ${booked}/${seats} prenotati`, text: 'L’elenco del giorno: chi è prenotato, chi è in attesa, le presenze.', links: [{ label: 'Apri Oggi', to: '/oggi' }] },
        { id: 'calendario', icon: 'calendar', title: 'Calendario e lezioni extra', summary: `${ahead} ${plural(ahead, 'lezione', 'lezioni')} nei prossimi 7 giorni`, text: 'Aggiungi una lezione fuori orario, sposta o annulla quelle esistenti. Chi è prenotato viene avvisato.', links: [{ label: 'Apri il calendario', to: '/orari' }] },
        { id: 'orario', icon: 'repeat', title: 'Orario settimanale', summary: `${rows} ${plural(rows, 'riga attiva', 'righe attive')}`, text: 'Le lezioni che si ripetono ogni settimana: giorno, ora, corso, istruttore e posti.', links: [{ label: 'Modifica l’orario', to: '/orari/modelli' }] },
        { id: 'regole', icon: 'gear', title: 'Regole di prenotazione', summary: `Annullo gratis fino a ${st.cancelWindowHours} ore prima · si prenota fino a ${st.bookingHorizonDays} giorni prima`, text: 'Annulli, anticipo massimo, chiusura delle prenotazioni e lista d’attesa: valgono per tutti i clienti.', links: [{ label: 'Cambia le regole', to: '/prenotazioni/regole' }] },
      ]} />
      <SessionSheet key={sheet ?? 'none'} id={sheet} onClose={() => setSheet(null)} />
    </>
  );
}

/** Le regole di prenotazione dello studio (prima stavano in Impostazioni). */
export function BookingRules() {
  const s = useStore();
  const d = s.data!;
  const [cw, setCw] = useState(String(d.settings.cancelWindowHours));
  const [hz, setHz] = useState(String(d.settings.bookingHorizonDays));
  const [bc, setBc] = useState(String(d.settings.bookingCloseMinutes));
  const [wl, setWl] = useState(d.settings.waitlistEnabled);
  const next: Settings = { ...d.settings, cancelWindowHours: Number(cw), bookingHorizonDays: Number(hz), bookingCloseMinutes: Number(bc), waitlistEnabled: wl };
  const valid = Number(cw) >= 0 && Number(cw) <= 72 && Number(hz) >= 1 && Number(hz) <= 60 && Number(bc) >= 0 && Number(bc) <= 240 && cw !== '' && hz !== '' && bc !== '';
  const dirty = JSON.stringify(next) !== JSON.stringify(d.settings);

  return (
    <>
      <PageHead title="Regole di prenotazione" sub="Valgono per tutti i clienti." />
      <form className="form narrow" onSubmit={async (e) => { e.preventDefault(); await s.run(s.api.saveSettings(next), 'Regole salvate.'); }}>
        <Field label="Annullo gratuito fino a (ore prima)" hint={Number(cw) === 0 ? 'Si può annullare gratis fino all’inizio della lezione.' : `Chi annulla a meno di ${cw || 0} ore dall’inizio perde la lezione.`}><input type="number" min={0} max={72} value={cw} onChange={(e) => setCw(e.target.value)} /></Field>
        <Field label="Si prenota fino a (giorni in anticipo)" hint="Le lezioni più lontane non si possono ancora prenotare."><input type="number" min={1} max={60} value={hz} onChange={(e) => setHz(e.target.value)} /></Field>
        <Field label="Le prenotazioni chiudono (minuti prima)" hint="Dopo questo limite il cliente non prenota più da solo: puoi sempre aggiungerlo tu."><input type="number" min={0} max={240} value={bc} onChange={(e) => setBc(e.target.value)} /></Field>
        <div className="row between"><span><b>Lista d&#8217;attesa</b><br /><small className="muted">Se la lezione è piena, il cliente può mettersi in coda: se si libera un posto entra da solo.</small></span><Toggle on={wl} onChange={setWl} label="Lista d’attesa" /></div>
        <div className="row"><Btn type="submit" disabled={!dirty || !valid}>Salva</Btn>{dirty && <Badge tone="warn">Modifiche non salvate</Badge>}</div>
      </form>
    </>
  );
}
