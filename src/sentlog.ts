// Ricorda quali messaggi WhatsApp sono già stati mandati (o scartati) dallo studio, su questo dispositivo.
// Le chiavi arrivano da lib/messages.ts: lo stesso evento ha sempre la stessa chiave. Dopo 60 giorni si dimenticano.
import { useSyncExternalStore } from 'react';

const KEY = 'kuko.messaggi.v1';
const KEEP_MS = 60 * 24 * 3600 * 1000;

export type SentLog = Readonly<Record<string, number>>;

let cache: SentLog | null = null;
const subs = new Set<() => void>();

function load(): SentLog {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    const o = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const out: Record<string, number> = {};
    const min = Date.now() - KEEP_MS;
    for (const [k, v] of Object.entries(o)) if (typeof v === 'number' && v >= min) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

function snapshot(): SentLog {
  if (!cache) cache = load();
  return cache;
}

function commit(next: SentLog) {
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* la memoria del browser può non essere disponibile: resta valida finché la pagina è aperta */ }
  subs.forEach((f) => f());
}

export function markSent(key: string, at = Date.now()) {
  commit({ ...snapshot(), [key]: at });
}

export function unmarkSent(key: string) {
  const { [key]: _gone, ...rest } = snapshot() as Record<string, number>;
  commit(rest);
}

export function useSentLog(): SentLog {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f); },
    snapshot,
    snapshot,
  );
}
