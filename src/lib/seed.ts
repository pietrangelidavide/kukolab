// Dati dimostrativi: lo studio con orari, iscritti, abbonamenti e prenotazioni attorno a "oggi".
// Nomi e contatti sono inventati. Gli orari vengono da src/data/schedule.json.
import schedule from '../data/schedule.json';
import packsFile from '../data/packs.json';
import type { Booking, Data, Lead, Member, Pack, PayMethod, Payment, Pass, Template, Tone } from './types';
import { book, cancelBooking, generateSessions, pickPass } from './rules';
import { newId } from './ids';
import { HOUR, addDays, romeDay } from './time';

export const DEMO_OWNER_ID = 'm_owner';
export const DEMO_CLIENT_ID = 'm_martina';
export const DEMO_STAFF_ID = 'm_segreteria';
export const DEMO_TRAINER_ID = 'm_sofia';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const defaultSettings = () => ({ studioName: 'KUKO LAB', cancelWindowHours: 12, bookingHorizonDays: 14, bookingCloseMinutes: 15, waitlistEnabled: true });

export function defaultTypes() {
  return schedule.types.map((t) => ({ id: t.id, name: t.name, capacity: t.capacity, duration: t.duration, tone: t.tone as Tone }));
}

export function defaultTemplates(): Template[] {
  const out: Template[] = [];
  const types = new Map(schedule.types.map((t) => [t.id, t]));
  for (const w of schedule.weekly) {
    const t = types.get(w.type)!;
    for (const wd of w.days) out.push({ id: `t_${w.type}_${wd}_${w.time.replace(':', '')}`, typeId: w.type, weekday: wd, time: w.time, capacity: t.capacity, duration: t.duration, trainer: w.trainer, active: true });
  }
  return out;
}

export function defaultPacks(): Pack[] {
  return packsFile.packs.map((p) => ({ id: p.id, name: p.name, kind: p.kind as Pack['kind'], lessons: p.lessons, validityDays: p.validityDays, priceCents: p.priceCents, typeIds: [...p.typeIds], weeklyLimit: p.weeklyLimit, active: p.active }));
}

export function emptyData(): Data {
  return { settings: defaultSettings(), types: defaultTypes(), members: [], templates: defaultTemplates(), sessions: [], packs: defaultPacks(), passes: [], bookings: [], notices: [], leads: [], payments: [] };
}

const PEOPLE: [string, string, string][] = [
  ['m_martina', 'Martina Rinaldi', '333 000 01 01'],
  ['m_luca', 'Luca Fontana', '333 000 01 02'],
  ['m_sara', 'Sara Bellini', '333 000 01 03'],
  ['m_andrea', 'Andrea Conti', '333 000 01 04'],
  ['m_chiara', 'Chiara De Santis', '333 000 01 05'],
  ['m_marco', 'Marco Ferri', '333 000 01 06'],
  ['m_elisa', 'Elisa Marchetti', '333 000 01 07'],
  ['m_federico', 'Federico Galli', '333 000 01 08'],
  ['m_giorgia', 'Giorgia Serra', '333 000 01 09'],
  ['m_matteo', 'Matteo Villa', '333 000 01 10'],
  ['m_valentina', 'Valentina Moretti', '333 000 01 11'],
  ['m_simone', 'Simone Lombardi', '333 000 01 12'],
  ['m_alessia', 'Alessia Barbieri', '333 000 01 13'],
  ['m_stefano', 'Stefano Pellegrini', '333 000 01 14'],
  ['m_ilaria', 'Ilaria Fabbri', '333 000 01 15'],
  ['m_nicolo', 'Nicolò Rizzo', '333 000 01 16'],
  ['m_beatrice', 'Beatrice Caputo', '333 000 01 17'],
  ['m_gabriele', 'Gabriele Monti', '333 000 01 18'],
  ['m_francesca', 'Francesca Giordano', '333 000 01 19'],
  ['m_tommaso', 'Tommaso Gatti', '333 000 01 20'],
  ['m_camilla', 'Camilla Silvestri', '333 000 01 21'],
  ['m_edoardo', 'Edoardo Parisi', '333 000 01 22'],
  ['m_noemi', 'Noemi Bianco', '333 000 01 23'],
  ['m_pietro', 'Pietro Cattaneo', '333 000 01 24'],
];

