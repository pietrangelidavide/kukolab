// Chi può fare cosa. È la stessa tabella che applica il database (supabase/schema.sql): qui serve solo a mostrare le schermate giuste.
// Nascondere un pulsante non protegge niente: i permessi veri sono nelle funzioni SQL, che rispondono "forbidden" a chi non può.
import type { Member, Role, Session } from './types';

export type Cap =
  | 'book' // prenotare e annullare per conto degli iscritti, fuori dagli orari di chiusura
  | 'members' // vedere gli iscritti, iscriverne di nuovi, correggere i loro dati
  | 'sell' // vendere abbonamenti e registrare incassi
  | 'attendance' // segnare chi è venuto
  | 'notes' // vedere e scrivere le note private sugli iscritti
  | 'credits' // correggere a mano le lezioni di un abbonamento
  | 'schedule' // orario, creare/spostare/annullare lezioni
  | 'packs' // catalogo e prezzi
  | 'settings' // regole dello studio
  | 'leads' // richieste dal sito
  | 'messages' // promemoria WhatsApp
  | 'report' // numeri e andamento
  | 'revenue' // incassi di tutti i giorni
  | 'void' // stornare un incasso
  | 'team'; // creare e togliere Segreteria e Trainer

const WHO: Record<Cap, readonly Role[]> = {
  book: ['owner', 'staff'],
  members: ['owner', 'staff'],
  sell: ['owner', 'staff'],
  attendance: ['owner', 'staff', 'trainer'],
  notes: ['owner'],
  credits: ['owner'],
  schedule: ['owner'],
  packs: ['owner'],
  settings: ['owner'],
  leads: ['owner'],
  messages: ['owner'],
  report: ['owner'],
  revenue: ['owner'],
  void: ['owner'],
  team: ['owner'],
};

export const can = (role: Role, cap: Cap): boolean => WHO[cap].includes(role);

/** Owner o Segreteria: chi lavora al banco. */
export const isDesk = (role: Role): boolean => role === 'owner' || role === 'staff';

/** Segreteria e Trainer: gli account che l'owner crea per chi lavora nello studio. */
export const isTeamRole = (role: Role): role is 'staff' | 'trainer' => role === 'staff' || role === 'trainer';

export const ROLE_LABEL: Record<Role, string> = { client: 'Cliente', owner: 'Owner', staff: 'Segreteria', trainer: 'Trainer' };

/** Dove si va dopo l'accesso. */
export const homePath = (role: Role): string => (role === 'owner' ? '/oggi' : role === 'staff' ? '/banco' : role === 'trainer' ? '/lezioni' : '/corsi');

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Il Trainer tiene questa lezione? Il campo Istruttore dell'orario deve contenere il suo nome oppure solo il nome di battesimo
 * (maiuscole e spazi in più non contano): "Marco Rossi" tiene le lezioni di "Marco Rossi" e di "Marco". Come private.teaches nel database.
 */
export function teaches(trainer: Pick<Member, 'role' | 'name'>, s: Pick<Session, 'trainer'>): boolean {
  if (trainer.role !== 'trainer') return false;
  const t = norm(s.trainer);
  if (!t) return false;
  const full = norm(trainer.name);
  return t === full || t === full.split(' ')[0];
}
