import { useState } from 'react';
import type { FormEvent } from 'react';
import { useStore } from '../store';
import { Btn, Field, Seg } from '../ui';
import { logoSrc } from '../App';
import { ERR_TEXT } from '../lib/types';
import { siteHref } from '../config';

export function Auth() {
  const s = useStore();
  const demo = s.api.mode === 'demo';
  const [mode, setMode] = useState<'in' | 'up'>(demo ? 'up' : 'in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null); setMsg(null);
    try {
      if (mode === 'in') {
        const r = await s.api.signIn(email, pw);
        if (r.ok) { s.setSession(r.me, r.data); s.route.go(r.me.role === 'owner' ? '/oggi' : '/corsi'); } else setErr(r.message ?? ERR_TEXT[r.error]);
      } else {
        const r = await s.api.signUp({ name, email, phone, password: pw });
        if (!r.ok) setErr(r.message ?? ERR_TEXT[r.error]);
        else if (r.needsConfirm) { setMsg('Ti abbiamo scritto: apri il link nella mail per confermare il profilo, poi accedi.'); setMode('in'); }
        else if (r.me && r.data) { s.setSession(r.me, r.data); s.route.go('/corsi'); }
      }
    } catch { setErr(ERR_TEXT.network); }
    setBusy(false);
  };

  const quick = async (role: 'client' | 'owner') => {
    const r = await s.api.demoLogin!(role);
    if (r.ok) { s.setSession(r.me, r.data); s.route.go(role === 'owner' ? '/oggi' : '/corsi'); }
  };

  const forgot = async () => {
    if (!email.trim()) { setErr('Scrivi la tua email, poi tocca di nuovo.'); return; }
    const r = await s.api.resetPassword?.(email.trim());
    if (r?.ok) { setErr(null); setMsg('Se l’email è registrata, ti abbiamo mandato il link per scegliere una nuova password.'); }
    else setErr(ERR_TEXT.network);
  };

  return (
    <div className="auth grain">
      <div className="auth-card">
        <img className="auth-logo" src={logoSrc()} alt="KUKO LAB" width="110" height="110" />
        <h1>Prenota il tuo posto</h1>
        <p className="sub">Corsi, posti liberi e abbonamento in un&#8217;unica app.</p>
        {demo && (
          <div className="demo-box">
            <b>Prova la demo</b>
            <p>Dati di esempio, salvati solo su questo dispositivo.</p>
            <div className="row">
              <Btn size="sm" onClick={() => quick('client')}>Entra come cliente</Btn>
              <Btn size="sm" kind="ghost" onClick={() => quick('owner')}>Entra come owner</Btn>
            </div>
          </div>
        )}
        {demo ? <p className="or"><span>oppure crea un profilo di prova</span></p> : <Seg label="Accesso" value={mode} onChange={(v) => { setMode(v); setErr(null); setMsg(null); }} options={[{ v: 'in', t: 'Accedi' }, { v: 'up', t: 'Crea profilo' }]} />}
        <form className="form" onSubmit={submit}>
          {mode === 'up' && <Field label="Nome e cognome"><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></Field>}
          <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required inputMode="email" /></Field>
          {mode === 'up' && <Field label="Telefono" hint="Facoltativo: ci serve solo per avvisarti se una lezione cambia."><input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" /></Field>}
          {!demo && <Field label="Password" hint={mode === 'up' ? 'Almeno 8 caratteri.' : undefined}><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={mode === 'up' ? 8 : undefined} required /></Field>}
          {err && <p className="form-err" role="alert">{err}</p>}
          {msg && <p className="form-ok" role="status">{msg}</p>}
          <Btn type="submit" block disabled={busy}>{mode === 'in' ? 'Accedi' : 'Crea profilo'}</Btn>
          {!demo && mode === 'in' && <button type="button" className="link" onClick={forgot}>Password dimenticata?</button>}
        </form>
        {siteHref() && <a className="back" href={siteHref()} target={siteHref() === '/' ? undefined : '_blank'} rel="noopener">← Torna al sito</a>}
      </div>
    </div>
  );
}
