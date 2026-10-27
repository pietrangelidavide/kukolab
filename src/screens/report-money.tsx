import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Btn, Seg } from '../ui';
import { niceTop, revenueReport } from '../lib/revenue';
import { dayDM, euro, plural } from '../lib/format';

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Soldi del Report: quanto si è incassato nel periodo scelto, da dove arriva e cosa sta per scadere. Solo owner. */
export function Money({ weeks }: { weeks: number }) {
  const s = useStore();
  const d = s.data!;
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const nowKey = Math.floor(s.now.getTime() / 60000);
  const r = useMemo(() => revenueReport(d, s.now, weeks), [d, nowKey, weeks]); // eslint-disable-line react-hooks/exhaustive-deps
  const top = niceTop(Math.max(0, ...r.weekly.map((w) => w.cents)));
  const delta = r.deltaPct;
  const empty = r.count === 0;

  return (
    <>
      <div className="sec-row">
        <h2 className="sec">Soldi</h2>
        <Btn kind="ghost" size="sm" onClick={() => s.route.go('/incassi')}>Tutti gli incassi</Btn>
      </div>

      <dl className="kpis pay-kpis">
        <div>
          <dt>Incassato</dt>
          <dd>{euro(r.cents)}</dd>
          <p className={`kpi-sub${delta === null ? '' : delta >= 0 ? ' up' : ' down'}`}>
            {delta === null ? (r.cents > 0 ? 'Nel periodo prima non c’erano incassi' : 'Nessun incasso nel periodo') : `${delta > 0 ? '+' : ''}${delta}% rispetto al periodo prima (${euro(r.prev.cents)})`}
          </p>
        </div>
        <div>
          <dt>Incasso medio</dt>
          <dd>{euro(r.avgCents)}</dd>
          <p className="kpi-sub">{r.count} {plural(r.count, 'incasso', 'incassi')}{r.free > 0 ? `, ${r.free} ${plural(r.free, 'omaggio', 'omaggi')}` : ''}</p>
        </div>
        <div>
          <dt>Questo mese</dt>
          <dd>{euro(r.month.cents)}</dd>
          <p className="kpi-sub">Mese scorso: {euro(r.month.prevCents)}</p>
        </div>
        <div>
          <dt>Rinnovi in vista</dt>
          <dd>{r.renewals.count}</dd>
          <p className="kpi-sub">
            {r.renewals.count === 0 ? 'Nessun abbonamento in scadenza nei prossimi 14 giorni'
              : `Scadono entro 14 giorni: circa ${euro(r.renewals.cents)} a prezzo di listino${r.renewals.unpriced ? ` (${r.renewals.unpriced} senza prezzo)` : ''}`}
          </p>
        </div>
      </dl>

      {empty ? (
        <p className="muted">Nessun incasso registrato nel periodo: i pacchetti venduti e gli incassi liberi compaiono qui.</p>
      ) : (
        <>
          <div className="sec-row">
            <h3 className="sec sub">Incassi per settimana</h3>
            <Seg label="Vista degli incassi" value={view} onChange={setView} options={[{ v: 'chart', t: 'Grafico' }, { v: 'table', t: 'Tabella' }]} />
          </div>
          {view === 'chart' ? (
            <figure className="chart money">
              <div className="plot">
                <div className="yaxis" aria-hidden="true">{[top, top / 2, 0].map((v) => <span key={v}>{euro(v)}</span>)}</div>
                <div className={`bars${r.weekly.length > 8 ? ' dense' : ''}`} role="list">
                  {r.weekly.map((w, i) => {
                    const cur = i === r.weekly.length - 1;
                    return (
                      <button key={w.weekStart} role="listitem" className={`bar-col${cur ? ' cur' : ''}`} aria-label={`Settimana dal ${dayDM(w.weekStart)}: ${euro(w.cents)}${cur ? ', in corso' : ''}`}>
                        <span className="stack" style={{ height: `${(w.cents / top) * 100}%` }}>{w.cents > 0 && <i style={{ flexGrow: 1, background: 'var(--orange)' }} />}</span>
                        <span className="tip" role="tooltip"><b>Dal {dayDM(w.weekStart)}{cur ? ' (in corso)' : ''}</b><span className="tot">Incassato<em>{euro(w.cents)}</em></span><span>Incassi<em>{w.count}</em></span></span>
                        <span className="xl">{dayDM(w.weekStart)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="muted small">La settimana in corso è parziale. Gli incassi stornati e gli omaggi non contano.</p>
            </figure>
          ) : (
            <div className="tablewrap">
              <table>
                <caption className="sr">Incassi per settimana</caption>
                <thead><tr><th scope="col">Settimana dal</th><th scope="col">Incassi</th><th scope="col">Incassato</th></tr></thead>
                <tbody>{r.weekly.map((w) => <tr key={w.weekStart}><th scope="row">{dayDM(w.weekStart)}</th><td>{w.count}</td><td><b>{euro(w.cents)}</b></td></tr>)}</tbody>
              </table>
            </div>
          )}

          <div className="rep-cols two">
            <section>
              <h3 className="sec sub">Come hanno pagato</h3>
              <div className="tablewrap">
                <table>
                  <thead><tr><th scope="col">Metodo</th><th scope="col">Incassi</th><th scope="col">Importo</th><th scope="col">Quota</th></tr></thead>
                  <tbody>
                    {r.byMethod.map((m) => (
                      <tr key={m.method}>
                        <th scope="row">{m.label}</th><td>{m.count}</td><td>{euro(m.cents)}</td>
                        <td><span className="fillbar" role="img" aria-label={pct(m.share)}><i style={{ width: pct(m.share), background: 'var(--orange)' }} /></span> <b>{pct(m.share)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section>
              <h3 className="sec sub">Cosa ha reso di più</h3>
              <div className="tablewrap">
                <table>
                  <thead><tr><th scope="col">Pacchetto</th><th scope="col">Venduti</th><th scope="col">Incassato</th></tr></thead>
                  <tbody>
                    {r.perPack.map((x) => (
                      <tr key={x.key}><th scope="row">{x.name}</th><td>{x.sold}</td><td><b>{euro(x.cents)}</b></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
      {r.voided.count > 0 && <p className="muted small">Stornati nel periodo: {r.voided.count} {plural(r.voided.count, 'incasso', 'incassi')}, {euro(r.voided.cents)}. Non sono nei totali.</p>}
    </>
  );
}
