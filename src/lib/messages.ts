// Messaggi WhatsApp per gli iscritti e suggerimenti su chi invitare quando resta un posto libero.
// Funzioni pure come in rules.ts. L'app non manda nulla da sola: prepara chi avvisare e con quale testo,
// poi lo studio apre WhatsApp col messaggio già scritto e preme "Invia".
import type { Data, Id, Member, Session } from './types';
import { HOUR, MIN, addDays, diffDays, endOf, romeDay, romeHM, romeParts, romeWall, startOf, weekdayOf, whenIt } from './time';
import { dayDM, dayLong, dayName, plural, waNumber } from './format';
import { counts, pickPass } from './rules';
import { expiringPasses, passState, typeOf } from './selectors';

export type MsgKind = 'promoted' | 'cancelled' | 'reminder' | 'expiring' | 'welcome';

/** Le famiglie di messaggi, nell'ordine in cui vanno mostrate (le più urgenti prima). */
export const MSG_KINDS: { id: MsgKind; title: string; hint: string }[] = [
  { id: 'promoted', title: 'Posto liberato', hint: 'Sono entrati in lezione dalla lista d’attesa: avvisali subito.' },
  { id: 'cancelled', title: 'Lezione annullata', hint: 'Prenotati di una lezione che hai annullato.' },
  { id: 'reminder', title: 'Promemoria lezione', hint: 'Dalle 20:00 della sera prima, per le lezioni del giorno dopo.' },
  { id: 'expiring', title: 'Abbonamento in scadenza', hint: 'Scade entro 7 giorni oppure restano 2 lezioni o meno.' },
  { id: 'welcome', title: 'Benvenuto nell’app', hint: 'Iscritti degli ultimi 14 giorni che non sono ancora entrati nell’app.' },
];

export interface MsgOptions {
  /** Indirizzo dell'app da scrivere nei messaggi, es. "https://kukolab.it/app/". */
  appUrl: string;
}

export interface Outgoing {
  /** Identifica l'evento: lo stesso evento ha sempre la stessa chiave (serve a ricordare cosa è già stato mandato). */
  key: string;
  kind: MsgKind;
  memberId: Id;
  name: string;
  phone: string;
  /** Riga breve per l'elenco. */
  detail: string;
  text: string;
  /** Quando il messaggio è diventato da mandare (ms). */
  dueAt: number;
  /** Di quando parla (inizio della lezione, scadenza, iscrizione): serve a ordinare l'elenco. */
  at: number;
}

const first = (m: Member) => m.name.trim().split(/\s+/)[0] || m.name;
const studioOf = (d: Data) => d.settings.studioName || 'KUKO LAB';

/** "oggi", "domani" oppure "giovedì 15 ottobre". */
function dayWord(day: string, today: string): string {
  const n = diffDays(today, day);
  return n === 0 ? 'oggi' : n === 1 ? 'domani' : dayLong(day);
}

/** "Functional domani alle 19:00" */
function sessionLabel(d: Data, s: Session, today: string): string {
  return `${typeOf(d, s.typeId).name} ${dayWord(romeDay(new Date(s.startsAt)), today)} alle ${romeHM(new Date(s.startsAt))}`;
}

/** Fino a quando si può annullare senza perdere la lezione. */
function cancelLine(d: Data, s: Session, now: Date, today: string, appUrl: string): string {
  const deadline = new Date(startOf(s.startsAt) - d.settings.cancelWindowHours * HOUR);
  if (now.getTime() < deadline.getTime()) {
    return `Se non riesci a venire, annulla dall’app entro le ${romeHM(deadline)} di ${dayWord(romeDay(deadline), today)} per non perdere la lezione: ${appUrl}`;
  }
  return 'Se non riesci a venire avvisaci subito qui su WhatsApp.';
}

/**
 * Quando va mandato il promemoria: la sera prima alle 20, per tutte le lezioni del giorno dopo.
 * Così lo studio li manda in un colpo solo e, con l'annullo gratuito di 12 ore, chi non può venire fa ancora in tempo
 * (per le lezioni dalle 8 in poi) e il posto si può riempire.
 */
export function reminderAt(startsAt: string): number {
  return romeWall(addDays(romeDay(new Date(startsAt)), -1), '20:00').getTime();
}

const ORDER: MsgKind[] = MSG_KINDS.map((k) => k.id);

