import { useState } from 'react';
import { useStore } from '../store';
import { Badge, Btn, Empty, Field, Icon, Sheet, Toggle } from '../ui';
import { PageHead, PasswordForm, typeNames } from './common';
import { euro, plural } from '../lib/format';
import type { Pack, Settings } from '../lib/types';

// ------------------------------------------------------------------ Pacchetti
export function Packs() {
  const s = useStore();
  const d = s.data!;
  const [edit, setEdit] = useState<Pack | 'new' | null>(null);
  const sold = (id: string) => d.passes.filter((p) => p.packId === id).length;
  const list = [...d.packs].sort((a, b) => Number(b.active) - Number(a.active) || a.priceCents - b.priceCents);

  const setActive = (p: Pack, on: boolean) => s.run(s.api.savePack({ ...p, active: on }), on ? 'Pacchetto in vendita.' : 'Pacchetto tolto dalla vendita: chi lo ha già lo conserva.');

  return (
    <>
      <PageHead title="Pacchetti" sub="Quello che vendi in studio. Il prezzo è solo un promemoria: i pagamenti si registrano fuori dall’app." right={<Btn size="sm" onClick={() => setEdit('new')}><Icon n="plus" size={16} /> Nuovo pacchetto</Btn>} />
      {list.length === 0 ? <Empty icon="ticket" title="Nessun pacchetto" text="Crea il primo pacchetto: poi potrai assegnarlo agli iscritti." /> : (
        <ul className="packs">
          {list.map((p) => (
            <li key={p.id} className={p.active ? '' : 'off'}>
              <div className="who">
                <b>{p.name}</b>
                <small>{p.kind === 'pack' ? `${p.lessons} ${plural(p.lessons ?? 0, 'lezione', 'lezioni')}` : p.weeklyLimit ? `Mensile, fino a ${p.weeklyLimit} a settimana` : 'Mensile, lezioni illimitate'} · {p.validityDays} giorni · {typeNames(d, p.typeIds)}</small>
                <small>{sold(p.id)} {plural(sold(p.id), 'venduto', 'venduti')}</small>
              </div>
              <b className="price">{euro(p.priceCents)}</b>
              {!p.active && <Badge tone="mute">Non in vendita</Badge>}
              <Toggle on={p.active} onChange={(v) => setActive(p, v)} label={`${p.name} in vendita`} />
              <button className="icon-btn sm" onClick={() => setEdit(p)} aria-label={`Modifica ${p.name}`}><Icon n="edit" size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      {edit && <PackSheet key={edit === 'new' ? 'new' : edit.id} pack={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function PackSheet({ pack, onClose }: { pack: Pack | null; onClose: () => void }) {
  const s = useStore();
  const d = s.data!;
  const [name, setName] = useState(pack?.name ?? '');
  const [kind, setKind] = useState<Pack['kind']>(pack?.kind ?? 'pack');
  const [lessons, setLessons] = useState(String(pack?.lessons ?? 10));
  const [days, setDays] = useState(String(pack?.validityDays ?? 90));
  const [price, setPrice] = useState(pack ? String(pack.priceCents / 100) : '');
  const [typeIds, setTypeIds] = useState<string[]>(pack?.typeIds ?? []);
  const [weekly, setWeekly] = useState(pack?.weeklyLimit ? String(pack.weeklyLimit) : '');
  const [active, setActive] = useState(pack?.active ?? true);

  const cents = Math.round(Number(price.replace(',', '.')) * 100);
  const valid = name.trim() && Number(days) >= 1 && Number.isFinite(cents) && cents >= 0 && price !== '' && (kind === 'monthly' || Number(lessons) >= 1);
  const flip = (id: string) => setTypeIds((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const save = async () => {
    const p: Pack = { id: pack?.id ?? '', name: name.trim(), kind, lessons: kind === 'pack' ? Number(lessons) : null, validityDays: Number(days), priceCents: cents, typeIds, weeklyLimit: kind === 'monthly' && Number(weekly) >= 1 ? Number(weekly) : null, active };
    const r = await s.run(s.api.savePack(p), pack ? 'Pacchetto aggiornato.' : 'Pacchetto creato.');
    if (r.ok) onClose();
  };

  return (
    <Sheet open onClose={onClose} title={pack ? 'Modifica pacchetto' : 'Nuovo pacchetto'} footer={<><Btn kind="quiet" onClick={onClose}>Chiudi</Btn><Btn onClick={save} disabled={!valid}>Salva</Btn></>}>
      {pack && <p className="muted small">Le modifiche valgono per le nuove vendite. Chi ha già comprato il pacchetto non cambia.</p>}
      <Field label="Nome"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Pilates 8 lezioni" data-autofocus /></Field>
      <div className="field">
        <span id="k-l">Tipo</span>
        <div role="group" aria-labelledby="k-l" className="seg-wrap">
          <button type="button" className={`chip${kind === 'pack' ? ' on' : ''}`} aria-pressed={kind === 'pack'} onClick={() => { setKind('pack'); if (!pack) setDays('90'); }}>A lezioni</button>
          <button type="button" className={`chip${kind === 'monthly' ? ' on' : ''}`} aria-pressed={kind === 'monthly'} onClick={() => { setKind('monthly'); if (!pack) setDays('30'); }}>A tempo (mensile)</button>
        </div>
        <small>{kind === 'pack' ? 'Un numero di lezioni che si scalano a ogni prenotazione.' : 'Vale per un periodo: lezioni illimitate o con un massimo a settimana.'}</small>
      </div>
      <div className="grid2">
        {kind === 'pack' ? <Field label="Lezioni"><input type="number" min={1} max={200} value={lessons} onChange={(e) => setLessons(e.target.value)} /></Field>
          : <Field label="Max a settimana" hint="Vuoto = illimitato."><input type="number" min={1} max={14} value={weekly} onChange={(e) => setWeekly(e.target.value)} /></Field>}
        <Field label="Validità (giorni)"><input type="number" min={1} max={730} value={days} onChange={(e) => setDays(e.target.value)} /></Field>
        <Field label="Prezzo (€)"><input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" /></Field>
      </div>
      <div className="field">
        <span id="t-l">Corsi inclusi</span>
        <div className="row" role="group" aria-labelledby="t-l">
          {d.types.map((t) => <button key={t.id} type="button" className={`chip${typeIds.includes(t.id) ? ' on' : ''}`} aria-pressed={typeIds.includes(t.id)} onClick={() => flip(t.id)}>{t.name}</button>)}
        </div>
        <small>{typeIds.length === 0 ? 'Nessuno scelto: vale per tutti i corsi.' : 'Solo i corsi scelti.'}</small>
      </div>
      <div className="row between"><span><b>In vendita</b><br /><small className="muted">Se è spento non compare tra i pacchetti.</small></span><Toggle on={active} onChange={setActive} label="In vendita" /></div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Impostazioni
export function SettingsScreen() {
  const s = useStore();
  const d = s.data!;
  const [cw, setCw] = useState(String(d.settings.cancelWindowHours));
  const [hz, setHz] = useState(String(d.settings.bookingHorizonDays));
  const [bc, setBc] = useState(String(d.settings.bookingCloseMinutes));
  const [wl, setWl] = useState(d.settings.waitlistEnabled);
  const next: Settings = { ...d.settings, cancelWindowHours: Number(cw), bookingHorizonDays: Number(hz), bookingCloseMinutes: Number(bc), waitlistEnabled: wl };
  const valid = Number(cw) >= 0 && Number(cw) <= 72 && Number(hz) >= 1 && Number(hz) <= 60 && Number(bc) >= 0 && Number(bc) <= 240 && cw !== '' && hz !== '' && bc !== '';
  const dirty = JSON.stringify(next) !== JSON.stringify(d.settings);

  return (
    <>
      <PageHead title="Impostazioni" sub="Le regole di prenotazione valgono per tutti i clienti." />
      <form className="form narrow" onSubmit={async (e) => { e.preventDefault(); await s.run(s.api.saveSettings(next), 'Impostazioni salvate.'); }}>
        <Field label="Annullo gratuito fino a (ore prima)" hint={Number(cw) === 0 ? 'Si può annullare gratis fino all’inizio della lezione.' : `Chi annulla a meno di ${cw || 0} ore dall’inizio perde la lezione.`}><input type="number" min={0} max={72} value={cw} onChange={(e) => setCw(e.target.value)} /></Field>
        <Field label="Si prenota fino a (giorni in anticipo)" hint="Le lezioni più lontane non si possono ancora prenotare."><input type="number" min={1} max={60} value={hz} onChange={(e) => setHz(e.target.value)} /></Field>
        <Field label="Le prenotazioni chiudono (minuti prima)" hint="Dopo questo limite il cliente non prenota più da solo: puoi sempre aggiungerlo tu."><input type="number" min={0} max={240} value={bc} onChange={(e) => setBc(e.target.value)} /></Field>
        <div className="row between"><span><b>Lista d&#8217;attesa</b><br /><small className="muted">Se la lezione è piena, il cliente può mettersi in coda: se si libera un posto entra da solo.</small></span><Toggle on={wl} onChange={setWl} label="Lista d’attesa" /></div>
        <div className="row"><Btn type="submit" disabled={!dirty || !valid}>Salva</Btn></div>
      </form>

      <h2 className="sec">Orario</h2>
      <button className="link-row" onClick={() => s.route.go('/orari/modelli')}><span>Orario settimanale<small className="muted"> · {d.templates.filter((t) => t.active).length} righe attive</small></span><Icon n="right" size={18} /></button>

      {s.api.mode === 'demo' && (
        <div className="demo-box">
          <b>Modalità demo</b>
          <p>I dati restano solo su questo dispositivo. Puoi provare tutto senza rischi.</p>
          <div className="row">
            <Btn kind="ghost" size="sm" onClick={async () => { const r = await s.api.demoLogin!('client'); if (r.ok) { s.setSession(r.me, r.data); s.route.go('/corsi'); } }}>Passa all&#8217;area cliente</Btn>
            <Btn kind="quiet" size="sm" onClick={async () => { const ok = await s.ask({ title: 'Ripristinare i dati demo?', text: 'Si perdono le modifiche fatte in prova.', confirm: 'Ripristina' }); if (!ok) return; const r = await s.api.resetDemo!(); if (r.ok) { s.setSession(r.me, r.data); s.toast('Dati demo ripristinati.', 'ok'); } }}>Ripristina i dati</Btn>
          </div>
        </div>
      )}
      {s.api.changePassword && <><h2 className="sec">Password</h2><PasswordForm /></>}
      <Btn kind="quiet" onClick={() => s.logout()}><Icon n="logout" size={18} /> Esci</Btn>
    </>
  );
}
