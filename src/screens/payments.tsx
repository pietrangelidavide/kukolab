import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Badge, Btn, Empty, Field, Icon, Sheet } from '../ui';
import { MemberSearch, PageHead } from './common';
import { can } from '../lib/access';
import { METHODS, between, byMonth, methodLabel, paymentsCsv, parseEuro, totals } from '../lib/payments';
import { addDays, romeDay } from '../lib/time';
import { cap, dayDMY, dayLong, euro, monthName, plural, timeOf } from '../lib/format';
import type { Id, PayMethod, Payment } from '../lib/types';

/** Importo e metodo di pagamento. Usato nella vendita di un pacchetto e nell'incasso libero. */
export function PayFields({ amount, setAmount, method, setMethod, listCents, free }: {
  amount: string; setAmount: (v: string) => void; method: PayMethod; setMethod: (m: PayMethod) => void; listCents?: number; free?: boolean;
}) {
  const cents = parseEuro(amount);
  const hint = cents === null ? 'Scrivi un importo, ad esempio 95 o 95,50.'
    : cents === 0 ? (free ? 'Omaggio: il pacchetto si registra senza incasso.' : 'Serve un importo maggiore di zero.')
    : listCents !== undefined && cents !== listCents ? `Prezzo di listino: ${euro(listCents)}.` : undefined;
  return (
    <>
      <Field label="Importo (€)" hint={hint}>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={cents === null} autoComplete="off" />
      </Field>
      <div className="field">
        <span id="pm-l">Pagato con</span>
        <div role="group" aria-labelledby="pm-l" className="seg-wrap">
          {METHODS.map((m) => <button key={m.id} type="button" className={`chip${method === m.id ? ' on' : ''}`} aria-pressed={method === m.id} onClick={() => setMethod(m.id)}>{m.label}</button>)}
        </div>
      </div>
    </>
  );
}

const REASONS = ['Quota d’iscrizione', 'Lezione singola', 'Assicurazione', 'Altro'];

/** Un incasso che non è la vendita di un pacchetto. */
export function NewPayment({ onClose, memberId }: { onClose: () => void; memberId?: Id | null }) {
  const s = useStore();
  const [member, setMember] = useState<Id | null>(memberId ?? null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PayMethod>('cash');
  const [note, setNote] = useState('');
  const cents = parseEuro(amount);
  const valid = cents !== null && cents > 0;
  const save = async () => {
    if (!valid) return;
    const r = await s.run(s.api.addPayment({ memberId: member, amountCents: cents, method, note: note.trim() }), `Incasso registrato: ${euro(cents)}.`);
    if (r.ok) onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Registra incasso" footer={<><Btn kind="quiet" onClick={onClose}>Chiudi</Btn><Btn onClick={save} disabled={!valid}>Registra</Btn></>}>
      <p className="muted">Per un pagamento che non è un pacchetto. I pacchetti si incassano dalla scheda dell&#8217;iscritto, con “Vendi pacchetto”.</p>
      <MemberSearch value={member} onChange={(m) => setMember(m?.id ?? null)} optional />
      <PayFields amount={amount} setAmount={setAmount} method={method} setMethod={setMethod} />
      <Field label="Causale"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Es. Quota d’iscrizione" /></Field>
      <div className="row" role="group" aria-label="Causali frequenti">
        {REASONS.map((r) => <button key={r} type="button" className="chip" onClick={() => setNote(r)}>{r}</button>)}
      </div>
    </Sheet>
  );
}

type Period = 'today' | 'week' | 'month' | 'last';

function rangeOf(p: Period, today: string): { from: string; to: string; title: string } {
  const monthStart = `${today.slice(0, 7)}-01`;
  if (p === 'today') return { from: today, to: today, title: 'Oggi' };
  if (p === 'week') return { from: addDays(today, -6), to: today, title: 'Ultimi 7 giorni' };
  if (p === 'month') return { from: monthStart, to: today, title: 'Questo mese' };
  const to = addDays(monthStart, -1);
  return { from: `${to.slice(0, 7)}-01`, to, title: 'Mese scorso' };
}

function PayRow({ p, canVoid }: { p: Payment; canVoid: boolean }) {
  const s = useStore();
  const m = p.memberId ? s.data!.members.find((x) => x.id === p.memberId) : undefined;
  const toggle = async () => {
    if (p.voidedAt) { await s.run(s.api.voidPayment(p.id, false), 'Incasso ripristinato.'); return; }
    const ok = await s.ask({
      title: 'Stornare questo incasso?',
      text: `${euro(p.amountCents)}${m ? ` di ${m.name}` : ''}. Resta in elenco, segnato come stornato, e non conta più nei totali. Il pacchetto venduto non cambia.`,
      confirm: 'Storna', danger: true,
    });
    if (ok) await s.run(s.api.voidPayment(p.id), 'Incasso stornato.');
  };
  return (
    <li className={`pay${p.voidedAt ? ' void' : ''}`}>
      <span className="pay-time">{timeOf(p.paidAt)}</span>
      <div className="who">
        {m ? <a href={`#/iscritti/${m.id}`} onClick={(e) => { e.preventDefault(); s.route.go(`/iscritti/${m.id}`); }}>{m.name}</a> : <b>Senza iscritto</b>}
        <small>{p.note || '—'}{p.byName ? ` · ${p.byName}` : ''}</small>
      </div>
      <span className="pay-meta"><Badge tone="mute">{methodLabel(p.method)}</Badge>{p.voidedAt && <Badge tone="bad">Stornato</Badge>}</span>
      <b className="pay-amt">{p.amountCents === 0 ? 'Omaggio' : euro(p.amountCents)}</b>
      {canVoid && <Btn kind="quiet" size="sm" onClick={toggle}>{p.voidedAt ? 'Ripristina' : 'Storna'}</Btn>}
    </li>
  );
}

const niceTop = (cents: number): number => {
  const e = Math.max(cents / 100, 1);
  const steps = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000];
  return (steps.find((x) => x >= e) ?? Math.ceil(e / 100000) * 100000) * 100;
};