/** Messaggi che lo studio dovrebbe mandare adesso. Quelli già mandati li toglie l'app (non li conosce questa funzione). */
export function pendingMessages(d: Data, now: Date, o: MsgOptions): Outgoing[] {
  const t = now.getTime();
  const today = romeDay(now);
  const studio = studioOf(d);
  const members = new Map(d.members.map((m) => [m.id, m]));
  const sessions = new Map(d.sessions.map((s) => [s.id, s]));
  const out: Outgoing[] = [];
  const push = (m: Member | undefined, x: Omit<Outgoing, 'memberId' | 'name' | 'phone'>) => {
    if (m && m.role === 'client') out.push({ ...x, memberId: m.id, name: m.name, phone: m.phone });
  };

  // Posto liberato: promossi dalla lista d'attesa nelle ultime 36 ore, lezione ancora da fare.
  for (const b of d.bookings) {
    if (b.status !== 'booked' || !b.promotedAt) continue;
    const s = sessions.get(b.sessionId);
    const m = members.get(b.memberId);
    if (!s || !m || s.status !== 'scheduled' || startOf(s.startsAt) <= t) continue;
    const at = new Date(b.promotedAt).getTime();
    if (t - at > 36 * HOUR) continue;
    const label = sessionLabel(d, s, today);
    push(m, {
      key: `promoted:${b.id}`, kind: 'promoted', detail: label, dueAt: at, at: startOf(s.startsAt),
      text: `Ciao ${first(m)}, buone notizie: si è liberato un posto e sei dentro a ${label}. ${cancelLine(d, s, now, today, o.appUrl)}`,
    });
  }

  // Lezione annullata dallo studio: chi aveva un posto o era in lista d'attesa. Le prenotazioni tolte dal cliente prima
  // hanno un orario di annullo diverso, quindi si prendono solo quelle annullate insieme alla lezione.
  for (const s of d.sessions) {
    if (s.status !== 'cancelled' || startOf(s.startsAt) <= t) continue;
    const cs = d.bookings.filter((b) => b.sessionId === s.id && b.status === 'cancelled' && b.cancelledAt);
    if (cs.length === 0) continue;
    const last = Math.max(...cs.map((b) => new Date(b.cancelledAt!).getTime()));
    if (t - last > 72 * HOUR) continue;
    for (const b of cs) {
      const at = new Date(b.cancelledAt!).getTime();
      if (at < last - 5000) continue;
      const m = members.get(b.memberId);
      const refunded = !!b.passId && d.passes.find((p) => p.id === b.passId)?.kind === 'pack';
      push(m, {
        key: `cancelled:${b.id}`, kind: 'cancelled', detail: `${typeOf(d, s.typeId).name}, ${whenIt(s.startsAt)}`, dueAt: at, at: startOf(s.startsAt),
        text: m ? `Ciao ${first(m)}, ci dispiace: ${typeOf(d, s.typeId).name} di ${whenIt(s.startsAt)} è stato annullato.${refunded ? ' La lezione è tornata nel tuo abbonamento.' : ''} Su ${o.appUrl} trovi le altre lezioni.` : '',
      });
    }
  }

  // Promemoria lezione.
  for (const b of d.bookings) {
    if (b.status !== 'booked') continue;
    const s = sessions.get(b.sessionId);
    const m = members.get(b.memberId);
    if (!s || !m || s.status !== 'scheduled' || startOf(s.startsAt) <= t) continue;
    const due = reminderAt(s.startsAt);
    if (due > t) continue;
    if (new Date(b.createdAt).getTime() >= due) continue; // ha prenotato dopo l'ora del promemoria: lo sa già
    if (b.promotedAt && new Date(b.promotedAt).getTime() >= due) continue; // l'ha già saputo col messaggio del posto liberato
    const label = sessionLabel(d, s, today);
    push(m, {
      key: `reminder:${b.id}`, kind: 'reminder', detail: label, dueAt: due, at: startOf(s.startsAt),
      text: `Ciao ${first(m)}, ti ricordiamo ${label}${s.trainer ? ` con ${s.trainer}` : ''}. ${cancelLine(d, s, now, today, o.appUrl)}`,
    });
  }

  // Abbonamento in scadenza o quasi finito (se ha già un altro abbonamento che lo copre, non serve).
  for (const { pass: p, member: m, reason } of expiringPasses(d, now, 7)) {
    const covered = d.passes.some((q) => q.id !== p.id && q.memberId === p.memberId && ['active', 'upcoming'].includes(passState(q, today)) && q.expiresOn >= p.expiresOn && !(q.kind === 'pack' && (q.creditsLeft ?? 0) <= 2));
    if (covered) continue;
    let what: string;
    let detail: string;
    if (reason === 'date') {
      const n = diffDays(today, p.expiresOn);
      const when = n <= 0 ? 'oggi' : n === 1 ? 'domani' : `il ${dayDM(p.expiresOn)}`;
      what = `il tuo abbonamento “${p.name}” scade ${when}`;
      detail = `${p.name}, scade ${when}`;
    } else {
      const left = p.creditsLeft ?? 0;
      what = `${plural(left, 'ti resta', 'ti restano')} ${left} ${plural(left, 'lezione', 'lezioni')} nel pacchetto “${p.name}”`;
      detail = `${p.name}, ${left} ${plural(left, 'lezione rimasta', 'lezioni rimaste')}`;
    }
    push(m, {
      key: `expiring:${p.id}:${reason}`, kind: 'expiring', detail, dueAt: romeWall(today, '00:00').getTime(), at: romeWall(p.expiresOn, '00:00').getTime(),
      text: `Ciao ${first(m)}, ti scrivo da ${studio}: ${what}. Vuoi rinnovarlo? Rispondi qui oppure passa in studio.`,
    });
  }

  // Benvenuto: iscritti degli ultimi 14 giorni che non sono ancora entrati nell'app (senza email non possono entrare).
  for (const m of d.members) {
    if (m.role !== 'client' || !m.email || m.hasAccount === true) continue;
    const since = diffDays(romeDay(new Date(m.createdAt)), today);
    if (since < 0 || since > 14) continue;
    push(m, {
      key: `welcome:${m.id}`, kind: 'welcome', detail: `Iscritto il ${dayDM(romeDay(new Date(m.createdAt)))}`, dueAt: new Date(m.createdAt).getTime(), at: new Date(m.createdAt).getTime(),
      text: `Ciao ${first(m)}, ti diamo il benvenuto in ${studio}! Da ora prenoti le lezioni dall’app: apri ${o.appUrl} e scrivi l’email che ci hai lasciato (${m.email}). Ti arriva un codice per entrare, nessuna password da ricordare. Mettila sulla Home del telefono: iPhone, Condividi e poi Aggiungi alla schermata Home; Android, menu del browser e poi Installa app.`,
    });
  }

  return out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.at - b.at || a.name.localeCompare(b.name, 'it'));
}

