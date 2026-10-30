import { useState } from 'react';
import { useStore } from '../store';
import { Btn, Icon } from '../ui';
import { PageHead } from './common';
import { DormantList, ExpiringList, Fast, Points, openPoint } from './area-ui';
import { NewMember } from './owner-members';
import { messagesToSend } from './owner-messages';
import { useSentLog } from '../sentlog';
import { activeClients, dormantMembers } from '../lib/insights';
import { expiringPasses } from '../lib/selectors';
import { LEAD_OPEN, ago, leadLabel, leadsNew } from '../lib/leads';
import { plural } from '../lib/format';

const DORMANT_DAYS = 30;

/** Gestione clienti: chi richiamare oggi (richieste, rinnovi, iscritti fermi), i messaggi pronti e l'elenco degli iscritti. */
export function ClientsHub() {
  const s = useStore();
  const d = s.data!;
  const go = s.route.go;
  const [adding, setAdding] = useState(false);
  const sent = useSentLog();

  const clients = d.members.filter((m) => m.role === 'client').length;
  const active = activeClients(d, s.now);
  const soon = expiringPasses(d, s.now, 7);
  const fresh = leadsNew(d);
  const open = d.leads.filter((l) => LEAD_OPEN.includes(l.status)).length;
  const toSend = messagesToSend(d, s.now, sent);
  const dormant = dormantMembers(d, s.now, DORMANT_DAYS);

  return (
    <>
      <PageHead title="Gestione clienti" sub="Chi richiamare oggi e dove trovare tutto sugli iscritti." right={<Btn size="sm" onClick={() => setAdding(true)}><Icon n="plus" size={16} /> Nuovo iscritto</Btn>} />

      <dl className="kpis">
        <div><dt>Iscritti</dt><dd>{clients}</dd></div>
        <div><dt>Con abbonamento valido</dt><dd>{active}</dd></div>
        <div><dt>In scadenza (7 giorni)</dt><dd>{soon.length}</dd></div>
        <div><dt>Richieste nuove</dt><dd>{fresh.length}</dd></div>
      </dl>

      <h2 className="sec first">Fai prima</h2>
      <Fast items={[
        { icon: 'wa', title: 'Messaggi pronti', count: toSend, text: 'Promemoria, posti liberati e rinnovi: testo già scritto', done: 'Nessun messaggio da mandare', onClick: () => go('/messaggi') },
        { icon: 'inbox', title: 'Richieste dal sito', count: fresh.length, text: 'Prove gratuite e consulenze da richiamare', done: 'Nessuna richiesta nuova', onClick: () => go('/richieste') },
        { icon: 'ticket', title: 'Da rinnovare', count: soon.length, text: 'Abbonamenti in scadenza o quasi finiti', done: 'Nessun abbonamento in scadenza', onClick: () => openPoint('scadenza') },
        { icon: 'bolt', title: 'Fermi da un mese', count: dormant.length, text: 'Hanno un abbonamento ma non vengono: un messaggio basta', done: 'Chi ha un abbonamento sta venendo', onClick: () => openPoint('fermi') },
      ]} />

      <h2 className="sec">Funzioni</h2>
      <Points group="clients" items={[
        {
          id: 'scadenza', icon: 'ticket', title: 'Abbonamenti in scadenza', count: soon.length,
          summary: soon.length ? `${soon.length} entro 7 giorni o con 2 lezioni rimaste` : 'Nessuno nei prossimi 7 giorni',
          text: 'Chi scade entro una settimana o ha solo 1–2 lezioni: scrivigli prima che smetta di venire.',
          children: <ExpiringList items={soon} />,
        },
        {
          id: 'fermi', icon: 'bolt', title: 'Iscritti fermi da un mese', count: dormant.length,
          summary: dormant.length ? `${dormant.length} con abbonamento valido e nessuna lezione da ${DORMANT_DAYS} giorni` : 'Tutti attivi',
          text: 'Pagano ma non vengono: sono i primi a non rinnovare. Un messaggio ora costa meno che recuperarli dopo.',
          children: <DormantList items={dormant} />,
        },
        {
          id: 'richieste', icon: 'inbox', title: 'Richieste dal sito', count: fresh.length,
          summary: `${fresh.length} ${plural(fresh.length, 'nuova', 'nuove')} · ${open} ${plural(open, 'aperta', 'aperte')}`,
          children: fresh.length === 0 ? <p className="muted">Nessuna richiesta nuova.</p> : (
            <ul className="mini">
              {fresh.slice(0, 4).map((l) => (
                <li key={l.id}>
                  <div className="who"><b>{l.name}</b><small>{leadLabel(d, l)} · {ago(l.createdAt, s.now)}</small></div>
                  {l.phone && <a className="icon-btn sm" href={`tel:${l.phone.replace(/\s/g, '')}`} aria-label={`Chiama ${l.name}`}><Icon n="phone" size={16} /></a>}
                </li>
              ))}
            </ul>
          ),
          links: [{ label: fresh.length > 4 ? `Vedi tutte (${fresh.length})` : 'Apri le richieste', to: '/richieste' }],
        },
        { id: 'messaggi', icon: 'wa', title: 'Messaggi WhatsApp', count: toSend, summary: toSend ? `${toSend} ${plural(toSend, 'pronto da mandare', 'pronti da mandare')}` : 'Niente da mandare', text: 'Promemoria prima della lezione, posti liberati, abbonamenti in scadenza e inviti per le lezioni con posti liberi. Un tocco e si apre WhatsApp col testo già scritto.', links: [{ label: 'Apri i messaggi', to: '/messaggi' }] },
        { id: 'iscritti', icon: 'users', title: 'Elenco iscritti', summary: `${clients} ${plural(clients, 'iscritto', 'iscritti')} · ${active} con abbonamento valido`, text: 'Cerca per nome, apri la scheda con abbonamenti, lezioni e note; vendi un pacchetto o correggi i dati.', links: [{ label: 'Apri gli iscritti', to: '/iscritti' }] },
      ]} />
      {adding && <NewMember onClose={() => setAdding(false)} />}
    </>
  );
}

