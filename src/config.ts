// Dati dello studio usati dall'app (cambiare qui).
export const STUDIO = {
  name: 'KUKO LAB',
  // Numero WhatsApp dello studio, formato internazionale senza "+": da confermare con il cliente.
  whatsapp: '393920948122',
  address: 'Via del Pianeta Urano 44, EUR',
};

import type { Role } from './lib/types';

type Assets = { site?: string; app?: string; staff?: string; home?: string; mode?: Entry };
const assets = (): Assets => (window as unknown as { KUKO_ASSETS?: Assets }).KUKO_ASSETS ?? {};

/** Gli ingressi della web app. Stessa app e stessi dati, due porte: l'app dei clienti (/app/) e il gestionale dello staff (/gestionale/).
 *  La pagina d'ingresso dice quale è aperta (`window.KUKO_ASSETS.mode`, scritto da scripts/lib/app.mjs); senza, è l'app dei clienti. */
export type Entry = 'client' | 'staff';
export const entry = (): Entry => assets().mode ?? 'client';
/** Da quale ingresso entra ciascun ruolo: i clienti dall'app, owner, Segreteria e Trainer dal gestionale. */
export const entryOf = (role: Role): Entry => (role === 'client' ? 'client' : 'staff');

/** Indirizzi per i collegamenti tra le pagine. Nelle anteprime pubblicate a parte possono essere cambiati o tolti (stringa vuota: il link sparisce). */
export const siteHref = (): string => assets().site ?? '/sito';
export const appHref = (): string => assets().app ?? '/app/';
export const staffHref = (): string => assets().staff ?? '/gestionale/';
export const homeHref = (): string => assets().home ?? '/';
/** L'indirizzo della porta giusta per un ruolo (vuoto nelle anteprime senza collegamenti). */
export const doorFor = (role: Role): string => (entryOf(role) === 'client' ? appHref() : staffHref());