export function demoData(now: Date): Data {
  const rand = rng(20261014);
  const today = romeDay(now);
  const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * 24 * HOUR).toISOString();
  let d = emptyData();

  const members: Member[] = [
    { id: DEMO_OWNER_ID, name: 'Valerio Cuscianna', email: 'valerio@kukolab.demo', phone: '', role: 'owner', notes: '', createdAt: iso(120) },
    ...PEOPLE.map(([id, name, phone], i): Member => ({
      id, name, phone, role: 'client', email: `${name.toLowerCase().replace(/[^a-z ]/g, '').replace(/ /g, '.')}@example.com`,
      notes: i === 2 ? 'Preferisce le lezioni del mattino.' : i === 7 ? 'Fastidio alla spalla destra: evitare carichi sopra la testa.' : '', createdAt: iso(100 - i * 6),
    })),
  ];
  d.members = members;
  const clients0 = members.filter((m) => m.role === 'client').map((m) => m.id);

  const mk = (memberId: string, packId: string, startOffset: number, extra: Partial<Pass> = {}): Pass => {
    const pk = d.packs.find((p) => p.id === packId)!;
    const startsOn = addDays(today, startOffset);
    return {
      id: newId('p'), memberId, packId, name: pk.name, kind: pk.kind,
      creditsTotal: pk.kind === 'pack' ? pk.lessons : null, creditsLeft: pk.kind === 'pack' ? pk.lessons : null,
      startsOn, expiresOn: addDays(startsOn, pk.validityDays - 1), typeIds: [...pk.typeIds], weeklyLimit: pk.weeklyLimit, note: '', createdAt: new Date(`${startsOn}T09:00:00Z`).toISOString(), ...extra,
    };
  };
  const current: Pass[] = [
    mk('m_martina', 'pk_fun10', -25), mk('m_martina', 'pk_mpil', -10),
    mk('m_luca', 'pk_fun10', -40), mk('m_luca', 'pk_single', -5),
    mk('m_sara', 'pk_mpil', -27), // scade tra pochi giorni
    mk('m_andrea', 'pk_mfun', -20),
    mk('m_chiara', 'pk_open', -12),
    mk('m_marco', 'pk_fun10', -60, { creditsLeft: 2 }), // quasi finito
    mk('m_elisa', 'pk_pil8', -30), mk('m_elisa', 'pk_mfun', -3),
    mk('m_federico', 'pk_pt5', -35), mk('m_chiara', 'pk_pt5', -26), mk('m_valentina', 'pk_pt5', -30), mk('m_ilaria', 'pk_pt5', -22), mk('m_gabriele', 'pk_pt5', -33),
    mk('m_giorgia', 'pk_mpil', -15),
    mk('m_matteo', 'pk_mfun', -45), // scaduto
    mk('m_valentina', 'pk_open', -5),
    mk('m_simone', 'pk_pil8', -20),
    mk('m_alessia', 'pk_mpil', -8),
    // Stefano: nessun abbonamento
    mk('m_ilaria', 'pk_open', -18), mk('m_nicolo', 'pk_mfun', -9), mk('m_beatrice', 'pk_open', -22),
    mk('m_gabriele', 'pk_fun10', -14), mk('m_francesca', 'pk_mpil', -6), mk('m_tommaso', 'pk_mfun', -26),
    mk('m_camilla', 'pk_open', -2), mk('m_edoardo', 'pk_mfun', -13), mk('m_noemi', 'pk_pil8', -16), mk('m_pietro', 'pk_open', -28),
  ];
  // storico: un vecchio abbonamento a tempo che copre il periodo prima di quello attuale (serve ai grafici delle settimane passate)
  const history: Pass[] = clients0.filter((id) => id !== 'm_stefano').map((id) => {
    const firstStart = current.filter((p) => p.memberId === id).reduce((m, p) => (p.startsOn < m ? p.startsOn : m), addDays(today, 1));
    return mk(id, 'pk_open', -70, { name: 'Mensile Open (precedente)', packId: 'pk_open', weeklyLimit: 3, expiresOn: addDays(firstStart, -1) });
  }).filter((p) => p.expiresOn >= p.startsOn);
  d.passes = [...history, ...current];

  // lezioni: da sei settimane fa fino a tre settimane avanti
  const gen = generateSessions(d, { from: addDays(today, -42), to: addDays(today, 21) });
  d = gen.data;
  const sessions = [...d.sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const clients = members.filter((m) => m.role === 'client').map((m) => m.id);

  // simulazione cronologica: ognuno prenota 36 ore prima, qualcuno annulla
  for (const s of sessions) {
    const start = new Date(s.startsAt).getTime();
    const isPast = start < now.getTime();
    const tries = s.capacity === 1 ? (rand() < 0.45 ? 1 : 0) : Math.round(s.capacity * (isPast ? 0.4 + rand() * 0.55 : 0.15 + rand() * 0.55));
    const pool = [...clients].sort(() => rand() - 0.5);
    let made = 0;
    for (const id of pool) {
      if (made >= tries) break;
      const cand = pickPass(d, id, s);
      if (cand?.kind === 'pack' && (cand.creditsLeft ?? 0) <= (cand.typeIds.includes('pt') ? 1 : id === DEMO_CLIENT_ID ? 7 : 4)) continue; // lascia sempre qualche lezione
      const r = book(d, { memberId: id, sessionId: s.id, now: new Date(start - 36 * HOUR), actor: { role: 'owner', memberId: DEMO_OWNER_ID } });
      if (!r.ok) continue;
      d = r.data;
      made += 1;
      if (rand() < 0.08) {
        const c = cancelBooking(d, { bookingId: r.booking.id, now: new Date(start - 20 * HOUR), actor: { role: 'owner', memberId: DEMO_OWNER_ID } });
        if (c.ok) d = c.data;
      }
    }
    if (isPast) {
      for (const b of d.bookings) if (b.sessionId === s.id && b.status === 'booked') b.status = rand() < 0.88 ? 'attended' : 'no_show';
    }
  }


  // una lezione di Pilates piena con lista d'attesa (la prima con 4 posti dopo domattina)
  const owner = { role: 'owner' as const, memberId: DEMO_OWNER_ID };
  const full = sessions.find((s) => s.typeId === 'pilates' && s.capacity === 4 && new Date(s.startsAt).getTime() > now.getTime() + 20 * HOUR);
  if (full) {
    for (const b of d.bookings.filter((x) => x.sessionId === full.id && x.status === 'booked')) {
      const c = cancelBooking(d, { bookingId: b.id, now, actor: owner });
      if (c.ok) d = c.data;
    }
    const t0 = new Date(full.startsAt).getTime() - 48 * HOUR;
    const order = [...clients.filter((id) => id !== DEMO_CLIENT_ID), DEMO_CLIENT_ID]; // la cliente demo arriva per ultima: resta in lista d'attesa
    let seated = 0, waiting = 0, n = 0;
    for (const id of order) {
      if (id === DEMO_CLIENT_ID ? seated < 4 : seated >= 4 && waiting >= 1) continue;
      const r = book(d, { memberId: id, sessionId: full.id, now: new Date(t0 + n++ * 60000), actor: owner });
      if (!r.ok) continue;
      d = r.data;
      if (r.booking.status === 'booked') seated += 1; else waiting += 1;
    }
  }

  // la cliente demo ha già qualche lezione in programma
  const next = (typeId: string, k: number) => sessions.filter((s) => s.typeId === typeId && new Date(s.startsAt).getTime() > now.getTime() + 14 * HOUR)[k];
  for (const s of [next('functional', 1), next('functional', 4), next('pilates', 3)]) {
    if (!s) continue;
    const r = book(d, { memberId: DEMO_CLIENT_ID, sessionId: s.id, now: new Date(new Date(s.startsAt).getTime() - 40 * HOUR), actor: owner });
    if (r.ok) d = r.data;
  }

  // richieste arrivate dal sito (esempi)
  const lead = (o: Pick<Lead, 'kind' | 'topic' | 'name' | 'phone' | 'email' | 'slots' | 'note' | 'status'> & { hoursAgo: number; ownerNote?: string }): Lead => ({
    id: newId('l'), kind: o.kind, topic: o.topic, name: o.name, phone: o.phone, email: o.email, slots: o.slots, note: o.note, status: o.status, ownerNote: o.ownerNote ?? '', source: 'sito',
    createdAt: new Date(now.getTime() - o.hoursAgo * HOUR).toISOString(), updatedAt: o.status === 'new' ? null : new Date(now.getTime() - (o.hoursAgo - 2) * HOUR).toISOString(),
  });
  d.leads = [
    lead({ kind: 'nutrition', topic: 'nutrition', name: 'Giulia Romano', phone: '333 000 02 01', email: 'giulia.romano@example.com', slots: ['pomeriggio'], note: 'Vorrei un piano per sostenere gli allenamenti.', status: 'new', hoursAgo: 3 }),
    lead({ kind: 'trial', topic: 'functional', name: 'Davide Colombo', phone: '333 000 02 02', email: '', slots: ['sera', 'sabato'], note: '', status: 'new', hoursAgo: 20 }),
    lead({ kind: 'trial', topic: 'pilates', name: 'Marta Neri', phone: '333 000 02 03', email: 'marta.neri@example.com', slots: ['mattina'], note: 'Mi interessa soprattutto la postura.', status: 'contacted', hoursAgo: 50, ownerNote: 'Chiamata: preferisce il mercoledì mattina.' }),
    lead({ kind: 'trial', topic: 'pt', name: 'Paolo Greco', phone: '333 000 02 04', email: '', slots: ['pranzo'], note: 'Obiettivo: tornare in forma prima dell’estate.', status: 'scheduled', hoursAgo: 96, ownerNote: 'Prova fissata con Valerio.' }),
  ];

  d.notices.push({ id: newId('n'), memberId: DEMO_CLIENT_ID, kind: 'info', text: 'Benvenuta in KUKO LAB! Qui trovi i corsi, i posti liberi e il tuo abbonamento.', createdAt: iso(1), read: true });
  return demoTeam(d, now);
}

