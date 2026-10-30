import { useEffect, useState } from 'react';
import { useStore } from './store';
import { Avatar, Chevron, Host, Icon } from './ui';
import { Auth } from './screens/Auth';
import { MyBookings, Notices, PassScreen, Profile, Schedule } from './screens/client';
import { Today } from './screens/owner-today';
import { Calendar, Templates } from './screens/owner-calendar';
import { MemberDetail, Members } from './screens/owner-members';
import { Packs, SettingsScreen } from './screens/owner-packs';
import { AreaTabs } from './screens/area-ui';
import { BookingRules, BookingsHub } from './screens/hub-bookings';
import { ClientsHub } from './screens/hub-clients';
import { BillingHub } from './screens/hub-billing';
import { StaffHub } from './screens/hub-staff';
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
import { AREAS, OWNER_ROUTES, areaOf } from './lib/areas';
import { attendanceToMark } from './lib/insights';

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
const NAV: Record<Role, { to: string; label: string; short?: string; icon: string }[]> = { client: CLIENT_NAV, owner: [], staff: STAFF_NAV, trainer: TRAINER_NAV };
const AREA: Record<Role, string> = { client: 'Prenotazioni', owner: 'Area owner', staff: 'Segreteria', trainer: 'Area Trainer' };
const OWNER_NAV: { to: string; label: string; short?: string; icon: string }[] = AREAS.map((a) => ({ to: a.to, label: a.label, short: a.short, icon: a.icon }));

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
  const { parts, go, path } = s.route;
  const first = '/' + (parts[0] ?? '');
  const area = owner ? areaOf(path) : undefined; // l'area dell'owner in cui si trova (le schede sopra la pagina)
  const onNav = (to: string) => (owner ? area?.to === to : first === to);
  const home = homePath(role);
  const known = owner ? OWNER_ROUTES : nav.map((n) => n.to);
  useEffect(() => { if (!known.includes(first)) go(home); }, [first, role]); // eslint-disable-line
  const [notices, setNotices] = useState(false);
  const unread = client ? unreadNotices(s.data!, me.id).length : 0;
  const newLeads = owner ? leadsNew(s.data!).length : 0;
  const sentLog = useSentLog();
  const toSend = owner ? messagesToSend(s.data!, s.now, sentLog) : 0;
  const toMark = owner ? attendanceToMark(s.data!, s.now).length : 0;
  // sulle aree compare il numero delle cose da fare: presenze da segnare in Prenotazioni, richieste nuove e messaggi pronti in Clienti
  const badge = (to: string) => (to === '/prenotazioni' ? toMark : to === '/clienti' ? newLeads + toSend : 0);

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
      case 'prenotazioni': page = parts[1] === 'regole' ? <BookingRules /> : <BookingsHub />; break;
      case 'orari': page = parts[1] === 'modelli' ? <Templates /> : <Calendar />; break;
      case 'report': page = <Report />; break;
      case 'clienti': page = <ClientsHub />; break;
      case 'iscritti': page = parts[1] ? <MemberDetail id={parts[1]} /> : <Members />; break;
      case 'richieste': page = <Leads />; break;
      case 'messaggi': page = <Messages />; break;
      case 'fatturazione': page = <BillingHub />; break;
      case 'incassi': page = <Payments />; break;
      case 'pacchetti': page = <Packs />; break;
      case 'dipendenti': page = <StaffHub />; break;
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
            <a key={n.to} href={'#' + n.to} className={onNav(n.to) ? 'on' : ''} aria-current={onNav(n.to) ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go(n.to); }}>
              <Icon n={n.icon} size={20} /><span>{n.label}</span>{badge(n.to) > 0 && <i className="nav-pip" aria-label={`${badge(n.to)} da fare`}>{badge(n.to)}</i>}{onNav(n.to) && <Chevron className="chev" />}
            </a>
          ))}
          {owner && <a className={`side-sep${first === '/impostazioni' ? ' on' : ''}`} href="#/impostazioni" aria-current={first === '/impostazioni' ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go('/impostazioni'); }}><Icon n="gear" size={20} /><span>Impostazioni</span>{first === '/impostazioni' && <Chevron className="chev" />}</a>}
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
          {owner && <button className="icon-btn" onClick={() => go('/messaggi')} aria-label={toSend ? `Messaggi, ${toSend} da mandare` : 'Messaggi'}><Icon n="wa" size={22} />{toSend > 0 && <i className="pip">{toSend}</i>}</button>}
          {owner && <button className="icon-btn" onClick={() => go('/impostazioni')} aria-label="Impostazioni"><Icon n="gear" size={22} /></button>}
          <button className="icon-btn mob-out" onClick={() => s.logout()} aria-label="Esci"><Icon n="logout" size={20} /></button>
        </header>
        <main className="page" id="main">{area && area.tabs.length > 0 && <AreaTabs area={area} path={path} />}{page}</main>
      </div>
      {nav.length > 1 && <nav className="tabs" aria-label="Principale">
        {nav.map((n) => (
          <a key={n.to} href={'#' + n.to} className={onNav(n.to) ? 'on' : ''} aria-current={onNav(n.to) ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go(n.to); }}>
            <span className="tab-ic"><Icon n={n.icon} size={22} />{badge(n.to) > 0 && <i className="nav-pip" aria-label={`${badge(n.to)} da fare`}>{badge(n.to)}</i>}</span><span>{n.short ?? n.label}</span>
          </a>
        ))}
      </nav>}
      {client && <Notices open={notices} onClose={() => setNotices(false)} />}
    </div>
  );
}
