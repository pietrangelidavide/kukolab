// Dati dello studio usati dall'app (cambiare qui).
export const STUDIO = {
  name: 'KUKO LAB',
  // Numero WhatsApp dello studio, formato internazionale senza "+": da confermare con il cliente.
  whatsapp: '393920948122',
  address: 'Via del Pianeta Urano 44, EUR',
};

/** Indirizzo della vetrina per il link "Torna al sito". Nelle anteprime pubblicate a parte può essere cambiato o tolto (stringa vuota). */
export const siteHref = (): string => (window as unknown as { KUKO_ASSETS?: { site?: string } }).KUKO_ASSETS?.site ?? '/';
