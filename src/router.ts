import { useCallback, useEffect, useState } from 'react';

const read = (): string => {
  try { return location.hash.replace(/^#/, '') || '/'; } catch { return '/'; }
};

/** Percorso corrente (hash) e funzione per cambiarlo. Funziona anche se l'hash non è scrivibile (anteprime incorporate). */
export function useRoute(): { path: string; parts: string[]; go: (p: string) => void } {
  const [path, setPath] = useState<string>(read);
  useEffect(() => {
    const on = () => setPath(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((p: string) => {
    setPath(p);
    try { if (location.hash !== '#' + p) location.hash = p; } catch { /* nulla */ }
    try { window.scrollTo({ top: 0 }); } catch { /* nulla */ }
  }, []);
  return { path, parts: path.split('/').filter(Boolean), go };
}
