import { useEffect, useState } from 'react';
import { useStore } from './store';
import { Avatar, Chevron, Host, Icon } from './ui';
import { Auth } from './screens/Auth';
import { MyBookings, Notices, PassScreen, Profile, Schedule } from './screens/client';
import { Today } from './screens/owner-today';
import { Calendar, Templates } from './screens/owner-calendar';
import { MemberDetail, Members } from './screens/owner-members';
import { Packs, SettingsScreen } from './screens/owner-packs';
import { Report } from './screens/owner-report';
import { Leads } from './screens/owner-leads';
import { Messages, messagesToSend } from './screens/owner-messages';
import { Payments } from './screens/payments';
import { Lessons } from './screens/lessons';
import { ROLE_LABEL, homePath } from './lib/access';
import type { Role } from './lib/types';
import { useSentLog } from './sentlog';
import { unreadNotices } from './lib/selectors';
import { leadsNew } from './lib/leads';

const CLIENT_NAV = [
  { to: '/corsi', label: 'Corsi', icon: 'calendar' },
  { to: '/prenotazioni', label: 'Prenotazioni', icon: 'list' },
  { to: '/abbonamento', label: 'Abbonamento', icon: 'ticket' },
  { to: '/profilo', label: 'Profilo', icon: 'user' },
];
const STAFF_NAV = [
  { to: '/banco', label: 'Oggi', icon: 'home' },
  { to: '/orari', label: 'Orari', icon: 'calendar' },
  { to: '/iscritti', label: 'Iscritti', icon: 'users' },
  { to: '/cassa', label: 'Cassa', icon: 'cash' },
];
const TRAINER_NAV = [{ to: '/lezioni', label: 'Lezioni', icon: 'calendar' }];
const NAV: Record<Role, { to: string; label: string; icon: string }[]> = { client: CLIENT_NAV, owner: [], staff: STAFF_NAV, trainer: TRAINER_NAV };
const AREA: Record<Role, string> = { client: 'Prenotazioni', owner: 'Area owner', staff: 'Segreteria', trainer: 'Area Trainer' };
const OWNER_NAV = [
  { to: '/oggi', label: 'Oggi', icon: 'home' },
  { to: '/orari', label: 'Orari', icon: 'calendar' },
  { to: '/iscritti', label: 'Iscritti', icon: 'users' },
  { to: '/richieste', label: 'Richieste', icon: 'inbox' },
  { to: '/pacchetti', label: 'Pacchetti', icon: 'ticket' },
  { to: '/report', label: 'Report', icon: 'chart' },
];

export function App() {
  const s = useStore();
  if (!s.ready) return <div className="splash"><img src={logoSrc()} alt="KUKO LAB" width="96" height="96" /></div>;
  return (
    <>
      {s.me ? <Shell /> : <Auth />}
      <Host />
    </>
  );
}

export const logoSrc = () => (window as unknown as { KUKO_ASSETS?: { logo: string } }).KUKO_ASSETS?.logo ?? '/img/logo-cerchio.png';
export const wordSrc = () => (window as unknown as { KUKO_ASSETS?: { word: string } }).KUKO_ASSETS?.word ?? '/img/logo-kuko.png';