// ---------------------------------------------------------------------------------------------
// Chi invitare per un posto libero

export interface Candidate {
  member: Member;
  score: number;
  /** Perché è consigliato, in ordine di peso. */
  reasons: string[];
  key: string;
  text: string;
}

export interface FillSlot {
  session: Session;
  label: string;
  seats: number;
  candidates: Candidate[];
}

export interface FillOptions extends MsgOptions {
  /** Lezioni che iniziano entro queste ore (default 36). */
  hours?: number;
  /** Quante persone proporre per lezione (default 3). */
  max?: number;
  /** Inviti già mandati o scartati ("invite:sessione:persona"). */
  skip?: ReadonlySet<string>;
  /** Persone invitate per un'altra lezione da poco: scendono in classifica. */
  recent?: ReadonlySet<Id>;
}

const DAY = 24 * HOUR;
const SEAT_STATUS = new Set(['booked', 'attended', 'no_show']);

/**
 * Per ogni lezione nelle prossime ore con posti ancora liberi propone chi invitare.
 * Chi può prenotare davvero (abbonamento valido, nessuna lezione sovrapposta, telefono) viene ordinato per:
 * quante volte ha fatto quel tipo di allenamento negli ultimi 3 mesi, se di solito viene lo stesso giorno e alla stessa ora,
 * se ha lezioni da usare prima della scadenza o niente in programma, meno chi ha saltato lezioni senza avvisare.
 */
