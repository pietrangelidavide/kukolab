// Prova end-to-end: l'app in modalità Supabase (RemoteApi) contro il vero schema SQL, passando dal finto Supabase (shim.mjs).
// Si lancia con: npm run db:e2e
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RemoteApi } from '../../src/lib/remote';
import type { Data, Id } from '../../src/lib/types';
import { romeDay, romeWall, addDays } from '../../src/lib/time';

const BASE = process.env.SHIM_URL ?? 'http://127.0.0.1:54330';
// l'app usa location/history del browser: qui bastano finti
(globalThis as any).location = { origin: 'https://kuko.example', hash: '', pathname: '/app/', search: '' };
(globalThis as any).history = { replaceState() {} };

const post = async (path: string, body: unknown) => (await fetch(BASE + path, { method: 'POST', body: JSON.stringify(body) })).json() as Promise<any>;
const sql = async (q: string) => (await post('/__sql', { sql: q })).out as string;
const confirm = (email: string) => post('/__confirm', { email });

const api = new RemoteApi(BASE, 'anon-key');
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  assert.ok(r.ok, `atteso ok, ricevuto ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
};
const bad = (r: { ok: boolean; error?: string }, code: string) => {
  assert.equal(r.ok, false, 'atteso errore');
  assert.equal((r as any).error, code);
};

const owner = { name: 'Valerio Test', email: 'valerio@kuko.test', phone: '3331234567', password: 'segreta123' };
const marta = { name: 'Marta Rossi', email: 'marta@kuko.test', phone: '3330001111', password: 'martapass1' };
const luca = { name: 'Luca Bianchi', email: 'luca@kuko.test', phone: '3330002222', password: 'lucapass12' };

// una lezione tra 3 giorni alle 10:00 (ora di Roma): abbastanza lontana per annullare gratis
const inDays = (n: number, hm = '10:00') => romeWall(addDays(romeDay(new Date()), n), hm).toISOString();

let data: Data;
let sessionId: Id;
let packId: Id;
let martaMemberId: Id;

test('senza accesso non c’è sessione; credenziali sbagliate danno un errore chiaro', async () => {
  assert.equal(await api.init(), null);
  const r = await api.signIn('nessuno@kuko.test', 'xxxxxxxx');
  assert.equal(r.ok, false);
  assert.match((r as any).message, /Email o password/);
});

test('iscrizione: serve confermare l’email prima di entrare', async () => {
  const r = ok(await api.signUp(owner));
  assert.equal((r as any).needsConfirm, true);
  const login = await api.signIn(owner.email, owner.password);
  assert.equal(login.ok, false);
  assert.match((login as any).message, /Conferma/);
  const dup = await api.signUp(owner);
  assert.equal(dup.ok, false);
  assert.match((dup as any).message, /Esiste già/);
  await confirm(owner.email);
  const s = ok(await api.signIn(owner.email, owner.password));
  assert.equal(s.me.role, 'client', 'chi si iscrive è un cliente');
  assert.equal(s.me.name, 'Valerio Test');
  assert.equal(s.me.phone, '3331234567');
  await api.signOut();
});

test('l’owner si promuove da SQL, poi vede tutto', async () => {
  await sql(`update public.members set role = 'owner' where lower(email) = '${owner.email}';`);
  const s = ok(await api.signIn(owner.email, owner.password));
  assert.equal(s.me.role, 'owner');
  data = s.data;
  assert.deepEqual(data.types.map((t) => t.id).sort(), ['functional', 'pilates', 'pt']);
  assert.equal(data.settings.cancelWindowHours, 12);
  assert.equal(data.counts, undefined, 'l’owner non usa i conteggi: ha tutte le prenotazioni');
});

test('owner: pacchetto, lezione, iscritto, abbonamento', async () => {
  data = ok(await api.savePack({ id: '', name: 'Functional 10', kind: 'pack', lessons: 10, validityDays: 90, priceCents: 11000, typeIds: ['functional'], weeklyLimit: null, active: true })).data;
  const pack = data.packs.find((p) => p.name === 'Functional 10')!;
  assert.ok(pack, 'pacchetto creato');
  assert.deepEqual([pack.kind, pack.lessons, pack.priceCents, pack.typeIds], ['pack', 10, 11000, ['functional']]);
  packId = pack.id;
  data = ok(await api.savePack({ ...pack, name: 'Functional 10 lezioni', active: true })).data;
  assert.equal(data.packs.filter((p) => p.name.startsWith('Functional 10')).length, 1, 'modifica, non duplicato');

  const r = ok(await api.addMember({ name: marta.name, email: marta.email, phone: marta.phone }));
  assert.equal(r.member.name, 'Marta Rossi');
  martaMemberId = r.member.id;
  data = ok(await api.assignPass(martaMemberId, packId, romeDay(new Date()), 'pagato in contanti')).data;
  const pass = data.passes.find((p) => p.memberId === martaMemberId)!;
  assert.equal(pass.creditsLeft, 10);
  assert.equal(pass.note, 'pagato in contanti');
  assert.equal(pass.expiresOn, addDays(romeDay(new Date()), 90 - 1) , 'scade dopo 90 giorni di validità (inclusi)');

  data = ok(await api.addSession({ typeId: 'functional', startsAt: inDays(3), capacity: 2, duration: 50, trainer: 'Valerio', note: 'Porta l’asciugamano' })).data;
  const s = data.sessions.find((x) => x.note === 'Porta l’asciugamano')!;
  assert.ok(s);
  assert.deepEqual([s.typeId, s.capacity, s.duration, s.trainer, s.status], ['functional', 2, 50, 'Valerio', 'scheduled']);
  assert.equal(new Date(s.startsAt).toISOString(), inDays(3));
  sessionId = s.id;
  await api.signOut();
});

test('cliente: l’iscrizione si collega alla scheda creata dall’owner e porta con sé l’abbonamento', async () => {
  ok(await api.signUp(marta));
  await confirm(marta.email);
  const s = ok(await api.signIn(marta.email, marta.password));
  assert.equal(s.me.id, martaMemberId, 'stessa persona della scheda dell’owner');
  assert.equal(s.me.role, 'client');
  assert.equal(s.data.members.length, 1, 'un cliente vede solo se stesso');
  assert.equal(s.data.passes.length, 1);
  assert.equal(s.data.passes[0].creditsLeft, 10);
  assert.ok(s.data.counts && s.data.counts[sessionId], 'ci sono i conteggi dei posti');
  assert.deepEqual(s.data.counts![sessionId], { booked: 0, waitlist: 0 });
  assert.equal(s.data.bookings.length, 0);
});

test('cliente: prenota, doppia prenotazione rifiutata, annullo gratuito con rimborso', async () => {
  const b = ok(await api.book(sessionId));
  assert.equal(b.status, 'booked');
  assert.equal(b.data.passes[0].creditsLeft, 9);
  assert.equal(b.data.bookings.filter((x) => x.status === 'booked').length, 1);
  assert.equal(b.data.counts![sessionId].booked, 1);

  bad(await api.book(sessionId), 'already_booked');

  const bookingId = b.data.bookings.find((x) => x.status === 'booked')!.id;
  const c = ok(await api.cancel(bookingId));
  assert.deepEqual([c.status, c.refunded, c.promoted], ['cancelled', true, 0]);
  assert.equal(c.data.passes[0].creditsLeft, 10);
  bad(await api.cancel(bookingId), 'not_cancellable');
});

test('il token scaduto si rinnova da solo senza che l’utente se ne accorga', async () => {
  await post('/__expire', {});
  const r = ok(await api.refresh());
  assert.equal(r.data.members.length, 1);
  const b = ok(await api.book(sessionId));
  assert.equal(b.status, 'booked');
});

test('sessione ripristinata dopo un ricaricamento della pagina', async () => {
  const again = new RemoteApi(BASE, 'anon-key');
  const s = await again.init();
  assert.ok(s, 'sessione ritrovata');
  assert.equal(s!.me.id, martaMemberId);
  assert.equal(s!.data.bookings.filter((x) => x.status === 'booked').length, 1);
});

test('lista d’attesa: con posti finiti entra in coda con la posizione; l’owner vede tutto', async () => {
  // Luca si iscrive e ha un abbonamento; l'owner lo mette sulla lezione (2 posti: Marta + Luca = pieno)
  await api.signOut();
  ok(await api.signUp(luca));
  await confirm(luca.email);
  await api.signIn(owner.email, owner.password);
  const lucaMember = (await api.refresh() as any).data.members.find((m: any) => m.email === luca.email);
  assert.ok(lucaMember, 'l’owner vede Luca');
  ok(await api.assignPass(lucaMember.id, packId, romeDay(new Date()), ''));
  const r = ok(await api.ownerBook(lucaMember.id, sessionId, false));
  assert.equal(r.status, 'booked');
  // un terzo iscritto creato dall'owner, con abbonamento, finisce in lista
  const sara = ok(await api.addMember({ name: 'Sara Verdi', email: 'sara@kuko.test', phone: '' })).member;
  ok(await api.assignPass(sara.id, packId, romeDay(new Date()), ''));
  const w = ok(await api.ownerBook(sara.id, sessionId, false));
  assert.equal(w.status, 'waitlist');
  const waiting = w.data.bookings.find((b) => b.memberId === sara.id && b.status === 'waitlist')!;
  assert.equal(waiting.position, 1);
  // senza abbonamento serve la conferma esplicita
  const nopass = ok(await api.addMember({ name: 'Senza Pacchetto', email: '', phone: '' })).member;
  bad(await api.ownerBook(nopass.id, sessionId, false), 'no_pass');
  // presenza e assenza
  const mine = r.data.bookings.find((b) => b.memberId === martaMemberId && b.status === 'booked')!;
  data = ok(await api.setAttendance(mine.id, 'attended')).data;
  assert.equal(data.bookings.find((b) => b.id === mine.id)!.status, 'attended');
  data = ok(await api.setAttendance(mine.id, 'booked')).data;
  assert.equal(data.bookings.find((b) => b.id === mine.id)!.status, 'booked');
  // se Marta annulla, Sara sale dalla lista
  const out = ok(await api.ownerCancel(mine.id));
  assert.equal(out.promoted, 1);
  assert.equal(out.data.bookings.find((b) => b.id === waiting.id)!.status, 'booked');
});

test('owner: correzione crediti, modifica lezione, impostazioni, modello settimanale', async () => {
  const pass = (await api.refresh() as any).data.passes.find((p: any) => p.memberId === martaMemberId);
  data = ok(await api.adjustCredits(pass.id, -2)).data;
  assert.equal(data.passes.find((p) => p.id === pass.id)!.creditsLeft, pass.creditsLeft - 2);

  const e = ok(await api.editSession(sessionId, { capacity: 3, trainer: 'Team KUKO', note: '' }));
  assert.equal(e.data.sessions.find((s) => s.id === sessionId)!.capacity, 3);
  assert.equal(e.data.sessions.find((s) => s.id === sessionId)!.trainer, 'Team KUKO');

  data = ok(await api.saveSettings({ ...e.data.settings, cancelWindowHours: 6, bookingHorizonDays: 21 })).data;
  assert.equal(data.settings.cancelWindowHours, 6);
  assert.equal(data.settings.bookingHorizonDays, 21);

  const wd = ((new Date(inDays(5)).getUTCDay() + 6) % 7) + 1; // 1 = lunedì ... 7 = domenica
  const t = ok(await api.saveTemplate({ id: '', typeId: 'pilates', weekday: wd, time: '18:00', capacity: 4, duration: 50, trainer: 'Team KUKO', active: true }));
  assert.ok(t.created >= 1, 'il modello genera le lezioni dei prossimi giorni');
  const tpl = t.data.templates.find((x) => x.typeId === 'pilates')!;
  assert.equal(tpl.time, '18:00');
  const del = ok(await api.deleteTemplate(tpl.id));
  assert.equal(del.removed, t.created, 'le lezioni future senza prenotati spariscono col modello');
  assert.equal(del.data.templates.length, 0);
});

test('owner: scheda iscritto e profilo', async () => {
  data = ok(await api.saveMember({ id: martaMemberId, name: 'Marta R.', email: marta.email, phone: '3339998888', notes: 'Allergica ai kiwi' })).data;
  const m = data.members.find((x) => x.id === martaMemberId)!;
  assert.deepEqual([m.name, m.phone, m.notes], ['Marta R.', '3339998888', 'Allergica ai kiwi']);
});

test('annullare una lezione avvisa i clienti; il cliente vede l’avviso e lo segna come letto', async () => {
  const c = ok(await api.cancelSession(sessionId));
  assert.ok(c.affected >= 1);
  await api.signOut();
  const s = ok(await api.signIn(marta.email, marta.password));
  assert.equal(s.me.name, 'Marta R.');
  assert.equal(s.data.members[0].notes, '', 'il cliente non vede le note private dell’owner');
  // Marta era già stata tolta dalla lezione: l'avviso arriva a chi era prenotato (Luca e Sara)
  await api.signOut();
  const l = ok(await api.signIn(luca.email, luca.password));
  const unread = l.data.notices.filter((n) => !n.read);
  assert.ok(unread.length >= 1, 'Luca ha un avviso');
  assert.match(unread[0].text, /annullat/i);
  const read = ok(await api.readNotices());
  assert.equal(read.data.notices.filter((n) => !n.read).length, 0);
  const sess = read.data.sessions.find((x) => x.id === sessionId)!;
  assert.equal(sess.status, 'cancelled');
  assert.equal(read.data.passes[0].creditsLeft, 10, 'la lezione torna nell’abbonamento');
});

test('profilo, cambio password, uscita', async () => {
  const p = ok(await api.updateProfile({ name: 'Luca B.', phone: '3331110000' }));
  assert.equal(p.me.name, 'Luca B.');
  assert.equal(p.data.members[0].phone, '3331110000');
  bad(await api.updateProfile({ name: '  ', phone: '' }), 'invalid');

  assert.equal((await api.changePassword!('nuovapass99')).ok, true);
  await api.signOut();
  const old = await api.signIn(luca.email, luca.password);
  assert.equal(old.ok, false);
  ok(await api.signIn(luca.email, 'nuovapass99'));
  await api.signOut();
  assert.equal(await new RemoteApi(BASE, 'anon-key').init(), null, 'dopo l’uscita non resta nessuna sessione');
  assert.equal((await api.resetPassword!(luca.email)).ok, true);
});

test('permessi: un cliente non può usare le funzioni da owner', async () => {
  ok(await api.signIn(marta.email, marta.password));
  bad(await api.addSession({ typeId: 'pt', startsAt: inDays(4), capacity: 1, duration: 60, trainer: 'x' }), 'forbidden');
  bad(await api.cancelSession(sessionId), 'forbidden');
  bad(await api.savePack({ id: '', name: 'Gratis', kind: 'pack', lessons: 99, validityDays: 999, priceCents: 0, typeIds: [], weeklyLimit: null, active: true }), 'forbidden');
  bad(await api.adjustCredits(crypto.randomUUID(), 100), 'forbidden');
  await api.signOut();
});