function Shell() {
  const s = useStore();
  const me = s.me!;
  const role = me.role;
  const owner = role === 'owner';
  const client = role === 'client';
  const nav = owner ? OWNER_NAV : NAV[role];
  const { parts, go } = s.route;
  const first = '/' + (parts[0] ?? '');
  const home = homePath(role);
  const known = [...nav.map((n) => n.to), owner ? '/impostazioni' : '', owner ? '/messaggi' : '', owner ? '/incassi' : ''];
  useEffect(() => { if (!known.includes(first)) go(home); }, [first, role]); // eslint-disable-line
  const [notices, setNotices] = useState(false);
  const unread = client ? unreadNotices(s.data!, me.id).length : 0;
  const newLeads = owner ? leadsNew(s.data!).length : 0;
  const sentLog = useSentLog();
  const toSend = owner ? messagesToSend(s.data!, s.now, sentLog) : 0;
  const badge = (to: string) => (to === '/richieste' && newLeads > 0 ? newLeads : 0);

  let page;
  if (role === 'staff') {
    switch (parts[0]) {
      case 'orari': page = <Calendar />; break;
      case 'iscritti': page = parts[1] ? <MemberDetail id={parts[1]} /> : <Members />; break;
      case 'cassa': page = <Payments />; break;
      default: page = <Today />;
    }
  } else if (role === 'trainer') {
    page = <Lessons />;
  } else if (owner) {
    switch (parts[0]) {
      case 'orari': page = parts[1] === 'modelli' ? <Templates /> : <Calendar />; break;
      case 'iscritti': page = parts[1] ? <MemberDetail id={parts[1]} /> : <Members />; break;
      case 'richieste': page = <Leads />; break;
      case 'pacchetti': page = <Packs />; break;
      case 'report': page = <Report />; break;
      case 'messaggi': page = <Messages />; break;
      case 'incassi': page = <Payments />; break;
      case 'impostazioni': page = <SettingsScreen />; break;
      default: page = <Today />;
    }
  } else {
    switch (parts[0]) {
      case 'prenotazioni': page = <MyBookings />; break;
      case 'abbonamento': page = <PassScreen />; break;
      case 'profilo': page = <Profile />; break;
      default: page = <Schedule />;
    }
  }

  return (
    <div className={`shell ${client ? 'is-client' : 'is-owner'} role-${role}${nav.length < 2 ? ' one-tab' : ''}`}>
      <aside className="side">
        <a className="brand" href={'#' + home} onClick={(e) => { e.preventDefault(); go(home); }}><img src={logoSrc()} alt="" width="44" height="44" /><span><b>KUKO LAB</b>{AREA[role]}</span></a>
        <nav aria-label="Principale">
          {nav.map((n) => (
            <a key={n.to} href={'#' + n.to} className={first === n.to ? 'on' : ''} aria-current={first === n.to ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go(n.to); }}>
              <Icon n={n.icon} size={20} /><span>{n.label}</span>{badge(n.to) > 0 && <i className="nav-pip" aria-label={`${badge(n.to)} nuove`}>{badge(n.to)}</i>}{first === n.to && <Chevron className="chev" />}
            </a>
          ))}
          {owner && <a href="#/incassi" className={first === '/incassi' ? 'on' : ''} onClick={(e) => { e.preventDefault(); go('/incassi'); }}><Icon n="cash" size={20} /><span>Incassi</span>{first === '/incassi' && <Chevron className="chev" />}</a>}
          {owner && <a href="#/messaggi" className={first === '/messaggi' ? 'on' : ''} onClick={(e) => { e.preventDefault(); go('/messaggi'); }}><Icon n="wa" size={20} /><span>Messaggi</span>{toSend > 0 && <i className="nav-pip" aria-label={`${toSend} da mandare`}>{toSend}</i>}{first === '/messaggi' && <Chevron className="chev" />}</a>}
          {owner && <a href="#/impostazioni" className={first === '/impostazioni' ? 'on' : ''} onClick={(e) => { e.preventDefault(); go('/impostazioni'); }}><Icon n="gear" size={20} /><span>Impostazioni</span>{first === '/impostazioni' && <Chevron className="chev" />}</a>}
        </nav>
        <div className="side-user">
          <Avatar name={me.name} size={36} />
          <div><b>{me.name}</b><small>{ROLE_LABEL[role]}</small></div>
          <button className="icon-btn" onClick={() => s.logout()} aria-label="Esci"><Icon n="logout" size={18} /></button>
        </div>
      </aside>
      <div className="main">
        <header className="top">
          <a className="brand" href={'#' + home} onClick={(e) => { e.preventDefault(); go(home); }}><img src={logoSrc()} alt="KUKO LAB" width="40" height="40" /></a>
          <p className="hello">{role === 'owner' || role === 'staff' ? AREA[role] : <>Ciao, <b>{me.name.split(' ')[0]}</b></>}</p>
          {client && <button className="icon-btn bell" onClick={() => setNotices(true)} aria-label={unread ? `Avvisi, ${unread} nuovi` : 'Avvisi'}><Icon n="bell" size={22} />{unread > 0 && <i className="pip">{unread}</i>}</button>}
          {owner && <button className="icon-btn" onClick={() => go('/incassi')} aria-label="Incassi"><Icon n="cash" size={22} /></button>}
          {owner && <button className="icon-btn" onClick={() => go('/messaggi')} aria-label={toSend ? `Messaggi, ${toSend} da mandare` : 'Messaggi'}><Icon n="wa" size={22} />{toSend > 0 && <i className="pip">{toSend}</i>}</button>}
          {owner && <button className="icon-btn" onClick={() => go('/impostazioni')} aria-label="Impostazioni"><Icon n="gear" size={22} /></button>}
          <button className="icon-btn mob-out" onClick={() => s.logout()} aria-label="Esci"><Icon n="logout" size={20} /></button>
        </header>
        <main className="page" id="main">{page}</main>
      </div>
      {nav.length > 1 && <nav className="tabs" aria-label="Principale">
        {nav.map((n) => (
          <a key={n.to} href={'#' + n.to} className={first === n.to ? 'on' : ''} aria-current={first === n.to ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go(n.to); }}>
            <span className="tab-ic"><Icon n={n.icon} size={22} />{badge(n.to) > 0 && <i className="nav-pip" aria-label={`${badge(n.to)} nuove`}>{badge(n.to)}</i>}</span><span>{n.label}</span>
          </a>
        ))}
      </nav>}
      {client && <Notices open={notices} onClose={() => setNotices(false)} />}
    </div>
  );
}
