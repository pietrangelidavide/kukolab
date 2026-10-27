import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useStore } from '../store';
import { Btn, Field } from '../ui';
import { logoSrc } from '../App';
import { ERR_TEXT } from '../lib/types';
import type { Role } from '../lib/types';
import { homePath } from '../lib/access';
import { siteHref } from '../config';

/** Accesso. Con l'archivio online si entra solo con un codice mandato per email, e solo se lo studio ha già iscritto quell'email.
 *  Nella demo (dati nel browser) restano i pulsanti di prova e un profilo di prova. */
export function Auth() {
  const s = useStore();
  const demo = s.api.mode === 'demo';
  return (
    <div className="auth grain">
      <div className="auth-card">
        <img className="auth-logo" src={logoSrc()} alt="KUKO LAB" width="110" height="110" />
        <h1>Prenota il tuo posto</h1>
        <p className="sub">{demo ? 'Corsi, posti liberi e abbonamento in un’unica app.' : 'Riservato a chi è iscritto a KUKO LAB.'}</p>
        {demo ? <DemoAccess /> : <CodeAccess />}
        {siteHref() && <a className="back" href={siteHref()} target={siteHref() === '/' ? undefined : '_blank'} rel="noopener">← Torna al sito</a>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ archivio online: email → codice
const WAIT = 45; // secondi prima di poter chiedere un altro codice

function CodeAccess() {
  const s = useStore();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const send = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await s.api.requestCode!(email);
      if (r.ok) { setStep('code'); setCode(''); setWait(WAIT); } else setErr(r.message ?? ERR_TEXT[r.error]);
    } catch { setErr(ERR_TEXT.network); }
    setBusy(false);
  };

  const enter = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await s.api.verifyCode!(email, code);
      if (r.ok) { s.setSession(r.me, r.data); s.route.go(homePath(r.me.role)); } else setErr(r.message ?? ERR_TEXT[r.error]);
    } catch { setErr(ERR_TEXT.network); }
    setBusy(false);
  };

  const submit = (e: FormEvent) => { e.preventDefault(); if (step === 'email') send(); else enter(); };
  const site = siteHref();

  return (
    <form className="form" onSubmit={submit}>
      {step === 'email' ? (
        <>
          <Field label="Email" hint="La stessa che hai dato allo studio quando ti sei iscritto."><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required /></Field>
          {err && <p className="form-err" role="alert">{err}</p>}
          <Btn type="submit" block disabled={busy || !email.trim()}>Inviami il codice</Btn>
        </>
      ) : (
        <>
          <p className="form-ok" role="status">Se <b>{email.trim()}</b> è tra le email degli iscritti, ti abbiamo mandato un codice. Scrivilo qui sotto.</p>
          <Field label="Codice" hint="Controlla anche la cartella dello spam. Il codice vale poco tempo."><input value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, ''))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,12}" maxLength={12} required autoFocus /></Field>
          {err && <p className="form-err" role="alert">{err}</p>}
          <Btn type="submit" block disabled={busy || code.replace(/\s/g, '').length < 6}>Entra</Btn>
          <div className="code-links">
            <button type="button" className="link" onClick={send} disabled={busy || wait > 0}>{wait > 0 ? `Rimanda il codice (${wait})` : 'Rimanda il codice'}</button>
            <button type="button" className="link" onClick={() => { setStep('email'); setErr(null); setCode(''); }}>Cambia email</button>
          </div>
          <p className="muted small">Non arriva niente? Controlla di aver scritto la stessa email che hai dato allo studio, oppure chiedi a chi ti ha iscritto.</p>
        </>
      )}
      <p className="muted small not-yet">Non sei ancora iscritto? L&#8217;iscrizione si fa in studio.{site && <> Se è la tua prima volta, <a href={`${site.replace(/#.*$/, '')}#prova`} target={site === '/' ? undefined : '_blank'} rel="noopener">prenota la prova gratuita</a>.</>}</p>
    </form>
  );
}

// ------------------------------------------------------------------ demo: pulsanti di prova e profilo di prova
function DemoAccess() {
  const s = useStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await s.api.signUp({ name, email, phone, password: '' });
      if (!r.ok) setErr(r.message ?? ERR_TEXT[r.error]);
      else if (r.me && r.data) { s.setSession(r.me, r.data); s.route.go('/corsi'); }
    } catch { setErr(ERR_TEXT.network); }
    setBusy(false);
  };

  const quick = async (role: Role) => {
    const r = await s.api.demoLogin!(role);
    if (r.ok) { s.setSession(r.me, r.data); s.route.go(homePath(role)); }
  };

  return (
    <>
      <div className="demo-box">
        <b>Prova la demo</b>
        <p>Dati di esempio, salvati solo su questo dispositivo.</p>
        <div className="row">
          <Btn size="sm" onClick={() => quick('client')}>Entra come cliente</Btn>
          <Btn size="sm" kind="ghost" onClick={() => quick('owner')}>Entra come owner</Btn>
          <Btn size="sm" kind="ghost" onClick={() => quick('staff')}>Entra come Segreteria</Btn>
          <Btn size="sm" kind="ghost" onClick={() => quick('trainer')}>Entra come Trainer</Btn>
        </div>
      </div>
      <p className="or"><span>oppure crea un profilo di prova</span></p>
      <form className="form" onSubmit={submit}>
        <Field label="Nome e cognome"><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></Field>
        <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required inputMode="email" /></Field>
        <Field label="Telefono" hint="Facoltativo: ci serve solo per avvisarti se una lezione cambia."><input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" /></Field>
        {err && <p className="form-err" role="alert">{err}</p>}
        <Btn type="submit" block disabled={busy}>Crea profilo</Btn>
      </form>
    </>
  );
}
