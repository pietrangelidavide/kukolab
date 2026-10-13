import { createRoot } from 'react-dom/client';
import { StoreProvider } from './store';
import { App } from './App';
import { LocalApi } from './lib/local';
import './styles.css';

declare const __KUKO_SUPABASE_URL__: string;
declare const __KUKO_SUPABASE_KEY__: string;

async function start() {
  let api;
  if (typeof __KUKO_SUPABASE_URL__ === 'string' && __KUKO_SUPABASE_URL__ && __KUKO_SUPABASE_KEY__) {
    const { RemoteApi } = await import('./lib/remote');
    api = new RemoteApi(__KUKO_SUPABASE_URL__, __KUKO_SUPABASE_KEY__);
  } else {
    api = new LocalApi();
  }
  createRoot(document.getElementById('root')!).render(<StoreProvider api={api}><App /></StoreProvider>);
}
void start();
