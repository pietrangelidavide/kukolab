let n = 0;
/** Id breve e unico (basta per i dati locali; nel database remoto li genera Postgres). */
export function newId(prefix: string): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const r = c?.randomUUID ? c.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  n += 1;
  return `${prefix}_${r}${n.toString(36)}`;
}
