import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Avatar, Empty, Seg } from '../ui';
import { PageHead } from './common';
import { counts } from '../lib/rules';
import { typeOf, weeklyBookings } from '../lib/selectors';
import { addDays, endOf, mondayOf, romeDay, weekdayOf } from '../lib/time';

const WDN = ['', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
import { dayDM, plural, timeOf } from '../lib/format';
import type { Id } from '../lib/types';

// Colori dei corsi nei grafici: arancio del logo, blu, ocra. Validati su fondo scuro (distinguibili anche da chi non vede bene i colori).
const SERIES = ['#ea612b', '#3b8be0', '#b08a1a', '#9a7be8'];
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function Report() {
  const s = useStore();
  const d = s.data!;
  const [weeks, setWeeks] = useState<4 | 8 | 12>(8);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const today = romeDay(s.now);
  const from = addDays(mondayOf(today), -7 * (weeks - 1));
  const color = (id: Id) => SERIES[Math.max(0, d.types.findIndex((t) => t.id === id)) % SERIES.length];

  const r = useMemo(() => {
    const held = d.sessions.filter((x) => x.status === 'scheduled' && romeDay(new Date(x.startsAt)) >= from && endOf(x.startsAt, x.duration) <= s.now.getTime());
    const ids = new Set(held.map((x) => x.id));
    const booked = held.reduce((n, x) => n + counts(d, x.id).booked, 0);
    const seats = held.reduce((n, x) => n + x.capacity, 0);
    const bk = d.bookings.filter((b) => ids.has(b.sessionId));
    const attended = bk.filter((b) => b.status === 'attended').length;
    const noShow = bk.filter((b) => b.status === 'no_show').length;
    const late = bk.filter((b) => b.status === 'late_cancelled').length;
    const perType = d.types.map((t) => {
      const hs = held.filter((x) => x.typeId === t.id);
      const sb = hs.reduce((n, x) => n + counts(d, x.id).booked, 0);
      const ss = hs.reduce((n, x) => n + x.capacity, 0);
      return { t, sessions: hs.length, booked: sb, seats: ss, fill: ss ? sb / ss : 0 };
    });
    const slots = new Map<string, { typeId: Id; wd: number; time: string; n: number; booked: number; seats: number }>();
    for (const x of held) {
      const wd = weekdayOf(romeDay(new Date(x.startsAt)));
      const time = timeOf(x.startsAt);
      const k = `${x.typeId}|${wd}|${time}`;
      const e = slots.get(k) ?? { typeId: x.typeId, wd, time, n: 0, booked: 0, seats: 0 };
      e.n += 1; e.booked += counts(d, x.id).booked; e.seats += x.capacity;
      slots.set(k, e);
    }
    const ranked = [...slots.values()].filter((e) => e.n >= 2).map((e) => ({ ...e, fill: e.seats ? e.booked / e.seats : 0 })).sort((a, b) => b.fill - a.fill);
    const per = new Map<Id, number>();
    for (const b of bk) if (b.status === 'attended' || b.status === 'booked') per.set(b.memberId, (per.get(b.memberId) ?? 0) + 1);
    const top = [...per.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ m: d.members.find((m) => m.id === id)!, n })).filter((x) => x.m);
    return { held: held.length, booked, seats, fill: seats ? booked / seats : 0, attended, noShow, late, perType, best: ranked.slice(0, 3), worst: ranked.length > 3 ? ranked.slice(-3).reverse() : [], top };
  }, [d, from, s.now]);

  const wk = weeklyBookings(d, weeks, s.now);
  const max = Math.max(1, ...wk.map((w) => w.total));
  const step = max <= 20 ? 5 : max <= 60 ? 10 : max <= 120 ? 20 : 50;
  const top = Math.ceil(max / step) * step;
  const ticks = [0, top / 2, top];
  const typesUsed = d.types.filter((t) => wk.some((w) => (w.byType[t.id] ?? 0) > 0));

  if (d.sessions.length === 0) return <><PageHead title="Report" /><Empty icon="chart" title="Ancora nessun dato" text="Il report si riempie con le prime lezioni." /></>;

  return (
    <>
      <PageHead title="Report" sub={`Dal ${dayDM(from)} a oggi, solo lezioni già svolte.`} right={
        <Seg label="Periodo" value={String(weeks) as '4' | '8' | '12'} onChange={(v) => setWeeks(Number(v) as 4 | 8 | 12)} options={[{ v: '4', t: '4 sett.' }, { v: '8', t: '8 sett.' }, { v: '12', t: '12 sett.' }]} />
      } />

      <dl className="kpis">
        <div><dt>Lezioni svolte</dt><dd>{r.held}</dd></div>
        <div><dt>Riempimento medio</dt><dd>{pct(r.fill)}</dd></div>
        <div><dt>Presenze registrate</dt><dd>{r.attended}</dd></div>
        <div><dt>Assenze · annulli tardivi</dt><dd>{r.noShow}<small> · {r.late}</small></dd></div>
      </dl>

      <div className="sec-row">
        <h2 className="sec">Prenotazioni per settimana</h2>
        <Seg label="Vista" value={view} onChange={setView} options={[{ v: 'chart', t: 'Grafico' }, { v: 'table', t: 'Tabella' }]} />
      </div>
      <figure className="chart">
        {view === 'chart' ? (
          <>
            <figcaption className="legend" aria-label="Legenda">
              {typesUsed.map((t) => <span key={t.id}><i style={{ background: color(t.id) }} />{t.name}</span>)}
            </figcaption>
            <div className="plot">
              <div className="yaxis" aria-hidden="true">{[...ticks].reverse().map((t) => <span key={t}>{t}</span>)}</div>
              <div className="bars" role="list">
                {wk.map((w, i) => {
                  const cur = i === wk.length - 1;
                  return (
                    <button key={w.weekStart} role="listitem" className={`bar-col${cur ? ' cur' : ''}`} aria-label={`Settimana dal ${dayDM(w.weekStart)}: ${w.total} prenotazioni${cur ? ', in corso' : ''}`}>
                      <span className="stack" style={{ height: `${(w.total / top) * 100}%` }}>
                        {typesUsed.slice().reverse().map((t) => {
                          const v = w.byType[t.id] ?? 0;
                          return v ? <i key={t.id} style={{ flexGrow: v, background: color(t.id) }} /> : null;
                        })}
                      </span>
                      <span className="tip" role="tooltip">
                        <b>Dal {dayDM(w.weekStart)}{cur ? ' (in corso)' : ''}</b>
                        {typesUsed.map((t) => <span key={t.id}><i style={{ background: color(t.id) }} />{t.name}<em>{w.byType[t.id] ?? 0}</em></span>)}
                        <span className="tot">Totale<em>{w.total}</em></span>
                      </span>
                      <span className="xl">{dayDM(w.weekStart)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="muted small">La settimana in corso comprende anche le prenotazioni delle prossime lezioni.</p>
          </>
        ) : (
          <div className="tablewrap">
            <table>
              <caption className="sr">Prenotazioni per settimana e per corso</caption>
              <thead><tr><th scope="col">Settimana dal</th>{typesUsed.map((t) => <th key={t.id} scope="col">{t.name}</th>)}<th scope="col">Totale</th></tr></thead>
              <tbody>{wk.map((w) => <tr key={w.weekStart}><th scope="row">{dayDM(w.weekStart)}</th>{typesUsed.map((t) => <td key={t.id}>{w.byType[t.id] ?? 0}</td>)}<td><b>{w.total}</b></td></tr>)}</tbody>
            </table>
          </div>
        )}
      </figure>

      <h2 className="sec">Per corso</h2>
      <div className="tablewrap">
        <table>
          <thead><tr><th scope="col">Corso</th><th scope="col">Lezioni</th><th scope="col" className="hide-s">Posti</th><th scope="col">Prenotati</th><th scope="col">Riempimento</th></tr></thead>
          <tbody>
            {r.perType.map((x) => (
              <tr key={x.t.id}>
                <th scope="row"><span className="dot-key" style={{ background: color(x.t.id) }} />{x.t.name}</th>
                <td>{x.sessions}</td><td className="hide-s">{x.seats}</td><td>{x.booked}</td>
                <td><span className="fillbar" role="img" aria-label={pct(x.fill)}><i style={{ width: pct(x.fill), background: color(x.t.id) }} /></span> <b>{pct(x.fill)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rep-cols">
        <section>
          <h2 className="sec">Orari che funzionano</h2>
          {r.best.length === 0 ? <p className="muted">Servono almeno due settimane di lezioni per fare il confronto.</p> : (
            <ul className="rank">{r.best.map((e) => <li key={`${e.typeId}${e.wd}${e.time}`}><div className="who"><b>{typeOf(d, e.typeId).name}</b><small>{WDN[e.wd]} {e.time} · {e.n} {plural(e.n, 'lezione', 'lezioni')}</small></div><b>{pct(e.fill)}</b></li>)}</ul>
          )}
        </section>
        <section>
          <h2 className="sec">Orari da rivedere</h2>
          {r.worst.length === 0 ? <p className="muted">Nessun confronto possibile per ora.</p> : (
            <ul className="rank">{r.worst.map((e) => <li key={`${e.typeId}${e.wd}${e.time}`}><div className="who"><b>{typeOf(d, e.typeId).name}</b><small>{WDN[e.wd]} {e.time} · {e.n} {plural(e.n, 'lezione', 'lezioni')}</small></div><b>{pct(e.fill)}</b></li>)}</ul>
          )}
        </section>
        <section>
          <h2 className="sec">Chi viene di più</h2>
          {r.top.length === 0 ? <p className="muted">Ancora nessuna presenza.</p> : (
            <ul className="rank">{r.top.map(({ m, n }) => <li key={m.id}><Avatar name={m.name} size={32} /><div className="who"><a href={`#/iscritti/${m.id}`} onClick={(e) => { e.preventDefault(); s.route.go(`/iscritti/${m.id}`); }}>{m.name}</a></div><b>{n}</b></li>)}</ul>
          )}
        </section>
      </div>
    </>
  );
}
