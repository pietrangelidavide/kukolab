// Pezzi comuni delle aree del gestionale: la riga di schede dell'area, le carte "Fai prima" (cose da fare, con il numero) e i "punti da esplodere":
// righe che si aprono per mostrare dentro la funzione o l'elenco, senza cambiare pagina. Ne resta aperta una alla volta.
import type { ReactNode } from 'react';
import { useStore } from '../store';
import { Avatar, Badge, Btn, Icon } from '../ui';
import { activeTab } from '../lib/areas';
import type { Area } from '../lib/areas';
import type { Dormant } from '../lib/insights';
import type { Expiring } from '../lib/selectors';
import { dayDM, plural, waLink } from '../lib/format';

/** Le funzioni dell'area in cui ci si trova. */
export function AreaTabs({ area, path }: { area: Area; path: string }) {
  const { route } = useStore();
  const on = activeTab(area, path);
  return (
    <nav className="subnav" aria-label={area.title}>
      {area.tabs.map((t) => (
        <a key={t.to} href={'#' + t.to} className={on?.to === t.to ? 'on' : ''} aria-current={on?.to === t.to ? 'page' : undefined} onClick={(e) => { e.preventDefault(); route.go(t.to); }}>{t.label}</a>
      ))}
    </nav>
  );
}

export interface FastItem {
  icon: string;
  title: string;
  /** Cosa c'è da fare, mostrato quando il numero è maggiore di zero. */
  text: string;
  /** Mostrato quando il numero è zero. */
  done?: string;
  count?: number;
  onClick: () => void;
}

/** Le cose che fanno risparmiare più tempo, in cima alla pagina: un numero e un tocco per arrivarci. */
export function Fast({ items, cols }: { items: FastItem[]; /** 3 quando le carte sono tre: riempiono la riga. */ cols?: 3 }) {
  return (
    <ul className={`fast${cols === 3 ? ' three' : ''}`}>
      {items.map((i) => {
        const idle = i.count === 0;
        return (
          <li key={i.title}>
            <button type="button" className={`fast-card${idle ? ' idle' : ''}`} onClick={i.onClick}>
              <span className="fast-ic"><Icon n={idle ? 'check' : i.icon} size={19} /></span>
              {i.count !== undefined && <b className="fast-n">{i.count}</b>}
              <span className="fast-t">{i.title}</span>
              <small>{idle ? i.done ?? 'Tutto a posto' : i.text}</small>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export interface Point {
  id: string;
  icon: string;
  title: string;
  /** Una riga visibile anche da chiuso: il dato che conta. */
  summary?: ReactNode;
  count?: number;
  /** Spiegazione breve della funzione, dentro. */
  text?: string;
  links?: { label: string; to: string }[];
  children?: ReactNode;
}

/** Elenco di funzioni che si aprono sul posto. */
export function Points({ items, group }: { items: Point[]; group: string }) {
  const { route } = useStore();
  return (
    <ul className="points">
      {items.map((p) => (
        <li key={p.id}>
          <details id={`pt-${p.id}`} name={group}>
            <summary>
              <span className="pt-ic"><Icon n={p.icon} size={20} /></span>
              <span className="pt-main"><b>{p.title}</b>{p.summary && <small>{p.summary}</small>}</span>
              {p.count !== undefined && p.count > 0 && <Badge tone="accent">{p.count}</Badge>}
              <Icon n="down" size={18} className="pt-chev" />
            </summary>
            <div className="pt-body">
              {p.text && <p className="muted">{p.text}</p>}
              {p.children}
              {p.links && p.links.length > 0 && (
                <div className="row">{p.links.map((l, k) => <Btn key={l.to} kind={k === 0 ? 'primary' : 'ghost'} size="sm" onClick={() => route.go(l.to)}>{l.label}</Btn>)}</div>
              )}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

/** Apre un punto e lo porta in vista (dalle carte "Fai prima"). */
export function openPoint(id: string) {
  const el = document.getElementById(`pt-${id}`) as HTMLDetailsElement | null;
  if (!el) return;
  el.open = true;
  let calm = false;
  try { calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* nulla */ }
  el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
  (el.querySelector('summary') as HTMLElement | null)?.focus({ preventScroll: true });
}

const first = (name: string) => name.split(' ')[0];

/** Abbonamenti in scadenza o quasi finiti, con il pulsante per scrivere su WhatsApp. */
export function ExpiringList({ items, limit = 8 }: { items: Expiring[]; limit?: number }) {
  const { route } = useStore();
  if (items.length === 0) return <p className="muted">Nessuno per ora.</p>;
  return (
    <>
      <ul className="mini">
        {items.slice(0, limit).map(({ pass: p, member: m, reason }) => {
          const wa = m.phone ? waLink(m.phone, `Ciao ${first(m.name)}, ti scrivo da KUKO LAB: il tuo abbonamento “${p.name}” sta per terminare. Vuoi rinnovarlo?`) : null;
          return (
            <li key={p.id}>
              <div className="who">
                <a href={`#/iscritti/${m.id}`} onClick={(e) => { e.preventDefault(); route.go(`/iscritti/${m.id}`); }}>{m.name}</a>
                <small>{p.name} · {reason === 'date' ? `scade il ${dayDM(p.expiresOn)}` : `${p.creditsLeft} ${plural(p.creditsLeft ?? 0, 'lezione rimasta', 'lezioni rimaste')}`}</small>
              </div>
              {wa && <a className="icon-btn sm" href={wa} target="_blank" rel="noopener" aria-label={`Scrivi a ${m.name} su WhatsApp`}><Icon n="wa" size={16} /></a>}
            </li>
          );
        })}
      </ul>
      {items.length > limit && <p className="muted small">E altri {items.length - limit}.</p>}
    </>
  );
}

/** Iscritti con l'abbonamento valido che non si vedono da un po'. */
export function DormantList({ items, limit = 8 }: { items: Dormant[]; limit?: number }) {
  const { route } = useStore();
  if (items.length === 0) return <p className="muted">Nessuno: chi ha un abbonamento valido è venuto di recente.</p>;
  return (
    <>
      <ul className="mini">
        {items.slice(0, limit).map(({ member: m, lastOn, daysIdle }) => {
          const wa = m.phone ? waLink(m.phone, `Ciao ${first(m.name)}, è un po’ che non ti vediamo da KUKO LAB. Ti aspettiamo: puoi prenotare la prossima lezione dall’app.`) : null;
          return (
            <li key={m.id}>
              <Avatar name={m.name} size={34} />
              <div className="who">
                <a href={`#/iscritti/${m.id}`} onClick={(e) => { e.preventDefault(); route.go(`/iscritti/${m.id}`); }}>{m.name}</a>
                <small>{lastOn ? `Ultima lezione il ${dayDM(lastOn)}` : 'Non ha ancora prenotato'} · {daysIdle} giorni</small>
              </div>
              {wa && <a className="icon-btn sm" href={wa} target="_blank" rel="noopener" aria-label={`Scrivi a ${m.name} su WhatsApp`}><Icon n="wa" size={16} /></a>}
            </li>
          );
        })}
      </ul>
      {items.length > limit && <p className="muted small">E altri {items.length - limit}.</p>}
    </>
  );
}
