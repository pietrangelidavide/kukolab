import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Api } from './lib/api';
import type { Data, Member, Result } from './lib/types';
import { ERR_TEXT } from './lib/types';
import { useRoute } from './router';

export interface Toast { id: number; text: string; kind: 'ok' | 'error' | 'info' }
export interface AskOpts { title: string; text?: string; confirm: string; cancel?: string; danger?: boolean }

export interface Store {
  api: Api;
  ready: boolean;
  me: Member | null;
  data: Data | null;
  now: Date;
  route: ReturnType<typeof useRoute>;
  setSession(me: Member | null, data: Data | null): void;
  /** Esegue un'azione dell'api, aggiorna i dati e mostra l'errore se c'è. */
  run<T extends object>(p: Promise<Result<{ data: Data } & T>>, okText?: string | ((r: { data: Data } & T) => string | null)): Promise<Result<{ data: Data } & T>>;
  toast(text: string, kind?: Toast['kind']): void;
  ask(o: AskOpts): Promise<boolean>;
  toasts: Toast[];
  asking: (AskOpts & { resolve: (v: boolean) => void }) | null;
  answer(v: boolean): void;
  logout(): Promise<void>;
}

const Ctx = createContext<Store | null>(null);
export const useStore = (): Store => {
  const s = useContext(Ctx);
  if (!s) throw new Error('Store mancante');
  return s;
};

export function StoreProvider({ api, children }: { api: Api; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [asking, setAsking] = useState<Store['asking']>(null);
  const route = useRoute();
  const seq = useRef(0);

  useEffect(() => {
    let live = true;
    api.init().then((s) => {
      if (!live) return;
      if (s) { setMeId(s.me.id); setData(s.data); }
      setReady(true);
    }).catch(() => live && setReady(true));
    return () => { live = false; };
  }, [api]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // al ritorno sull'app (telefono) ricarica i dati
  useEffect(() => {
    if (!meId) return;
    const on = () => {
      if (document.visibilityState !== 'visible') return;
      setNow(new Date());
      api.refresh().then((r) => { if (r.ok) setData(r.data); });
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [api, meId]);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 5200 : 3200);
  }, []);

  const run: Store['run'] = useCallback(async (p, okText) => {
    let r;
    try { r = await p; } catch { r = { ok: false as const, error: 'network' as const }; }
    if (r.ok) {
      setData(r.data);
      setNow(new Date());
      const msg = typeof okText === 'function' ? okText(r) : okText;
      if (msg) toast(msg, 'ok');
    } else {
      toast(r.message ?? ERR_TEXT[r.error], 'error');
    }
    return r;
  }, [toast]);

  const ask = useCallback((o: AskOpts) => new Promise<boolean>((resolve) => setAsking({ ...o, resolve })), []);

  const me = useMemo(() => data?.members.find((m) => m.id === meId) ?? null, [data, meId]);

  const store: Store = {
    api, ready, me, data, now, route, toasts, asking, toast, run, ask,
    answer: (v) => { setAsking((a) => { a?.resolve(v); return null; }); },
    setSession: (m, d) => { setMeId(m?.id ?? null); setData(d); },
    logout: async () => { await api.signOut(); setMeId(null); setData(null); route.go('/'); },
  };
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
