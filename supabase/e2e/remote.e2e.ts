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
/** Come fa una persona: chiede il codice, lo legge dalla mail (qui: dal finto Supabase) e lo scrive. */
const loginCode = async (email: string) => {
  ok(await api.requestCode(email));
  const { code } = await post('/__code', { email });
  assert.match(String(code), /^\d{6}$/, 'è partito un codice');
  return ok(await api.verifyCode(email, code));
};

const api = new RemoteApi(BASE, 'anon-key');
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  assert.ok(r.ok, `atteso ok, ricevuto ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
};
const bad = (r: { ok: boolean; error?: string }, code: string) => {
  assert.equal(r.ok, false, 'atteso errore');
  assert.equal((r as any).error, code);
};

const owner = { name: 'Valerio Test', email: 'valerio@kuko.test', phone: '3331234567' };
const marta = { name: 'Marta Rossi', email: 'marta@kuko.test', phone: '3330001111' };
const luca = { name: 'Luca Bianchi', email: 'luca@kuko.test', phone: '3330002222' };

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

test('registrazioni chiuse: chi lo studio non ha iscritto non crea nessun account, e da fuori non si capisce chi è iscritto', async () => {
  const users = async () => Number(await sql('select count(*) from auth.users;'));
  const members = async () => Number(await sql('select count(*) from public.members;'));
  // il codice "parte" lo stesso per chiunque (stessa risposta), ma non nasce nessun utente e nessuna scheda
  ok(await api.requestCode('sconosciuto@kuko.test'));
  assert.equal((await post('/__code', { email: 'sconosciuto@kuko.test' })).code, null, 'nessun codice per chi non è iscritto');
  assert.equal(await users(), 0);
  assert.equal(await members(), 0);
  // il vecchio modulo "crea profilo con password" ora è respinto dal database
  const reg = await api.signUp({ name: 'Intruso', email: 'intruso@kuko.test', phone: '', password: 'password123' });
  assert.equal(reg.ok, false);
  assert.equal(await users(), 0);
  // un codice a caso non fa entrare nessuno
  const wrong = await api.verifyCode('sconosciuto@kuko.test', '123456');
  assert.equal(wrong.ok, false);
  assert.match((wrong as any).message, /codice/i);
  assert.equal(await api.init(), null);
});

test('l’owner si inserisce da SQL ed entra con il codice, poi vede tutto', async () => {
  await sql(`insert into public.members (name, email, phone, role) values ('${owner.name}', '${owner.email}', '${owner.phone}', 'owner');`);
  ok(await api.requestCode(owner.email));
  const { code } = await post('/__code', { email: owner.email });
  // codice sbagliato: respinto, e non brucia quello giusto
  const wrong = await api.verifyCode(owner.email, code === '000000' ? '000001' : '000000');
  assert.equal(wrong.ok, false);
  // lo spazio in mezzo (come lo si copia dalla mail) non conta
  const s = ok(await api.verifyCode(owner.email, `${code.slice(0, 3)} ${code.slice(3)}`));
  assert.equal(s.me.role, 'owner');
  assert.equal(s.me.name, owner.name);
  assert.equal(s.me.phone, owner.phone);
  assert.equal(await sql(`select count(*) from public.members where lower(email) = '${owner.email}';`), '1', 'nessun doppione');
  data = s.data;
  assert.deepEqual(data.types.map((t) => t.id).sort(), ['functional', 'pilates', 'pt']);
  assert.equal(data.settings.cancelWindowHours, 12);
  assert.equal(data.counts, undefined, 'l’owner non usa i conteggi: ha tutte le prenotazioni');
  await api.signOut();
  // il codice vale una volta sola
  assert.equal((await api.verifyCode(owner.email, code)).ok, false);
});

test('un codice scaduto non vale; con il nuovo si entra, anche più volte', async () => {
  ok(await api.requestCode(owner.email));
  const old = (await post('/__code', { email: owner.email })).code;
  await post('/__expire_codes', {});
  const r = await api.verifyCode(owner.email, old);
  assert.equal(r.ok, false);
  assert.match((r as any).message, /scaduto/);
  const s = await loginCode(owner.email);
  assert.equal(s.me.role, 'owner');
  await api.signOut();
});

test('owner: pacchetto, lezione, iscritto, abbonamento', async () => {
  await loginCode(owner.email);
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

test('cliente: al primo accesso con il codice trova la scheda creata dall’owner, con l’abbonamento', async () => {
  const s = await loginCode(marta.email);
  assert.equal(s.me.id, martaMemberId, 'stessa persona della scheda dell’owner');
  assert.equal(s.me.name, 'Marta Rossi');
  assert.equal(await sql(`select count(*) from public.members where lower(email) = '${marta.email}';`), '1', 'nessun doppione');
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
  // Luca viene iscritto in studio e ha un abbonamento; l'owner lo mette sulla lezione (2 posti: Marta + Luca = pieno)
  await api.signOut();
  await loginCode(owner.email);
  const lucaMember = ok(await api.addMember({ name: luca.name, email: luca.email, phone: luca.phone })).member;
  assert.ok(lucaMember, 'l’owner ha iscritto Luca');
  // l'owner vede chi ha già un account e a chi manca ancora l'invito
  const seen = (await api.refresh() as any).data.members as Array<{ email: string; hasAccount?: boolean }>;
  assert.equal(seen.find((m) => m.email === marta.email)!.hasAccount, true, 'Marta è già entrata');
  assert.equal(seen.find((m) => m.email === luca.email)!.hasAccount, false, 'Luca non è ancora entrato');
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
  const s = await loginCode(marta.email);
  assert.equal(s.me.name, 'Marta R.');
  assert.equal(s.data.members[0].notes, '', 'il cliente non vede le note private dell’owner');
  // Marta era già stata tolta dalla lezione: l'avviso arriva a chi era prenotato (Luca e Sara)
  await api.signOut();
  // Luca entra per la prima volta: la sua scheda è quella creata dall'owner, con l'abbonamento e la lezione
  const l = await loginCode(luca.email);
  assert.equal(l.me.name, luca.name);
  assert.equal(await sql(`select count(*) from public.members where lower(email) = '${luca.email}';`), '1', 'nessun doppione');
  assert.equal(l.data.passes.length, 1, 'ritrova il suo abbonamento');
  const unread = l.data.notices.filter((n) => !n.read);
  assert.ok(unread.length >= 1, 'Luca ha un avviso');
  assert.match(unread[0].text, /annullat/i);
  const read = ok(await api.readNotices());
  assert.equal(read.data.notices.filter((n) => !n.read).length, 0);
  const sess = read.data.sessions.find((x) => x.id === sessionId)!;
  assert.equal(sess.status, 'cancelled');
  assert.equal(read.data.passes[0].creditsLeft, 10, 'la lezione torna nell’abbonamento');
});

test('profilo, uscita, nuovo accesso con il codice', async () => {
  const p = ok(await api.updateProfile({ name: 'Luca B.', phone: '3331110000' }));
  assert.equal(p.me.name, 'Luca B.');
  assert.equal(p.data.members[0].phone, '3331110000');
  bad(await api.updateProfile({ name: '  ', phone: '' }), 'invalid');

  await api.signOut();
  assert.equal(await new RemoteApi(BASE, 'anon-key').init(), null, 'dopo l’uscita non resta nessuna sessione');
  // niente password: l'unico modo di rientrare è un codice nuovo
  assert.equal((await api.signIn(luca.email, 'qualunquecosa')).ok, false);
  const again = await loginCode(luca.email);
  assert.equal(again.me.name, 'Luca B.', 'ritrova il profilo aggiornato');
  await api.signOut();
});

test('chi conosce l’email di un iscritto non può lasciarci sopra una sua password: alla prima conferma viene azzerata', async () => {
  await loginCode(owner.email);
  ok(await api.addMember({ name: 'Carla Esposito', email: 'carla@kuko.test', phone: '' }));
  await api.signOut();
  // un estraneo conosce l'email e ci registra sopra una password prima che Carla entri
  const trap = await api.signUp({ name: 'Estraneo', email: 'carla@kuko.test', phone: '', password: 'passwordtrappola' });
  assert.equal(trap.ok, true);
  assert.equal((await api.signIn('carla@kuko.test', 'passwordtrappola')).ok, false, 'senza conferma non entra');
  assert.equal(await sql(`select count(*) from public.members where lower(email) = 'carla@kuko.test';`), '1', 'nessun doppione');
  // Carla entra con il codice che arriva a lei: da lì in poi la password dell'estraneo non vale più
  const c = await loginCode('carla@kuko.test');
  assert.equal(c.me.name, 'Carla Esposito', 'la scheda è quella creata dallo studio, non quella dell’estraneo');
  await api.signOut();
  const late = await api.signIn('carla@kuko.test', 'passwordtrappola');
  assert.equal(late.ok, false, 'la password dell’estraneo è azzerata');
  assert.equal(await sql(`select encrypted_password from auth.users where email = 'carla@kuko.test';`), '');
});

test('permessi: un cliente non può usare le funzioni da owner', async () => {
  await loginCode(marta.email);
  bad(await api.addSession({ typeId: 'pt', startsAt: inDays(4), capacity: 1, duration: 60, trainer: 'x' }), 'forbidden');
  bad(await api.cancelSession(sessionId), 'forbidden');
  bad(await api.savePack({ id: '', name: 'Gratis', kind: 'pack', lessons: 99, validityDays: 999, priceCents: 0, typeIds: [], weeklyLimit: null, active: true }), 'forbidden');
  bad(await api.adjustCredits(crypto.randomUUID(), 100), 'forbidden');
  await api.signOut();
});

test('richieste dal sito: il modulo scrive senza account, solo l’owner le vede e le gestisce', async () => {
  // come fa il modulo del sito: chiamata diretta con la sola chiave pubblica
  const send = (p: object) => fetch(BASE + '/rest/v1/rpc/submit_lead', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'anon-key', Authorization: 'Bearer anon-key' }, body: JSON.stringify({ p }) });
  const r1 = await send({ topic: 'pilates', name: 'Chiara Neri', phone: '+39 347 000 1122', email: 'chiara@example.com', slots: ['sera', 'sabato'], note: 'Prima volta', consent: true });
  assert.equal(r1.status, 200);
  assert.deepEqual(await r1.json(), { ok: true });
  const r2 = await send({ topic: 'nutrition', name: 'Chiara Neri', phone: '+39 347 000 1122', consent: false });
  assert.equal(r2.status, 400, 'senza consenso la richiesta è rifiutata');
  assert.equal((await r2.json()).message, 'invalid');
  // chi non ha un account non può leggere nulla
  const snap = await fetch(BASE + '/rest/v1/rpc/snapshot', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer anon-key' }, body: '{}' });
  assert.equal(snap.status, 403);

  // un cliente non le vede e non le gestisce
  const c = await loginCode(marta.email);
  assert.equal(c.data.leads.length, 0);
  bad(await api.saveLead({ id: crypto.randomUUID(), status: 'done' }), 'forbidden');
  bad(await api.deleteLead(crypto.randomUUID()), 'forbidden');
  // una socia chiede la consulenza dall'app: i dati vengono dal suo profilo
  const rc = ok(await api.requestConsult({ topic: 'nutrition', note: 'Vorrei un piano per la gara' }));
  assert.equal(rc.data.leads.length, 0, 'anche dopo la richiesta la socia non vede le richieste');
  bad(await api.requestConsult({ topic: 'zumba' }), 'invalid');
  await api.signOut();

  // l'owner sì
  const o = await loginCode(owner.email);
  assert.equal(o.data.leads.length, 2);
  const mine = o.data.leads.find((l) => l.source === 'app')!;
  assert.deepEqual([mine.kind, mine.topic, mine.name, mine.email, mine.note], ['nutrition', 'nutrition', 'Marta R.', marta.email.toLowerCase(), 'Vorrei un piano per la gara']);
  const lead = o.data.leads.find((l) => l.source === 'sito')!;
  assert.deepEqual([lead.kind, lead.topic, lead.name, lead.status], ['trial', 'pilates', 'Chiara Neri', 'new']);
  assert.deepEqual(lead.slots.sort(), ['sabato', 'sera']);
  assert.equal(lead.email, 'chiara@example.com');
  const u = ok(await api.saveLead({ id: lead.id, status: 'contacted', ownerNote: 'Sentita al telefono' }));
  const ul = u.data.leads.find((l) => l.id === lead.id)!;
  assert.deepEqual([ul.status, ul.ownerNote], ['contacted', 'Sentita al telefono']);
  assert.ok(ul.updatedAt);
  const s = ok(await api.saveLead({ id: lead.id, status: 'scheduled' }));
  assert.equal(s.data.leads.find((l) => l.id === lead.id)!.ownerNote, 'Sentita al telefono', 'la nota resta se cambia solo lo stato');
  bad(await api.saveLead({ id: crypto.randomUUID(), status: 'done' }), 'lead_not_found');
  const d = ok(await api.deleteLead(lead.id));
  assert.equal(d.data.leads.length, 1);
  assert.equal(ok(await api.deleteLead(mine.id)).data.leads.length, 0);
  await api.signOut();
});