/**
 * Aggiunge ai dati demo la Segreteria, un Trainer (Sofia, che tiene il Pilates) e gli incassi degli abbonamenti già venduti.
 * Si può chiamare più volte: non duplica nulla. Serve anche ai dati demo salvati prima che esistessero questi ruoli.
 */
export function demoTeam(d0: Data, now: Date): Data {
  const d = structuredClone(d0);
  d.payments ??= [];
  const at = new Date(now.getTime() - 100 * 24 * HOUR).toISOString();
  if (!d.members.some((m) => m.id === DEMO_STAFF_ID)) d.members.push({ id: DEMO_STAFF_ID, name: 'Segreteria', email: 'segreteria@kukolab.demo', phone: '', role: 'staff', notes: '', createdAt: at });
  if (!d.members.some((m) => m.id === DEMO_TRAINER_ID)) d.members.push({ id: DEMO_TRAINER_ID, name: 'Sofia Greco', email: 'sofia@kukolab.demo', phone: '', role: 'trainer', notes: '', createdAt: at });
  // Sofia tiene le lezioni di Pilates che prima erano di "Team KUKO"
  for (const t of d.templates) if (t.typeId === 'pilates' && t.trainer === 'Team KUKO') t.trainer = 'Sofia';
  for (const s of d.sessions) if (s.typeId === 'pilates' && s.trainer === 'Team KUKO') s.trainer = 'Sofia';
  if (d.payments.length === 0) d.payments = demoPayments(d, now);
  return d;
}

