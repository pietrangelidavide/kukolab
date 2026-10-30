import { useState } from 'react';
import { useStore } from '../store';
import { Btn, Icon, Sheet } from '../ui';
import { MemberSearch, PageHead } from './common';
import { ExpiringList, Fast, Points, openPoint } from './area-ui';
import { NewMember, SellPack } from './owner-members';
import { NewPayment, download, rangeOf } from './payments';
import { between, byMonth, paymentsCsv, paymentsOn, totals } from '../lib/payments';
import { renewalCandidates, renewalsDue } from '../lib/revenue';
import { romeDay } from '../lib/time';
import { cap, euro, monthName, plural } from '../lib/format';

/** Vendita rapida: si sceglie l'iscritto (o se ne crea uno) e si passa al pacchetto e all'incasso. */
function QuickSell({ onClose }: { onClose: () => void }) {
  const d = useStore().data!;
  const [buyer, setBuyer] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  if (creating) return <NewMember onClose={() => { setCreating(false); onClose(); }} />;
  const m = buyer ? d.members.find((x) => x.id === buyer) : undefined;
  if (m) return <SellPack m={m} onClose={onClose} />;
  return (
    <Sheet open onClose={onClose} title="Vendi pacchetto">
      <p className="muted">A chi vendi il pacchetto?</p>
      <MemberSearch value={null} onChange={(x) => setBuyer(x?.id ?? null)} label="Iscritto" />
      <div className="row"><Btn kind="quiet" size="sm" onClick={() => setCreating(true)}>Non è ancora iscritto</Btn></div>
    </Sheet>
  );
}

/** Fatturazione: incassi, listino e rinnovi, più il file per il commercialista. L'app registra gli incassi; non emette fatture elettroniche. */
export function BillingHub() {
  const s = useStore();
  const d = s.data!;
  const today = romeDay(s.now);
  const [dlg, setDlg] = useState<'pay' | 'sell' | null>(null);

  const cash = totals(paymentsOn(d, today));
  const [prev, cur] = byMonth(d.payments, s.now, 2);
  const due = renewalsDue(d, s.now, 14);
  const list = renewalCandidates(d, s.now, 14);
  const onSale = d.packs.filter((p) => p.active).length;
  const monthName_ = (k: string) => cap(monthName(`${k}-01`));
  const csv = (p: 'month' | 'last') => {
    const { from, to } = rangeOf(p, today);
    download(`incassi-${from}_${to}.csv`, paymentsCsv(between(d.payments, from, to), d.members));
  };

  return (
    <>
      <PageHead title="Fatturazione" sub="Incassi, listino e rinnovi: tutto quello che serve a fine mese." />

      <dl className="kpis">
        <div><dt>Incassato oggi</dt><dd>{euro(cash.cents)}</dd></div>
        <div><dt>{monthName_(cur.month)}</dt><dd>{euro(cur.cents)}</dd></div>
        <div><dt>{monthName_(prev.month)}</dt><dd>{euro(prev.cents)}</dd></div>
        <div><dt>Rinnovi in arrivo (14 gg)</dt><dd>{due.count}</dd></div>
      </dl>

      <h2 className="sec first">Fai prima</h2>
      <Fast items={[
        { icon: 'cash', title: 'Registra un incasso', text: 'Quota, lezione singola, assicurazione, altro', onClick: () => setDlg('pay') },
        { icon: 'ticket', title: 'Vendi un pacchetto', text: 'Scegli l’iscritto: pacchetto e incasso insieme', onClick: () => setDlg('sell') },
        { icon: 'bolt', title: 'Rinnovi in arrivo', count: due.count, text: due.cents > 0 ? `Circa ${euro(due.cents)} a prezzo di listino` : 'Abbonamenti che scadono senza rinnovo', done: 'Nessun rinnovo da inseguire', onClick: () => openPoint('rinnovi') },
        { icon: 'download', title: 'File per il commercialista', text: 'Gli incassi del mese in un CSV per Excel', onClick: () => openPoint('csv') },
      ]} />

      <h2 className="sec">Funzioni</h2>
      <Points group="billing" items={[
        {
          id: 'rinnovi', icon: 'bolt', title: 'Rinnovi in arrivo', count: due.count,
          summary: due.count ? `${due.count} ${plural(due.count, 'abbonamento scade', 'abbonamenti scadono')} entro 14 giorni${due.cents > 0 ? `, circa ${euro(due.cents)}` : ''}` : 'Nessuno entro 14 giorni',
          text: 'Chi scade e non ha già rinnovato. Scrivere prima della scadenza è il modo più semplice per tenere gli incassi.',
          children: <ExpiringList items={list} />,
        },
        { id: 'incassi', icon: 'cash', title: 'Incassi', summary: `Oggi ${euro(cash.cents)} · ${monthName_(cur.month)} ${euro(cur.cents)}`, text: 'Tutti gli incassi per periodo, con metodo di pagamento, storni e grafico degli ultimi 12 mesi.', links: [{ label: 'Apri gli incassi', to: '/incassi' }] },
        { id: 'listino', icon: 'ticket', title: 'Listino pacchetti', summary: `${onSale} ${plural(onSale, 'pacchetto', 'pacchetti')} in vendita`, text: 'Quello che vendi in studio, con prezzo, validità e corsi inclusi. Alla vendita si propone il prezzo di listino.', links: [{ label: 'Apri il listino', to: '/pacchetti' }] },
        {
          id: 'csv', icon: 'download', title: 'File per il commercialista',
          summary: 'Incassi del mese o del mese scorso, in CSV',
          text: 'Un file per Excel con data, ora, iscritto, descrizione, metodo e importo di ogni incasso. Gli storni e gli omaggi sono segnati.',
          children: (
            <div className="row">
              <Btn size="sm" onClick={() => csv('last')}><Icon n="download" size={16} /> {monthName_(prev.month)}</Btn>
              <Btn size="sm" kind="ghost" onClick={() => csv('month')}><Icon n="download" size={16} /> {monthName_(cur.month)} finora</Btn>
            </div>
          ),
        },
        { id: 'fe', icon: 'receipt', title: 'Fatture elettroniche', summary: 'Non si emettono da qui', text: 'L’app registra gli incassi e prepara i dati per il commercialista. La fattura elettronica resta nel tuo programma di fatturazione.' },
      ]} />

      {dlg === 'pay' && <NewPayment onClose={() => setDlg(null)} />}
      {dlg === 'sell' && <QuickSell onClose={() => setDlg(null)} />}
    </>
  );
}
