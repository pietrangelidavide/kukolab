// Date e orari di Roma, senza librerie. "giorno" = 'YYYY-MM-DD' in ora di Roma; "ora" = 'HH:MM'.
export const TZ = 'Europe/Rome';

const dtf = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export interface Parts { y: number; m: number; d: number; hh: number; mm: number; ss: number }

export function romeParts(date: Date): Parts {
  const o: Record<string, number> = {};
  for (const p of dtf.formatToParts(date)) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return { y: o.year, m: o.month, d: o.day, hh: o.hour, mm: o.minute, ss: o.second };
}

const p2 = (n: number) => String(n).padStart(2, '0');

export function romeDay(date: Date): string {
  const p = romeParts(date);
  return `${p.y}-${p2(p.m)}-${p2(p.d)}`;
}

export function romeHM(date: Date): string {
  const p = romeParts(date);
  return `${p2(p.hh)}:${p2(p.mm)}`;
}

function offsetMs(utcMs: number): number {
  const p = romeParts(new Date(utcMs));
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(utcMs / 1000) * 1000;
}

/** Ora di parete a Roma → istante reale (gestisce ora legale). */
export function romeWall(day: string, hm: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = hm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - offsetMs(guess);
  t = guess - offsetMs(t);
  return new Date(t);
}

function utcOfDay(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(day: string, n: number): string {
  const t = new Date(utcOfDay(day) + n * 86400000);
  return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`;
}

export function diffDays(a: string, b: string): number {
  return Math.round((utcOfDay(b) - utcOfDay(a)) / 86400000);
}

/** 1 = lunedì … 7 = domenica */
export function weekdayOf(day: string): number {
  const w = new Date(utcOfDay(day)).getUTCDay();
  return w === 0 ? 7 : w;
}

export function mondayOf(day: string): string {
  return addDays(day, 1 - weekdayOf(day));
}

export function* eachDay(from: string, to: string): Generator<string> {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}

export const MIN = 60000;
export const HOUR = 3600000;
export const startOf = (iso: string) => new Date(iso).getTime();
export const endOf = (iso: string, durationMin: number) => new Date(iso).getTime() + durationMin * MIN;

const itWhen = new Intl.DateTimeFormat('it-IT', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** "mercoledì 14 ottobre alle 18:30" */
export function whenIt(iso: string): string {
  const parts = itWhen.formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${g('weekday')} ${g('day')} ${g('month')} alle ${g('hour')}:${g('minute')}`;
}