export function fillSuggestions(d: Data, now: Date, o: FillOptions): FillSlot[] {
  const t = now.getTime();
  const today = romeDay(now);
  const horizon = t + (o.hours ?? 36) * HOUR;
  const max = o.max ?? 3;
  const studio = studioOf(d);
  const sessions = new Map(d.sessions.map((s) => [s.id, s]));
  const clients = d.members.filter((m) => m.role === 'client' && waNumber(m.phone) !== null);
  const byMember = new Map<Id, typeof d.bookings>();
  for (const b of d.bookings) {
    const l = byMember.get(b.memberId);
    if (l) l.push(b); else byMember.set(b.memberId, [b]);
  }

  const slots: FillSlot[] = [];
  const open = d.sessions
    .filter((s) => s.status === 'scheduled' && startOf(s.startsAt) - d.settings.bookingCloseMinutes * MIN > t && startOf(s.startsAt) <= horizon)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));

  for (const s of open) {
    const seats = Math.max(0, s.capacity - counts(d, s.id).booked);
    if (seats <= 0) continue;
    const a0 = startOf(s.startsAt), a1 = endOf(s.startsAt, s.duration);
    const sDay = romeDay(new Date(s.startsAt));
    const sHour = romeParts(new Date(s.startsAt));
    const sMinutes = sHour.hh * 60 + sHour.mm;
    const type = typeOf(d, s.typeId);
    const label = sessionLabel(d, s, today);
    const cands: Candidate[] = [];

    for (const m of clients) {
      const key = `invite:${s.id}:${m.id}`;
      if (o.skip?.has(key)) continue;
      const mine = byMember.get(m.id) ?? [];
      if (mine.some((b) => b.sessionId === s.id && (SEAT_STATUS.has(b.status) || b.status === 'waitlist'))) continue;
      const pass = pickPass(d, m.id, s);
      if (!pass) continue;
      // lezione sovrapposta
      let clash = false, sameDay = false;
      let typeCount = 0, usual = 0, noShows = 0, lateCancels = 0, upcoming = 0;
      for (const b of mine) {
        const bs = sessions.get(b.sessionId);
        if (!bs || bs.status !== 'scheduled') continue;
        const b0 = startOf(bs.startsAt), b1 = endOf(bs.startsAt, bs.duration);
        const holds = SEAT_STATUS.has(b.status);
        if (holds && b.sessionId !== s.id && b0 < a1 && b1 > a0) clash = true;
        if (b.status === 'booked' && b0 > t && b0 <= t + 7 * DAY) upcoming += 1;
        if (b.status === 'booked' && b0 > t && romeDay(new Date(bs.startsAt)) === sDay) sameDay = true;
        // storico: lezioni concluse (segnate presenti o rimaste prenotate) negli ultimi 3 mesi
        if (b1 <= t && b0 >= t - 90 * DAY && (b.status === 'attended' || b.status === 'booked')) {
          if (bs.typeId === s.typeId) typeCount += 1;
          const bp = romeParts(new Date(bs.startsAt));
          if (weekdayOf(romeDay(new Date(bs.startsAt))) === weekdayOf(sDay) && Math.abs(bp.hh * 60 + bp.mm - sMinutes) <= 90) usual += 1;
        }
        if (b1 <= t && b0 >= t - 60 * DAY && b.status === 'no_show') noShows += 1;
        if (b0 >= t - 30 * DAY && b0 <= t + 7 * DAY && b.status === 'late_cancelled') lateCancels += 1;
      }
      if (clash) continue;

      let score = 0;
      const why: { w: number; text: string }[] = [];
      if (typeCount > 0) {
        score += 3 * Math.min(6, typeCount);
        why.push({ w: 3 * Math.min(6, typeCount), text: `ha fatto ${type.name} ${typeCount} ${plural(typeCount, 'volta', 'volte')} negli ultimi 3 mesi` });
      }
      if (usual > 0) {
        const w = 2 * Math.min(3, usual);
        score += w;
        why.push({ w, text: `di solito viene il ${dayName(sDay)} a quest’ora` });
      }
      if (pass.kind === 'pack' && (pass.creditsLeft ?? 0) > 0 && diffDays(today, pass.expiresOn) <= 14) {
        const left = pass.creditsLeft ?? 0;
        score += 4;
        why.push({ w: 4, text: `${plural(left, 'gli resta', 'gli restano')} ${left} ${plural(left, 'lezione', 'lezioni')} e il pacchetto scade il ${dayDM(pass.expiresOn)}` });
      }
      if (upcoming === 0) {
        score += 2;
        why.push({ w: 2, text: 'non ha lezioni in programma nei prossimi 7 giorni' });
      }
      if (noShows >= 2) score -= 3;
      if (lateCancels >= 2) score -= 1;
      if (sameDay) score -= 2;
      if (o.recent?.has(m.id)) score -= 5;
      if (score < 2) continue;

      const text = `Ciao ${first(m)}, ti scrivo da ${studio}: per ${label} ${seats === 1 ? 'c’è ancora un posto libero' : `ci sono ancora ${seats} posti liberi`}. Ti va di venire? Prenota dall’app: ${o.appUrl} (il posto va a chi prenota per primo).`;
      cands.push({ member: m, score, reasons: why.sort((x, y) => y.w - x.w).map((x) => x.text), key, text });
    }

    cands.sort((a, b) => b.score - a.score || a.member.name.localeCompare(b.member.name, 'it'));
    if (cands.length > 0) slots.push({ session: s, label, seats, candidates: cands.slice(0, max) });
  }
  return slots;
}
