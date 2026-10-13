// Modalità demo: tutto nel browser (localStorage), con le stesse regole di rules.ts.
import type { Api, AuthState, R } from './api';
import type { Data, Id, Member, Pack, Result, Role, Settings, Template } from './types';
import { demoData, DEMO_CLIENT_ID, DEMO_OWNER_ID } from './seed';
import * as rules from './rules';
import { addDays, romeDay } from './time';
import { newId } from './ids';

const KEY = 'kuko-demo-v1';
const ME = 'kuko-demo-me';

const mem = new Map<string, string>();
const store = {
  get(k: string): string | null { try { return localStorage.getItem(k) ?? mem.get(k) ?? null; } catch { return mem.get(k) ?? null; } },
  set(k: string, v: string) { mem.set(k, v); try { localStorage.setItem(k, v); } catch { /* storage non disponibile: si resta in memoria */ } },
  del(k: string) { mem.delete(k); try { localStorage.removeItem(k); } catch { /* nulla */ } },
};

export class LocalApi implements Api {
  readonly mode = 'demo' as const;
  private d: Data = demoData(new Date());
  private meId: Id | null = null;

  private persist() { store.set(KEY, JSON.stringify(this.d)); if (this.meId) store.set(ME, this.meId); else store.del(ME); }
  private now() { return new Date(); }
  private until() { return addDays(romeDay(this.now()), this.d.settings.bookingHorizonDays + 14); }
  private me(): Member | undefined { return this.d.members.find((m) => m.id === this.meId); }
  private extend() { this.d = rules.generateSessions(this.d, { from: romeDay(this.now()), to: this.until() }).data; }
  private state(): AuthState | null { const me = this.me(); return me ? { me, data: this.d } : null; }
  private commit<T extends object>(r: Result<{ data: Data } & T>): Result<{ data: Data } & T> {
    if (r.ok) { this.d = r.data; this.persist(); }
    return r;
  }

  async init(): Promise<AuthState | null> {
    try {
      const raw = store.get(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Data;
        if (parsed && Array.isArray(parsed.sessions) && Array.isArray(parsed.members) && parsed.settings) this.d = parsed;
      }
    } catch { /* dati rovinati: si riparte dalla demo */ }
    this.meId = store.get(ME);
    this.extend();
    this.persist();
    return this.state();
  }

