// Modalità reale: Supabase (accesso con un codice mandato per email + funzioni del database), senza librerie, con fetch.
// Le registrazioni sono chiuse: un account nasce solo per chi l'owner ha già iscritto (lo decide il database, vedi supabase/schema.sql).
// Il database è descritto in supabase/schema.sql: qui si chiamano solo le sue funzioni (rpc).
import type { Api, AuthState, R } from './api';
import type { Booking, Data, Err, Id, Lead, LeadStatus, Member, Notice, Pack, Pass, Result, Session, Settings, Template } from './types';
import { ERR_TEXT } from './types';

const AUTH_KEY = 'kuko-auth';

interface Tokens { access: string; refresh: string; expiresAt: number }

const mem = new Map<string, string>();
const store = {
  get(k: string): string | null { try { return localStorage.getItem(k) ?? mem.get(k) ?? null; } catch { return mem.get(k) ?? null; } },
  set(k: string, v: string) { mem.set(k, v); try { localStorage.setItem(k, v); } catch { /* si resta in memoria */ } },
  del(k: string) { mem.delete(k); try { localStorage.removeItem(k); } catch { /* nulla */ } },
};

type Http = { status: number; body: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const iso = (s: string) => new Date(s).toISOString();
const isoOrNull = (s: string | null) => (s ? iso(s) : null);

// ---------------------------------------------------------------------------------- dal database all'app
/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapSnapshot(j: any): AuthState {
  const settings: Settings = {
    studioName: j.settings.studio_name, cancelWindowHours: j.settings.cancel_window_hours, bookingHorizonDays: j.settings.booking_horizon_days,
    bookingCloseMinutes: j.settings.booking_close_minutes, waitlistEnabled: j.settings.waitlist_enabled,
  };
  const member = (m: any): Member => ({ id: m.id, name: m.name, email: m.email ?? '', phone: m.phone ?? '', role: m.role, notes: m.notes ?? '', createdAt: iso(m.created_at), ...(m.has_account !== undefined ? { hasAccount: !!m.has_account } : {}) });
  const data: Data = {
    settings,
    types: j.types.map((t: any) => ({ id: t.id, name: t.name, capacity: t.capacity, duration: t.duration, tone: t.tone })),
    members: j.members.map(member),
    templates: j.templates.map((t: any): Template => ({ id: t.id, typeId: t.type_id, weekday: t.weekday, time: String(t.time).slice(0, 5), capacity: t.capacity, duration: t.duration, trainer: t.trainer, active: t.active })),
    sessions: j.sessions.map((s: any): Session => ({ id: s.id, typeId: s.type_id, startsAt: iso(s.starts_at), duration: s.duration, capacity: s.capacity, trainer: s.trainer, status: s.status, templateId: s.template_id, note: s.note })),
    packs: j.packs.map((p: any): Pack => ({ id: p.id, name: p.name, kind: p.kind, lessons: p.lessons, validityDays: p.validity_days, priceCents: p.price_cents, typeIds: p.type_ids ?? [], weeklyLimit: p.weekly_limit, active: p.active })),
    passes: j.passes.map((p: any): Pass => ({
      id: p.id, memberId: p.member_id, packId: p.pack_id, name: p.name, kind: p.kind, creditsTotal: p.credits_total, creditsLeft: p.credits_left,
      startsOn: String(p.starts_on).slice(0, 10), expiresOn: String(p.expires_on).slice(0, 10), typeIds: p.type_ids ?? [], weeklyLimit: p.weekly_limit, note: p.note ?? '', createdAt: iso(p.created_at),
    })),
    bookings: j.bookings.map((b: any): Booking => ({
      id: b.id, sessionId: b.session_id, memberId: b.member_id, status: b.status, passId: b.pass_id, createdAt: iso(b.created_at), cancelledAt: isoOrNull(b.cancelled_at), promotedAt: isoOrNull(b.promoted_at),
      ...(b.position != null ? { position: Number(b.position) } : {}),
    })),
    notices: j.notices.map((n: any): Notice => ({ id: n.id, memberId: n.member_id, kind: n.kind, text: n.text, createdAt: iso(n.created_at), read: n.read })),
    // le richieste dal sito le vede solo l'owner: per gli altri il database non manda nulla
    leads: (j.leads ?? []).map((l: any): Lead => ({
      id: l.id, kind: l.kind, topic: l.topic, name: l.name, phone: l.phone, email: l.email ?? '', slots: l.slots ?? [], note: l.note ?? '',
      status: l.status, ownerNote: l.owner_note ?? '', source: l.source ?? 'sito', createdAt: iso(l.created_at), updatedAt: isoOrNull(l.updated_at),
    })),
  };
  if (j.counts) data.counts = Object.fromEntries(Object.entries<any>(j.counts).map(([id, c]) => [id, { booked: Number(c.booked), waitlist: Number(c.waitlist) }]));
  const me = data.members.find((m) => m.id === j.me.id) ?? member(j.me);
  if (!data.members.some((m) => m.id === me.id)) data.members.push(me);
  return { me, data };
}

// ---------------------------------------------------------------------------------- messaggi di errore
const AUTH_MSG: Record<string, string> = {
  invalid_credentials: ERR_TEXT.auth,
  email_not_confirmed: 'Conferma prima la tua email: apri il link che ti abbiamo scritto.',
  user_already_exists: 'Esiste già un profilo con questa email: prova ad accedere.',
  email_exists: 'Esiste già un profilo con questa email: prova ad accedere.',
  weak_password: 'La password è troppo debole: usa almeno 8 caratteri, meglio se con numeri.',
  over_request_rate_limit: 'Troppi tentativi: aspetta un minuto e riprova.',
  over_email_send_rate_limit: 'Troppe email inviate: aspetta qualche minuto e riprova.',
  signup_disabled: 'Le nuove iscrizioni non sono attive.',
  otp_expired: 'Il codice non è valido o è scaduto: chiedine uno nuovo.',
  otp_disabled: 'L’accesso con codice non è attivo: avvisa lo studio.',
};

export class RemoteApi implements Api {
  readonly mode = 'remote' as const;
  readonly codeLogin = true;
  private tokens: Tokens | null = null;

  constructor(private url: string, private key: string) {
    this.url = url.replace(/\/+$/, '');
  }

  // ------------------------------------------------------------------ rete
  private async http(path: string, method: string, body?: unknown, bearer?: string): Promise<Http> {
    const res = await fetch(`${this.url}${path}`, {
      method,
      headers: { apikey: this.key, 'Content-Type': 'application/json', Authorization: `Bearer ${bearer ?? this.key}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown = null;
    if (text) { try { json = JSON.parse(text); } catch { json = null; } }
    return { status: res.status, body: json };
  }

  private save(t: Tokens | null) {
    this.tokens = t;
    if (t) store.set(AUTH_KEY, JSON.stringify(t)); else store.del(AUTH_KEY);
  }

  private setFromAuth(b: any): boolean {
    if (!b?.access_token || !b?.refresh_token) return false;
    const expiresAt = b.expires_at ? Number(b.expires_at) * 1000 : Date.now() + Number(b.expires_in ?? 3600) * 1000;
    this.save({ access: b.access_token, refresh: b.refresh_token, expiresAt });
    return true;
  }

  private async refreshToken(): Promise<boolean> {
    if (!this.tokens) return false;
    try {
      const r = await this.http('/auth/v1/token?grant_type=refresh_token', 'POST', { refresh_token: this.tokens.refresh });
      if (r.status === 200 && this.setFromAuth(r.body)) return true;
      if (r.status >= 400 && r.status < 500) this.save(null); // sessione scaduta o revocata
    } catch { /* rete assente: si tiene la sessione e si riprova */ }
    return false;
  }

  private async token(): Promise<string | null> {
    if (!this.tokens) return null;
    if (this.tokens.expiresAt - 30000 < Date.now()) await this.refreshToken();
    return this.tokens?.access ?? null;
  }

  /** Chiama una funzione del database. Restituisce il valore o l'errore già tradotto. */
  private async rpc(fn: string, args: Record<string, unknown> = {}): Promise<Result<{ value: any }>> {
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const access = await this.token();
        if (!access) return { ok: false, error: 'auth' };
        const r = await this.http(`/rest/v1/rpc/${fn}`, 'POST', args, access);
        if (r.status >= 200 && r.status < 300) return { ok: true, value: r.body };
        const msg: string | undefined = r.body?.message;
        if ((r.status === 401 || r.body?.code === 'PGRST301') && attempt === 0 && (await this.refreshToken())) continue;
        if (r.status === 401 || r.status === 403) return { ok: false, error: 'auth' };
        if (msg && msg in ERR_TEXT) return { ok: false, error: msg as Err };
        return { ok: false, error: 'invalid', message: r.status >= 500 ? 'Il server non risponde: riprova tra poco.' : ERR_TEXT.invalid };
      }
      return { ok: false, error: 'auth' };
    } catch {
      return { ok: false, error: 'network' };
    }
  }

  private async snapshot(): Promise<Result<AuthState>> {
    const r = await this.rpc('snapshot');
    if (!r.ok) return r;
    try {
      const s = mapSnapshot(r.value);
      return { ok: true, ...s };
    } catch {
      return { ok: false, error: 'network', message: 'Non riesco a leggere i dati: aggiorna la pagina.' };
    }
  }

  /** Esegue una funzione e poi rilegge i dati. */
  private async mutate<T extends object = Record<never, never>>(fn: string, args: Record<string, unknown>, pick?: (value: any, s: AuthState) => T): R<T> {
    const r = await this.rpc(fn, args);
    if (!r.ok) return r;
    const s = await this.snapshot();
    if (!s.ok) return s;
    return { ok: true, data: s.data, ...(pick ? pick(r.value, s) : ({} as T)) };
  }

  // ------------------------------------------------------------------ accesso
  async init(): Promise<AuthState | null> {
    let recovery = false;
    // ritorno da un link della mail (conferma o nuova password): i dati sono nell'indirizzo dopo il #
    if (typeof location !== 'undefined' && location.hash.includes('access_token=')) {
      const q = new URLSearchParams(location.hash.slice(1));
      if (this.setFromAuth({ access_token: q.get('access_token'), refresh_token: q.get('refresh_token'), expires_in: q.get('expires_in') })) recovery = q.get('type') === 'recovery';
      history.replaceState(null, '', location.pathname + location.search + '#/');
    } else if (typeof location !== 'undefined' && /error_code=|error=/.test(location.hash)) {
      history.replaceState(null, '', location.pathname + location.search + '#/');
    } else {
      try { const raw = store.get(AUTH_KEY); if (raw) this.tokens = JSON.parse(raw) as Tokens; } catch { this.tokens = null; }
    }
    if (!this.tokens) return null;
    const s = await this.snapshot();
    if (!s.ok) return null;
    if (recovery) history.replaceState(null, '', location.pathname + location.search + (s.me.role === 'owner' ? '#/impostazioni' : '#/profilo'));
    return { me: s.me, data: s.data };
  }

  async signIn(email: string, password: string): Promise<Result<AuthState>> {
    try {
      const r = await this.http('/auth/v1/token?grant_type=password', 'POST', { email: email.trim(), password });
      if (r.status !== 200 || !this.setFromAuth(r.body)) {
        const code: string = r.body?.error_code ?? r.body?.code ?? '';
        return { ok: false, error: 'auth', message: AUTH_MSG[code] ?? (r.status >= 500 ? 'Il server non risponde: riprova tra poco.' : ERR_TEXT.auth) };
      }
    } catch {
      return { ok: false, error: 'network' };
    }
    const s = await this.snapshot();
    if (!s.ok) { this.save(null); return s; }
    return s;
  }

  /** Manda il codice per email. Con un'email che non è tra gli iscritti il database rifiuta di creare l'account e Supabase risponde con un errore del
   *  database: all'esterno lo si tratta come un invio riuscito, così non si scopre chi è iscritto e chi no. */
  async requestCode(email: string): Promise<Result> {
    try {
      const r = await this.http('/auth/v1/otp', 'POST', { email: email.trim(), create_user: true });
      if (r.status < 300) return { ok: true };
      const code: string = r.body?.error_code ?? r.body?.code ?? '';
      const text = String(r.body?.msg ?? r.body?.message ?? '');
      if (r.status >= 500 && /database error/i.test(text)) return { ok: true };
      if (code === 'signup_disabled') return { ok: false, error: 'invalid', message: 'L’accesso con codice non è attivo: avvisa lo studio.' };
      return { ok: false, error: 'invalid', message: AUTH_MSG[code] ?? (r.status >= 500 ? 'Il server non risponde: riprova tra poco.' : 'Non riesco a mandare il codice: controlla l’email e riprova.') };
    } catch {
      return { ok: false, error: 'network' };
    }
  }

  async verifyCode(email: string, code: string): Promise<Result<AuthState>> {
    try {
      const r = await this.http('/auth/v1/verify', 'POST', { type: 'email', email: email.trim(), token: code.replace(/\s/g, '') });
      if (r.status !== 200 || !this.setFromAuth(r.body)) {
        const c: string = r.body?.error_code ?? r.body?.code ?? '';
        return { ok: false, error: 'auth', message: AUTH_MSG[c] ?? (r.status >= 500 ? 'Il server non risponde: riprova tra poco.' : 'Il codice non è valido o è scaduto: controlla di averlo scritto giusto, oppure chiedine uno nuovo.') };
      }
    } catch {
      return { ok: false, error: 'network' };
    }
    const s = await this.snapshot();
    if (!s.ok) { this.save(null); return s; }
    return s;
  }

  /** Non usata dall'interfaccia: con le registrazioni chiuse funziona solo per email già iscritte dall'owner. */
  async signUp(i: { name: string; email: string; phone: string; password: string }): Promise<Result<Partial<AuthState> & { needsConfirm?: boolean }>> {
    try {
      const redirect = encodeURIComponent(location.origin + '/app/');
      const r = await this.http(`/auth/v1/signup?redirect_to=${redirect}`, 'POST', { email: i.email.trim(), password: i.password, data: { name: i.name.trim(), phone: i.phone.trim() } });
      if (r.status >= 400) {
        const code: string = r.body?.error_code ?? r.body?.code ?? '';
        return { ok: false, error: 'invalid', message: AUTH_MSG[code] ?? 'Non riesco a creare il profilo: controlla i dati e riprova.' };
      }
      if (!this.setFromAuth(r.body)) return { ok: true, needsConfirm: true };
    } catch {
      return { ok: false, error: 'network' };
    }
    const s = await this.snapshot();
    if (!s.ok) { this.save(null); return s; }
    return s;
  }

  async resetPassword(email: string): Promise<Result> {
    try {
      const redirect = encodeURIComponent(location.origin + '/app/');
      const r = await this.http(`/auth/v1/recover?redirect_to=${redirect}`, 'POST', { email: email.trim() });
      return r.status < 400 ? { ok: true } : { ok: false, error: 'network', message: AUTH_MSG[r.body?.error_code ?? ''] };
    } catch {
      return { ok: false, error: 'network' };
    }
  }

  async changePassword(password: string): Promise<Result> {
    try {
      const access = await this.token();
      if (!access) return { ok: false, error: 'auth' };
      const r = await this.http('/auth/v1/user', 'PUT', { password }, access);
      if (r.status < 300) return { ok: true };
      return { ok: false, error: 'invalid', message: AUTH_MSG[r.body?.error_code ?? ''] ?? 'Non riesco a cambiare la password.' };
    } catch {
      return { ok: false, error: 'network' };
    }
  }

  async signOut() {
    const access = this.tokens?.access;
    this.save(null);
    if (access) { try { await this.http('/auth/v1/logout', 'POST', {}, access); } catch { /* già uscito in locale */ } }
  }

  async refresh(): R {
    const s = await this.snapshot();
    return s.ok ? { ok: true, data: s.data } : s;
  }

  // ------------------------------------------------------------------ cliente
  book(sessionId: Id) { return this.mutate('book_session', { p_session: sessionId }, (v) => ({ status: v.status as 'booked' | 'waitlist' })); }
  cancel(bookingId: Id) { return this.mutate('cancel_booking', { p_booking: bookingId }, (v) => ({ status: v.status as 'cancelled' | 'late_cancelled', refunded: !!v.refunded, promoted: Number(v.promoted) })); }
  updateProfile(p: { name: string; phone: string }) { return this.mutate('update_profile', { p_name: p.name, p_phone: p.phone }, (_v, s) => ({ me: s.me })); }
  readNotices() { return this.mutate('read_notices', {}); }
  requestConsult(i: { topic: Id; note?: string }) { return this.mutate('request_consult', { p_topic: i.topic, p_note: i.note ?? '' }); }

  // ------------------------------------------------------------------ owner
  ownerBook(memberId: Id, sessionId: Id, allowNoPass: boolean) { return this.mutate('owner_book', { p_member: memberId, p_session: sessionId, p_allow_no_pass: allowNoPass }, (v) => ({ status: v.status as 'booked' | 'waitlist' })); }
  ownerCancel(bookingId: Id) { return this.cancel(bookingId); }
  setAttendance(bookingId: Id, status: 'attended' | 'no_show' | 'booked') { return this.mutate('set_attendance', { p_booking: bookingId, p_status: status }); }
  cancelSession(sessionId: Id) { return this.mutate('cancel_session', { p_session: sessionId }, (v) => ({ affected: Number(v.affected) })); }
  editSession(sessionId: Id, patch: Parameters<Api['editSession']>[1]) { return this.mutate('edit_session', { p_session: sessionId, p_patch: patch }, (v) => ({ promoted: Number(v.promoted) })); }
  addSession(i: Parameters<Api['addSession']>[0]) { return this.mutate('add_session', { p_type: i.typeId, p_starts: i.startsAt, p_capacity: i.capacity, p_duration: i.duration, p_trainer: i.trainer, p_note: i.note ?? '' }); }
  saveTemplate(t: Template) { return this.mutate('save_template', { p: t }, (v) => ({ created: Number(v.created), removed: Number(v.removed) })); }
  deleteTemplate(id: Id) { return this.mutate('delete_template', { p_template: id }, (v) => ({ removed: Number(v.removed) })); }
  addMember(i: { name: string; email: string; phone: string }) {
    return this.mutate('add_member', { p_name: i.name, p_email: i.email, p_phone: i.phone }, (v, s) => ({ member: s.data.members.find((m) => m.id === v.memberId)! }));
  }
  saveMember(m: Pick<Member, 'id' | 'name' | 'email' | 'phone' | 'notes'>) { return this.mutate('save_member', { p_member: m.id, p_name: m.name, p_email: m.email, p_phone: m.phone, p_notes: m.notes }); }
  assignPass(memberId: Id, packId: Id, startsOn: string, note: string) { return this.mutate('assign_pass', { p_member: memberId, p_pack: packId, p_starts: startsOn, p_note: note }); }
  adjustCredits(passId: Id, delta: number) { return this.mutate('adjust_credits', { p_pass: passId, p_delta: delta }); }
  savePack(p: Pack) { return this.mutate('save_pack', { p }); }
  saveSettings(s: Settings) { return this.mutate('save_settings', { p: s }); }
  saveLead(i: { id: Id; status?: LeadStatus; ownerNote?: string }) { return this.mutate('save_lead', { p_lead: i.id, p_status: i.status ?? null, p_owner_note: i.ownerNote ?? null }); }
  deleteLead(id: Id) { return this.mutate('delete_lead', { p_lead: id }); }
}
