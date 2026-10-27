// Modello dati di KUKO LAB. Gli orari sono sempre ISO UTC; "giorno" è una data locale di Roma (YYYY-MM-DD).
export type Id = string;
/** client = iscritto; owner = titolare; staff = Segreteria (un solo account, quello del banco); trainer = maestro di un corso. */
export type Role = 'client' | 'owner' | 'staff' | 'trainer';
export type Tone = 'orange' | 'rust' | 'white';

export interface CourseType {
  id: Id;
  name: string;
  capacity: number; // posti di default
  duration: number; // minuti di default
  tone: Tone;
}

export interface Member {
  id: Id;
  name: string;
  email: string;
  phone: string;
  role: Role;
  notes: string;
  createdAt: string;
  /** Solo per l'owner, con l'archivio online: la persona ha già fatto il primo accesso (ha un account). */
  hasAccount?: boolean;
}

/** Riga dell'orario settimanale: ogni settimana genera una lezione. */
export interface Template {
  id: Id;
  typeId: Id;
  weekday: number; // 1 = lunedì … 7 = domenica
  time: string; // HH:MM, ora di Roma
  capacity: number;
  duration: number;
  trainer: string;
  active: boolean;
}

export interface Session {
  id: Id;
  typeId: Id;
  startsAt: string;
  duration: number;
  capacity: number;
  trainer: string;
  status: 'scheduled' | 'cancelled';
  templateId: Id | null;
  note: string;
}

/** Catalogo: quello che si può vendere. */
export interface Pack {
  id: Id;
  name: string;
  kind: 'pack' | 'monthly'; // pack = N lezioni, monthly = a tempo (con eventuale limite settimanale)
  lessons: number | null;
  validityDays: number;
  priceCents: number;
  typeIds: Id[]; // vuoto = vale per tutti i corsi
  weeklyLimit: number | null;
  active: boolean;
}

/** Quello che un iscritto ha comprato. */
export interface Pass {
  id: Id;
  memberId: Id;
  packId: Id | null;
  name: string;
  kind: 'pack' | 'monthly';
  creditsTotal: number | null;
  creditsLeft: number | null;
  startsOn: string; // giorno
  expiresOn: string; // giorno, incluso
  typeIds: Id[];
  weeklyLimit: number | null;
  note: string;
  createdAt: string;
}

export type BookingStatus = 'booked' | 'waitlist' | 'cancelled' | 'late_cancelled' | 'attended' | 'no_show';

export interface Booking {
  id: Id;
  sessionId: Id;
  memberId: Id;
  status: BookingStatus;
  passId: Id | null;
  createdAt: string;
  cancelledAt: string | null;
  promotedAt: string | null;
  position?: number; // solo lato cliente remoto: posizione in lista d'attesa
}

export interface Settings {
  studioName: string;
  cancelWindowHours: number; // entro quante ore dall'inizio un annullo costa la lezione
  bookingHorizonDays: number; // quanti giorni in anticipo si può prenotare
  bookingCloseMinutes: number; // le prenotazioni chiudono N minuti prima dell'inizio
  waitlistEnabled: boolean;
}

export interface Notice {
  id: Id;
  memberId: Id;
  kind: 'promoted' | 'session_cancelled' | 'info';
  text: string;
  createdAt: string;
  read: boolean;
}

export type LeadKind = 'trial' | 'nutrition';
/** Cosa ha chiesto la persona: l'id di un corso (prova gratuita) oppure 'nutrition' (consulenza nutrizionale). */
export type LeadTopic = Id;
export type LeadStatus = 'new' | 'contacted' | 'scheduled' | 'done' | 'joined' | 'lost';

/** Richiesta arrivata dal sito: prova gratuita di una lezione o consulenza nutrizionale. */
export interface Lead {
  id: Id;
  kind: LeadKind;
  topic: LeadTopic;
  name: string;
  phone: string;
  email: string;
  slots: string[]; // fasce preferite: mattina, pranzo, pomeriggio, sera, sabato
  note: string; // quello che ha scritto la persona
  status: LeadStatus;
  ownerNote: string; // appunti dello studio
  source: string;
  createdAt: string;
  updatedAt: string | null;
}

export type PayMethod = 'cash' | 'card' | 'transfer' | 'other';

/** Un incasso. Importo in centesimi; 0 = omaggio. Uno stornato resta in elenco ma non conta nei totali. */
export interface Payment {
  id: Id;
  memberId: Id | null;
  passId: Id | null;
  amountCents: number;
  method: PayMethod;
  note: string;
  paidAt: string;
  /** Nome di chi l'ha registrato (resta anche se quella persona esce dal team). */
  byName: string;
  voidedAt: string | null;
}

export interface Data {
  settings: Settings;
  types: CourseType[];
  members: Member[];
  templates: Template[];
  sessions: Session[];
  packs: Pack[];
  passes: Pass[];
  bookings: Booking[];
  notices: Notice[];
  /** Richieste di prova gratuita e consulenza (le vede solo l'owner). */
  leads: Lead[];
  /** Incassi: l'owner li vede tutti, la Segreteria solo quelli di oggi, gli altri nessuno. */
  payments: Payment[];
  /** Conteggi per lezione quando il cliente non vede le prenotazioni degli altri (modalità remota). */
  counts?: Record<Id, { booked: number; waitlist: number }>;
}

export type Err =
  | 'member_not_found'
  | 'session_not_found'
  | 'booking_not_found'
  | 'pass_not_found'
  | 'pack_not_found'
  | 'lead_not_found'
  | 'payment_not_found'
  | 'staff_exists'
  | 'email_in_use'
  | 'busy'
  | 'forbidden'
  | 'session_cancelled'
  | 'booking_closed'
  | 'too_far'
  | 'already_booked'
  | 'on_waitlist'
  | 'overlap'
  | 'no_pass'
  | 'full'
  | 'not_cancellable'
  | 'session_started'
  | 'invalid'
  | 'network'
  | 'auth';

export type Result<T extends object = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: Err; message?: string };

export const ERR_TEXT: Record<Err, string> = {
  member_not_found: 'Iscritto non trovato.',
  session_not_found: 'Lezione non trovata.',
  booking_not_found: 'Prenotazione non trovata.',
  pass_not_found: 'Abbonamento non trovato.',
  pack_not_found: 'Pacchetto non trovato.',
  lead_not_found: 'Richiesta non trovata.',
  payment_not_found: 'Incasso non trovato.',
  staff_exists: 'La Segreteria c’è già: toglila prima di aggiungerne un’altra.',
  email_in_use: 'Questa email è già usata da un altro account del team.',
  busy: 'Troppe richieste in poco tempo: riprova tra qualche minuto.',
  forbidden: 'Non puoi farlo.',
  session_cancelled: 'Questa lezione è stata annullata.',
  booking_closed: 'Le prenotazioni per questa lezione sono chiuse.',
  too_far: 'Questa lezione non è ancora prenotabile.',
  already_booked: 'Sei già prenotato a questa lezione.',
  on_waitlist: 'Sei già in lista d’attesa.',
  overlap: 'Hai già una lezione che si sovrappone a questo orario.',
  no_pass: 'Non hai un abbonamento valido per questo corso.',
  full: 'La lezione è al completo.',
  not_cancellable: 'Questa prenotazione non si può annullare.',
  session_started: 'La lezione è già iniziata.',
  invalid: 'Dati non validi.',
  network: 'Connessione assente: riprova.',
  auth: 'Email o password non corretti.',
};
