import { useStore } from '../store';
import { PageHead } from './common';
import { Fast, Points, openPoint } from './area-ui';
import { TeamSection } from './owner-team';
import { teamOf } from '../lib/team';
import { teaches } from '../lib/access';
import { trainerStats, unlinkedInstructors } from '../lib/insights';
import { addDays, romeDay } from '../lib/time';
import { plural } from '../lib/format';

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Numeri per istruttore: lezioni svolte, riempimento, presenze e assenze. Serve al Report e a Dipendenti. */
export function TrainerTable({ weeks = 8 }: { weeks?: number }) {
  const s = useStore();
  const rows = trainerStats(s.data!, s.now, weeks);
  if (rows.length === 0) return <p className="muted">Ancora nessuna lezione svolta in questo periodo.</p>;
  return (
    <div className="tablewrap">
      <table>
        <caption className="sr">Numeri per istruttore, ultime {weeks} settimane</caption>
        <thead><tr><th scope="col">Istruttore</th><th scope="col">Lezioni</th><th scope="col">Riempimento</th><th scope="col">Presenze</th><th scope="col">Assenze</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.memberId ?? r.name}>
              <th scope="row">{r.name}</th><td>{r.sessions}</td><td><b>{pct(r.fill)}</b></td><td>{r.attended}</td><td>{r.noShow}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Gestione dipendenti: Segreteria e Trainer, i loro permessi e quanto lavorano. */
export function StaffHub() {
  const s = useStore();
  const d = s.data!;
  const today = romeDay(s.now);
  const team = teamOf(d);
  const trainers = team.filter((m) => m.role === 'trainer');
  const staff = team.find((m) => m.role === 'staff');
  const unlinked = unlinkedInstructors(d, s.now, 14);
  const idle = trainers.filter((m) => !d.sessions.some((x) => x.status === 'scheduled' && x.startsAt >= s.now.toISOString() && teaches(m, x)));
  const ahead = d.sessions.filter((x) => x.status === 'scheduled' && x.startsAt >= s.now.toISOString() && romeDay(new Date(x.startsAt)) <= addDays(today, 14)).length;
  const worked = trainerStats(d, s.now, 8).reduce((n, r) => n + r.sessions, 0);

  return (
    <>
      <PageHead title="Gestione dipendenti" sub="Chi lavora nello studio, cosa vede ognuno e quanto lavora." />

      <dl className="kpis">
        <div><dt>Trainer</dt><dd>{trainers.length}</dd></div>
        <div><dt>Segreteria</dt><dd>{staff ? 'Attiva' : '—'}</dd></div>
        <div><dt>Lezioni nei prossimi 14 giorni</dt><dd>{ahead}</dd></div>
        <div><dt>Istruttori senza accesso</dt><dd>{unlinked.length}</dd></div>
      </dl>

      <h2 className="sec first">Fai prima</h2>
      <Fast cols={3} items={[
        { icon: 'user', title: 'Istruttori senza accesso', count: unlinked.length, text: 'Hanno lezioni nell’orario ma non vedono nulla nell’app', done: 'Ogni istruttore ha il suo accesso', onClick: () => openPoint('senza-accesso') },
        { icon: 'calendar', title: 'Trainer senza lezioni', count: idle.length, text: 'Hanno un accesso ma nessuna lezione in programma', done: 'Tutti i trainer hanno lezioni', onClick: () => { const el = document.getElementById('team'); el?.scrollIntoView({ block: 'start' }); } },
        { icon: 'chart', title: 'Lezioni svolte', text: `${worked} ${plural(worked, 'lezione', 'lezioni')} nelle ultime 8 settimane: vedi chi ha fatto cosa`, onClick: () => openPoint('carico') },
      ]} />

      <h2 className="sec">Funzioni</h2>
      <Points group="staff" items={[
        {
          id: 'senza-accesso', icon: 'user', title: 'Istruttori senza accesso', count: unlinked.length,
          summary: unlinked.length ? unlinked.map((u) => `${u.name} (${u.lessons})`).join(', ') : 'Tutti collegati',
          text: 'Per collegarli aggiungi un Trainer con lo stesso nome scritto nell’orario (basta il nome di battesimo): vedrà subito le sue lezioni e potrà segnare le presenze.',
          children: unlinked.length === 0 ? null : (
            <ul className="mini">
              {unlinked.map((u) => <li key={u.name}><div className="who"><b>{u.name}</b><small>{u.lessons} {plural(u.lessons, 'lezione', 'lezioni')} nei prossimi 14 giorni</small></div></li>)}
            </ul>
          ),
        },
        { id: 'carico', icon: 'chart', title: 'Lezioni e presenze per trainer', summary: `${worked} ${plural(worked, 'lezione svolta', 'lezioni svolte')} in 8 settimane`, text: 'Quante lezioni ha tenuto ognuno, quanto erano piene e come sono andate le presenze.', children: <TrainerTable weeks={8} /> },
        {
          id: 'permessi', icon: 'gear', title: 'Chi può fare cosa', summary: 'Owner, Segreteria, Trainer',
          children: (
            <dl className="perm">
              <div><dt>Owner</dt><dd>Tutto: orario, prezzi, incassi, report, team e impostazioni.</dd></div>
              <div><dt>Segreteria</dt><dd>Iscritti, orari e prenotazioni, vendita pacchetti e cassa di oggi. Non vede incassi passati, report, note private, richieste dal sito e impostazioni, e non modifica orario e prezzi.</dd></div>
              <div><dt>Trainer</dt><dd>Solo le proprie lezioni: chi è iscritto (il nome, niente contatti) e le presenze.</dd></div>
            </dl>
          ),
        },
      ]} />

      <div id="team"><TeamSection /></div>
    </>
  );
}
