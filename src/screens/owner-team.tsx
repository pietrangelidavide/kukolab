import { useState } from 'react';
import { useStore } from '../store';
import { Avatar, Badge, Btn, Field, Icon, Sheet } from '../ui';
import { teamOf } from '../lib/team';
import { teaches } from '../lib/access';
import { waLink } from '../lib/format';
import { STUDIO } from '../config';
import type { Member } from '../lib/types';

/** Segreteria e Trainer: chi lavora nello studio e accede all'app. Solo l'owner li gestisce (Impostazioni). */
export function TeamSection() {
  const s = useStore();
  const d = s.data!;
  const [adding, setAdding] = useState<'staff' | 'trainer' | null>(null);
  const team = teamOf(d);
  const staff = team.find((m) => m.role === 'staff');
  const trainers = team.filter((m) => m.role === 'trainer');
  const upcoming = (m: Member) => d.sessions.filter((x) => x.status === 'scheduled' && x.startsAt >= s.now.toISOString() && teaches(m, x)).length;

  const remove = async (m: Member) => {
    const ok = await s.ask({
      title: `Togliere ${m.name} dal team?`,
      text: m.role === 'staff'
        ? 'Da subito non potrà più usare l’area Segreteria. Gli incassi che ha registrato restano, con il suo nome.'
        : 'Da subito non potrà più vedere le sue lezioni né segnare le presenze.',
      confirm: 'Togli', danger: true,
    });
    if (ok) await s.run(s.api.removeTeamMember(m.id), (r) => (r.kept ? 'Tolto dal team. Resta tra gli iscritti perché ha una storia nello studio.' : 'Tolto dal team.'));
  };

  const invite = (m: Member) => m.phone && m.email
    ? waLink(m.phone, `Ciao ${m.name.split(' ')[0]}, ti ho abilitato come ${m.role === 'staff' ? 'Segreteria' : 'Trainer'} nell’app di ${STUDIO.name}. Apri ${location.origin}/app/ e scrivi la tua email (${m.email}): ti arriva un codice per entrare, senza password.`)
    : null;

  const row = (m: Member) => {
    const wa = invite(m);
    const n = m.role === 'trainer' ? upcoming(m) : 0;
    return (
      <li key={m.id}>
        <Avatar name={m.name} size={38} />
        <div className="who">
          <b>{m.name}</b>
          <small>{m.email}{m.role === 'trainer' ? (n > 0 ? ` · ${n} ${n === 1 ? 'lezione in programma' : 'lezioni in programma'}` : ' · nessuna lezione abbinata') : ''}</small>
        </div>
        {m.role === 'trainer' && n === 0 && <Badge tone="warn">Da abbinare</Badge>}
        {m.hasAccount === true && <Badge tone="ok">Ha già acceduto</Badge>}
        {wa && <a className="icon-btn sm" href={wa} target="_blank" rel="noopener" aria-label={`Invita ${m.name} su WhatsApp`}><Icon n="wa" size={16} /></a>}
        <button className="icon-btn sm" onClick={() => remove(m)} aria-label={`Togli ${m.name} dal team`}><Icon n="trash" size={16} /></button>
      </li>
    );
  };

  return (
    <>
      <h2 className="sec">Team</h2>
      <p className="muted">Chi lavora nello studio entra nell&#8217;app come tutti: scrive la sua email e riceve un codice. Tu decidi cosa vede.</p>

      <div className="panel team">
        <h3>Segreteria <Badge tone="mute">un solo account</Badge></h3>
        <p className="muted small">L&#8217;account del banco in palestra. Vede iscritti, orari e prenotazioni, vende pacchetti e registra gli incassi; della cassa vede solo la giornata di oggi. Non vede incassi passati, report, note private, richieste dal sito, impostazioni, e non modifica l&#8217;orario né i prezzi.</p>
        {staff ? <ul className="tlist">{row(staff)}</ul> : <p className="muted">Nessuna Segreteria.</p>}
        {!staff && <div className="row"><Btn size="sm" onClick={() => setAdding('staff')}><Icon n="plus" size={16} /> Aggiungi la Segreteria</Btn></div>}
      </div>

      <div className="panel team">
        <h3>Trainer</h3>
        <p className="muted small">Un maestro vede solo le sue lezioni e chi è iscritto (il nome, niente contatti), e segna le presenze. Le lezioni sono sue quando nel campo “Istruttore” dell&#8217;orario c&#8217;è il suo nome, anche solo il nome di battesimo.</p>
        {trainers.length > 0 && <ul className="tlist">{trainers.map(row)}</ul>}
        <div className="row"><Btn size="sm" kind={trainers.length ? 'ghost' : 'primary'} onClick={() => setAdding('trainer')}><Icon n="plus" size={16} /> Aggiungi un Trainer</Btn></div>
      </div>
      {adding && <AddTeam role={adding} onClose={() => setAdding(null)} />}
    </>
  );
}

function AddTeam({ role, onClose }: { role: 'staff' | 'trainer'; onClose: () => void }) {
  const s = useStore();
  const [name, setName] = useState(role === 'staff' ? 'Segreteria' : '');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const valid = name.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const save = async () => {
    const r = await s.run(s.api.addTeamMember({ name, email, role, phone }), (x) => (role === 'staff' ? `${x.member.name} può accedere con ${x.member.email}.` : `${x.member.name} aggiunto. Scrivi lo stesso nome nel campo Istruttore dell’orario per abbinargli le lezioni.`));
    if (r.ok) onClose();
  };
  return (
    <Sheet open onClose={onClose} title={role === 'staff' ? 'Aggiungi la Segreteria' : 'Aggiungi un Trainer'} footer={<><Btn kind="quiet" onClick={onClose}>Chiudi</Btn><Btn onClick={save} disabled={!valid}>Aggiungi</Btn></>}>
      {role === 'staff'
        ? <p className="muted">Il codice di accesso arriva a questa email, ogni volta che si entra: meglio una casella dello studio (ad esempio segreteria@…) che resta anche se cambia la persona al banco.</p>
        : <p className="muted">Il codice di accesso arriva a questa email. Se è già tra gli iscritti passa al team senza perdere nulla.</p>}
      <Field label={role === 'staff' ? 'Nome dell’account' : 'Nome e cognome'} hint={role === 'trainer' ? 'È il nome da scrivere nel campo Istruttore dell’orario (o solo il nome di battesimo).' : undefined}>
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" data-autofocus />
      </Field>
      <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" inputMode="email" /></Field>
      <Field label="Telefono" hint="Facoltativo: serve per invitarlo su WhatsApp."><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="off" /></Field>
    </Sheet>
  );
}
