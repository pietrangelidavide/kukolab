import { TZ, romeHM, weekdayOf } from './time';

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const GIORNI = ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
const GIORNI3 = ['', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

export const timeOf = (iso: string) => romeHM(new Date(iso));
export const dayName = (day: string) => GIORNI[weekdayOf(day)];
export const dayShort = (day: string) => GIORNI3[weekdayOf(day)];
export const dayNum = (day: string) => String(Number(day.slice(8)));
export const monthName = (day: string) => MESI[Number(day.slice(5, 7)) - 1];
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "mercoledì 14 ottobre" */
export const dayLong = (day: string) => `${dayName(day)} ${dayNum(day)} ${monthName(day)}`;
/** "14/10" */
export const dayDM = (day: string) => `${day.slice(8)}/${day.slice(5, 7)}`;
/** "14/10/2026" */
export const dayDMY = (day: string) => `${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

export const euro = (cents: number) => (cents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: cents % 100 ? 2 : 0 });

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export { TZ };

/** Numero per wa.me (solo cifre, con prefisso 39 se manca). */
export function waNumber(phone: string): string | null {
  let n = phone.replace(/[^\d+]/g, '');
  if (n.startsWith('+')) n = n.slice(1);
  else if (n.startsWith('00')) n = n.slice(2);
  else if (!n.startsWith('39') || n.length < 11) n = '39' + n;
  return /^\d{9,15}$/.test(n) ? n : null;
}
export const waLink = (phone: string, text: string) => {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
};
