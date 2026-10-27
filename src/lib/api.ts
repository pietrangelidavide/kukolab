// Contratto tra le schermate e i dati. Due implementazioni: local.ts (demo nel browser) e remote.ts (Supabase).
import type { Data, Id, LeadStatus, Member, Pack, Result, Role, Session, Settings, Template } from './types';

export interface AuthState { me: Member; data: Data }
export type R<T extends object = Record<never, never>> = Promise<Result<{ data: Data } & T>>;

export interface Api {
  readonly mode: 'demo' | 'remote';
  init(): Promise<AuthState | null>;
  signIn(email: string, password: string): Promise<Result<AuthState>>;
  /** Vero con l'archivio online: si entra solo con un codice mandato per email, e solo se l'owner ha già iscritto quella email. */
  readonly codeLogin?: boolean;
  requestCode?(email: string): Promise<Result>;
  verifyCode?(email: string, code: string): Promise<Result<AuthState>>;
  signUp(i: { name: string; email: string; phone: string; password: string }): Promise<Result<Partial<AuthState> & { needsConfirm?: boolean }>>;
  resetPassword?(email: string): Promise<Result>;
  changePassword?(password: string): Promise<Result>;
  demoLogin?(role: Role): Promise<Result<AuthState>>;
  resetDemo?(): Promise<Result<AuthState>>;
  signOut(): Promise<void>;
  refresh(): R;

  // cliente
  book(sessionId: Id): R<{ status: 'booked' | 'waitlist' }>;
  cancel(bookingId: Id): R<{ status: 'cancelled' | 'late_cancelled'; refunded: boolean; promoted: number }>;
  updateProfile(p: { name: string; phone: string }): R<{ me: Member }>;
  readNotices(): R;
  /** Il socio chiede la consulenza con il nutrizionista (o una prova): nome, telefono ed email sono quelli del suo profilo. */
  requestConsult(i: { topic: Id; note?: string }): R;

  // owner
  ownerBook(memberId: Id, sessionId: Id, allowNoPass: boolean): R<{ status: 'booked' | 'waitlist' }>;
  ownerCancel(bookingId: Id): R<{ status: 'cancelled' | 'late_cancelled'; refunded: boolean; promoted: number }>;
  setAttendance(bookingId: Id, status: 'attended' | 'no_show' | 'booked'): R;
  cancelSession(sessionId: Id): R<{ affected: number }>;
  editSession(sessionId: Id, patch: Partial<Pick<Session, 'capacity' | 'trainer' | 'note' | 'startsAt' | 'duration'>>): R<{ promoted: number }>;
  addSession(i: { typeId: Id; startsAt: string; capacity: number; duration: number; trainer: string; note?: string }): R;
  saveTemplate(t: Template): R<{ created: number; removed: number }>;
  deleteTemplate(id: Id): R<{ removed: number }>;
  addMember(i: { name: string; email: string; phone: string }): R<{ member: Member }>;
  saveMember(m: Pick<Member, 'id' | 'name' | 'email' | 'phone' | 'notes'>): R;
  assignPass(memberId: Id, packId: Id, startsOn: string, note: string): R;
  adjustCredits(passId: Id, delta: number): R;
  savePack(p: Pack): R;
  saveSettings(s: Settings): R;
  /** Richieste arrivate dal sito (prova gratuita, nutrizionista): stato e nota interna. */
  saveLead(i: { id: Id; status?: LeadStatus; ownerNote?: string }): R;
  deleteLead(id: Id): R;
}