function download(name: string, text: string) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch { /* il browser non permette il download */ }
}

/** Incassi. L'owner li vede tutti, con periodi, grafico dei mesi e CSV; la Segreteria la cassa di oggi. */
export function Payments() {
  const s = useStore();
  const d = s.data!;
  const me = s.me!;
  const owner = can(me.role, 'revenue');
  const today = romeDay(s.now);
  const [period, setPeriod] = useState<Period>('today');
  const [adding, setAdding] = useState(false);
  const { from, to, title } = rangeOf(owner ? period : 'today', today);

  const list = useMemo(() => between(d.payments, from, to).sort((a, b) => b.paidAt.localeCompare(a.paidAt) || b.id.localeCompare(a.id)), [d.payments, from, to]);
  const t = totals(list);
  const days = useMemo(() => {
    const m = new Map<string, Payment[]>();
    for (const p of list) { const k = romeDay(new Date(p.paidAt)); m.set(k, [...(m.get(k) ?? []), p]); }
    return [...m.entries()];
  }, [list]);

  const months = byMonth(d.payments, s.now, 12);
  const top = niceTop(Math.max(0, ...months.map((x) => x.cents)));
  const monthTitle = (k: string) => cap(monthName(`${k}-01`));

  const sub = owner
    ? `${title}: ${t.count} ${plural(t.count, 'incasso', 'incassi')}${t.free ? `, ${t.free} ${plural(t.free, 'omaggio', 'omaggi')}` : ''}.`
    : `${cap(dayLong(today))}. Per correggere un incasso chiedi al titolare.`;

  return (
    <>
      <PageHead title={owner ? 'Incassi' : 'Cassa'} sub={sub} right={<Btn size="sm" onClick={() => setAdding(true)}><Icon n="plus" size={16} /> Registra incasso</Btn>} />

      {owner && (
        <div className="filters wrap" role="group" aria-label="Periodo">
          {([['today', 'Oggi'], ['week', '7 giorni'], ['month', 'Questo mese'], ['last', 'Mese scorso']] as [Period, string][]).map(([v, l]) => (
            <button key={v} className={`chip${period === v ? ' on' : ''}`} aria-pressed={period === v} onClick={() => setPeriod(v)}>{l}</button>
          ))}
        </div>
      )}

      <dl className="kpis pay-kpis">
        <div><dt>Incassato</dt><dd>{euro(t.cents)}</dd></div>
        <div><dt>Contanti</dt><dd>{euro(t.byMethod.cash)}</dd></div>
        <div><dt>Carta / POS</dt><dd>{euro(t.byMethod.card)}</dd></div>
        <div><dt>Bonifico e altro</dt><dd>{euro(t.byMethod.transfer + t.byMethod.other)}</dd></div>
      </dl>

      {list.length === 0 ? (
        <Empty icon="cash" title={owner ? 'Nessun incasso in questo periodo' : 'Nessun incasso oggi'} text="Quando vendi un pacchetto o registri un pagamento lo trovi qui." action={<Btn size="sm" onClick={() => setAdding(true)}>Registra incasso</Btn>} />
      ) : (
        <>
          {days.map(([day, rows]) => (
            <section key={day} aria-label={cap(dayLong(day))}>
              {(owner && from !== to) && <div className="sec-row"><h2 className="sec">{cap(dayLong(day))}</h2><b className="pay-day">{euro(totals(rows).cents)}</b></div>}
              <ul className="pays">{rows.map((p) => <PayRow key={p.id} p={p} canVoid={can(me.role, 'void')} />)}</ul>
            </section>
          ))}
          {owner && (
            <div className="row">
              <Btn kind="ghost" size="sm" onClick={() => download(`incassi-${from}_${to}.csv`, paymentsCsv(list, d.members))}><Icon n="list" size={16} /> Scarica per il commercialista (CSV)</Btn>
            </div>
          )}
        </>
      )}

      {owner && (
        <>
          <h2 className="sec">Ultimi 12 mesi</h2>
          <figure className="chart money">
            <div className="plot">
              <div className="yaxis" aria-hidden="true">{[top, top / 2, 0].map((v) => <span key={v}>{euro(v)}</span>)}</div>
              <div className="bars" role="list">
                {months.map((m, i) => {
                  const cur = i === months.length - 1;
                  return (
                    <button key={m.month} role="listitem" className={`bar-col${cur ? ' cur' : ''}`} aria-label={`${monthTitle(m.month)} ${m.month.slice(0, 4)}: ${euro(m.cents)}${cur ? ', in corso' : ''}`}>
                      <span className="stack" style={{ height: `${(m.cents / top) * 100}%` }}><i style={{ flexGrow: 1, background: 'var(--orange)' }} /></span>
                      <span className="tip" role="tooltip"><b>{monthTitle(m.month)} {m.month.slice(0, 4)}{cur ? ' (in corso)' : ''}</b><span className="tot">Incassato<em>{euro(m.cents)}</em></span><span>Incassi<em>{m.count}</em></span></span>
                      <span className="xl">{monthTitle(m.month).slice(0, 3)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="muted small">Il mese in corso è parziale. Gli incassi stornati e gli omaggi non contano. Dal {dayDMY(`${months[0].month}-01`)}.</p>
          </figure>
        </>
      )}
      {adding && <NewPayment onClose={() => setAdding(false)} />}
    </>
  );
}