function demoPayments(d: Data, now: Date): Payment[] {
  const rand = rng(77123);
  const out: Payment[] = [];
  const price = new Map(d.packs.map((p) => [p.id, p.priceCents]));
  for (const p of d.passes) {
    if (d.members.find((m) => m.id === p.memberId)?.role !== 'client') continue;
    const r = rand();
    const method: PayMethod = r < 0.35 ? 'cash' : r < 0.8 ? 'card' : 'transfer';
    const free = p.memberId === 'm_chiara' && p.packId === 'pk_pt5'; // un omaggio
    out.push({
      id: newId('y'), memberId: p.memberId, passId: p.id, amountCents: free ? 0 : p.packId ? price.get(p.packId) ?? 0 : 12900, method: free ? 'other' : method,
      note: `Vendita: ${p.name}`, paidAt: p.createdAt, byName: rand() < 0.8 ? 'Segreteria' : 'Valerio Cuscianna', voidedAt: null,
    });
  }
  const mins = (n: number) => new Date(now.getTime() - n * 60000).toISOString();
  out.push(
    { id: newId('y'), memberId: 'm_stefano', passId: null, amountCents: 1500, method: 'cash', note: 'Lezione singola', paidAt: mins(35), byName: 'Segreteria', voidedAt: null },
    { id: newId('y'), memberId: 'm_noemi', passId: null, amountCents: 2500, method: 'card', note: 'Quota iscrizione', paidAt: mins(12), byName: 'Segreteria', voidedAt: null },
    { id: newId('y'), memberId: 'm_pietro', passId: null, amountCents: 1500, method: 'cash', note: 'Registrato due volte', paidAt: new Date(now.getTime() - 3 * 24 * HOUR).toISOString(), byName: 'Segreteria', voidedAt: new Date(now.getTime() - 3 * 24 * HOUR + 600000).toISOString() },
  );
  return out;
}

export type { Booking };
