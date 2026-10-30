// Le aree del gestionale dell'owner. Ogni area ha una pagina di partenza (Panoramica) e le sue funzioni: la barra di navigazione mostra le aree,
// la riga di schede sopra la pagina mostra le funzioni dell'area in cui ci si trova. I vecchi indirizzi (/orari, /iscritti, /incassi…) restano validi: appartengono a un'area.

export type AreaId = 'oggi' | 'prenotazioni' | 'report' | 'clienti' | 'fatturazione' | 'dipendenti';
export interface Tab { to: string; label: string }
export interface Area {
  id: AreaId;
  to: string;
  /** Nome nel menu laterale. */
  label: string;
  /** Nome nella barra in basso del telefono (sei voci in 390 px: deve essere corto). */
  short: string;
  /** Titolo della pagina di partenza. */
  title: string;
  icon: string;
  tabs: Tab[];
  /** Primi segmenti degli indirizzi che appartengono all'area. */
  owns: string[];
}

export const AREAS: readonly Area[] = [
  { id: 'oggi', to: '/oggi', label: 'Oggi', short: 'Oggi', title: 'Oggi', icon: 'home', tabs: [], owns: ['/oggi'] },
  {
    id: 'prenotazioni', to: '/prenotazioni', label: 'Prenotazioni', short: 'Prenota', title: 'Gestione prenotazioni', icon: 'calendar', owns: ['/prenotazioni', '/orari'],
    tabs: [{ to: '/prenotazioni', label: 'Panoramica' }, { to: '/orari', label: 'Calendario' }, { to: '/orari/modelli', label: 'Orario' }, { to: '/prenotazioni/regole', label: 'Regole' }],
  },
  { id: 'report', to: '/report', label: 'Report', short: 'Report', title: 'Report e statistiche', icon: 'chart', tabs: [], owns: ['/report'] },
  {
    id: 'clienti', to: '/clienti', label: 'Clienti', short: 'Clienti', title: 'Gestione clienti', icon: 'users', owns: ['/clienti', '/iscritti', '/richieste', '/messaggi'],
    tabs: [{ to: '/clienti', label: 'Panoramica' }, { to: '/iscritti', label: 'Iscritti' }, { to: '/richieste', label: 'Richieste' }, { to: '/messaggi', label: 'Messaggi' }],
  },
  {
    id: 'fatturazione', to: '/fatturazione', label: 'Fatturazione', short: 'Fatture', title: 'Fatturazione', icon: 'receipt', owns: ['/fatturazione', '/incassi', '/pacchetti'],
    tabs: [{ to: '/fatturazione', label: 'Panoramica' }, { to: '/incassi', label: 'Incassi' }, { to: '/pacchetti', label: 'Listino' }],
  },
  { id: 'dipendenti', to: '/dipendenti', label: 'Dipendenti', short: 'Team', title: 'Gestione dipendenti', icon: 'briefcase', tabs: [], owns: ['/dipendenti'] },
];

/** Indirizzi validi per l'owner, oltre alle aree: le impostazioni dell'account. */
export const OWNER_ROUTES: readonly string[] = [...AREAS.flatMap((a) => a.owns), '/impostazioni'];

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** L'area a cui appartiene un indirizzo (es. "/iscritti/abc" → Clienti). */
export function areaOf(path: string): Area | undefined {
  return AREAS.find((a) => a.owns.some((o) => under(path, o)));
}

/** La scheda attiva dell'area: quella col prefisso più lungo (così "/orari/modelli" non accende anche "/orari"). */
export function activeTab(area: Area, path: string): Tab | undefined {
  return area.tabs.filter((t) => under(path, t.to)).sort((a, b) => b.to.length - a.to.length)[0];
}