  async signIn(email: string): Promise<Result<AuthState>> {
    const m = this.d.members.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!m) return { ok: false, error: 'auth' };
    this.meId = m.id; this.persist();
    return { ok: true, me: m, data: this.d };
  }

  async signUp(i: { name: string; email: string; phone: string; password: string }): Promise<Result<Partial<AuthState> & { needsConfirm?: boolean }>> {
    if (i.email && this.d.members.some((m) => m.email === i.email.trim().toLowerCase())) return { ok: false, error: 'invalid', message: 'Esiste già un profilo con questa email.' };
    const r = rules.newMember(this.d, { name: i.name, email: i.email, phone: i.phone, now: this.now() });
    if (!r.ok) return r;
    this.d = r.data; this.meId = r.member.id; this.persist();
    return { ok: true, me: r.member, data: this.d };
  }

  async demoLogin(role: Role): Promise<Result<AuthState>> {
    this.meId = role === 'owner' ? DEMO_OWNER_ID : DEMO_CLIENT_ID;
    this.persist();
    const s = this.state();
    return s ? { ok: true, ...s } : { ok: false, error: 'auth' };
  }

  async resetDemo(): Promise<Result<AuthState>> {
    const role = this.me()?.role ?? 'client';
    this.d = demoData(this.now());
    this.extend();
    return this.demoLogin(role);
  }

  async signOut() { this.meId = null; this.persist(); }

  async refresh(): R { this.extend(); this.persist(); return { ok: true, data: this.d }; }

  private actor() { const m = this.me(); return m ? { role: m.role, memberId: m.id } : null; }

  async book(sessionId: Id): R<{ status: 'booked' | 'waitlist' }> {
    const a = this.actor(); if (!a) return { ok: false, error: 'auth' };
    const r = rules.book(this.d, { memberId: a.memberId, sessionId, now: this.now(), actor: a });
    if (!r.ok) return r;
    return this.commit({ ok: true, data: r.data, status: r.booking.status as 'booked' | 'waitlist' });
  }

  async cancel(bookingId: Id): R<{ status: 'cancelled' | 'late_cancelled'; refunded: boolean; promoted: number }> {
    const a = this.actor(); if (!a) return { ok: false, error: 'auth' };
    const r = rules.cancelBooking(this.d, { bookingId, now: this.now(), actor: a });
    return r.ok ? this.commit(r) : r;
  }

  async updateProfile(p: { name: string; phone: string }): R<{ me: Member }> {
    const m = this.me(); if (!m) return { ok: false, error: 'auth' };
    if (!p.name.trim()) return { ok: false, error: 'invalid' };
    const d = structuredClone(this.d);
    const x = d.members.find((y) => y.id === m.id)!;
    x.name = p.name.trim(); x.phone = p.phone.trim();
    return this.commit({ ok: true, data: d, me: x });
  }

  async readNotices(): R {
    const m = this.me(); if (!m) return { ok: false, error: 'auth' };
    const d = structuredClone(this.d);
    for (const n of d.notices) if (n.memberId === m.id) n.read = true;
    return this.commit({ ok: true, data: d });
  }

  private ownerOnly(): boolean { return this.me()?.role === 'owner'; }

  async ownerBook(memberId: Id, sessionId: Id, allowNoPass: boolean): R<{ status: 'booked' | 'waitlist' }> {
    const a = this.actor(); if (!a || !this.ownerOnly()) return { ok: false, error: 'forbidden' };
    const r = rules.book(this.d, { memberId, sessionId, now: this.now(), actor: a, allowNoPass });
    if (!r.ok) return r;
    return this.commit({ ok: true, data: r.data, status: r.booking.status as 'booked' | 'waitlist' });
  }

  async ownerCancel(bookingId: Id): R<{ status: 'cancelled' | 'late_cancelled'; refunded: boolean; promoted: number }> {
    const a = this.actor(); if (!a || !this.ownerOnly()) return { ok: false, error: 'forbidden' };
    const r = rules.cancelBooking(this.d, { bookingId, now: this.now(), actor: a });
    return r.ok ? this.commit(r) : r;
  }

  async setAttendance(bookingId: Id, status: 'attended' | 'no_show' | 'booked'): R {
    if (!this.ownerOnly()) return { ok: false, error: 'forbidden' };
    const r = rules.markAttendance(this.d, { bookingId, status });
    return r.ok ? this.commit(r) : r;
  }

  async cancelSession(sessionId: Id): R<{ affected: number }> {
    if (!this.ownerOnly()) return { ok: false, error: 'forbidden' };
    const r = rules.cancelSession(this.d, { sessionId, now: this.now() });
    return r.ok ? this.commit(r) : r;
  }

  async editSession(sessionId: Id, patch: Parameters<Api['editSession']>[1]): R<{ promoted: number }> {
    if (!this.ownerOnly()) return { ok: false, error: 'forbidden' };
    const r = rules.editSession(this.d, { sessionId, now: this.now(), patch });
    return r.ok ? this.commit(r) : r;
  }

  async addSession(i: Parameters<Api['addSession']>[0]): R {
    if (!this.ownerOnly()) return { ok: false, error: 'forbidden' };
    const r = rules.addSession(this.d, i);
    return r.ok ? this.commit(r) : r;
  }

  async saveTemplate(t: Template): R<{ created: number; removed: number }> {
    if (!this.ownerOnly()) return { ok: false, error: 'forbidden' };
    const r = rules.upsertTemplate(this.d, { template: t.id ? t : { ...t, id: newId('t') }, now: this.now(), until: this.until() });
    return r.ok ? this.commit(r) : r;
  }

  async deleteTemplate(id: Id): R<{ removed: number }> {
    if (!this.ownerOnly()) return { ok: false, error: 'forbidden' };
    const r = rules.removeTemplate(this.d, { templateId: id, now: this.now() });
    return r.ok ? this.commit(r) : r;
  }

  async addMember(i: { name: string; email: string; phone: string }): R<{ member: Member }> {
    if (!this.ownerOnly()) return { ok: false, error: 'forbidden' };
    const r = rules.newMember(this.d, { ...i, now: this.now() });
    return r.ok ? this.commit(r) : r;
  }

  async saveMember(m: Pick<Member, 'id' | 'name' | 'email' | 'phone' | 'notes'>): R {
    if (!this.ownerOnly()) return { ok: false, error: 'forbidden' };
    if (!m.name.trim()) return { ok: false, error: 'invalid' };
    const d = structuredClone(this.d);
    const x = d.members.find((y) => y.id === m.id);
    if (!x) return { ok: false, error: 'member_not_found' };
    Object.assign(x, { name: m.name.trim(), email: m.email.trim().toLowerCase(), phone: m.phone.trim(), notes: m.notes });
    return this.commit({ ok: true, data: d });
  }

  async assignPass(memberId: Id, packId: Id, startsOn: string, note: string): R {
    if (!this.ownerOnly()) return { ok: false, error: 'forbidden' };
    const r = rules.assignPass(this.d, { memberId, packId, startsOn, note, now: this.now() });
    return r.ok ? this.commit(r) : r;
  }

  async adjustCredits(passId: Id, delta: number): R {
    if (!this.ownerOnly()) return { ok: false, error: 'forbidden' };
    const r = rules.adjustCredits(this.d, { passId, delta });
    return r.ok ? this.commit(r) : r;
  }

  async savePack(p: Pack): R {
    if (!this.ownerOnly()) return { ok: false, error: 'forbidden' };
    if (!p.name.trim() || p.validityDays < 1 || (p.kind === 'pack' && !(p.lessons && p.lessons > 0))) return { ok: false, error: 'invalid' };
    const d = structuredClone(this.d);
    const pk = { ...p, name: p.name.trim(), id: p.id || newId('pk') };
    const i = d.packs.findIndex((x) => x.id === pk.id);
    if (i >= 0) d.packs[i] = pk; else d.packs.push(pk);
    return this.commit({ ok: true, data: d });
  }

  async saveSettings(s: Settings): R {
    if (!this.ownerOnly()) return { ok: false, error: 'forbidden' };
    if (s.cancelWindowHours < 0 || s.bookingHorizonDays < 1 || s.bookingCloseMinutes < 0) return { ok: false, error: 'invalid' };
    const d = structuredClone(this.d);
    d.settings = { ...s };
    return this.commit({ ok: true, data: d });
  }
}
