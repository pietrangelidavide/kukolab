import { useEffect, useRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useStore } from './store';
import { initials } from './lib/format';
import type { Tone } from './lib/types';

// ---------- icone (tratto 1.8, 24px) ----------
const P: Record<string, ReactNode> = {
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>,
  list: <><path d="M9 6.5h11M9 12h11M9 17.5h11" /><circle cx="4.7" cy="6.5" r="1" /><circle cx="4.7" cy="12" r="1" /><circle cx="4.7" cy="17.5" r="1" /></>,
  ticket: <><path d="M3.5 9V7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v2a2.5 2.5 0 0 0 0 5v3a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-3a2.5 2.5 0 0 0 0-5Z" /><path d="M14 5v2.5M14 11v2M14 16.5V19" /></>,
  user: <><circle cx="12" cy="8.2" r="3.7" /><path d="M4.5 20c.6-3.6 3.6-5.6 7.5-5.6s6.9 2 7.5 5.6" /></>,
  users: <><circle cx="9.2" cy="8.4" r="3.4" /><path d="M2.8 19.6c.5-3.4 3.2-5.3 6.4-5.3s5.9 1.9 6.4 5.3" /><path d="M15.6 5.3a3.4 3.4 0 0 1 0 6.2M18 14.7c1.8.7 3 2.3 3.3 4.9" /></>,
  bell: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z" /><path d="M10 21h4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  right: <path d="m9 5 7 7-7 7" />,
  left: <path d="m15 5-7 7 7 7" />,
  down: <path d="m5 9 7 7 7-7" />,
  search: <><circle cx="10.8" cy="10.8" r="6.3" /><path d="m15.5 15.5 5 5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M21 20H3" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3.2v2.3M12 18.5v2.3M3.2 12h2.3M18.5 12h2.3M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6" /></>,
  logout: <><path d="M10 4.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h4" /><path d="M16 8l4 4-4 4M20 12H9.5" /></>,
  home: <><path d="M4 11.2 12 4l8 7.2" /><path d="M6 10v9.5h4.5v-5.5h3v5.5H18V10" /></>,
  grid: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" /></>,
  phone: <path d="M5.200 4.500h3.400l1.600 4-2 1.300a10.500 10.500 0 0 0 5.500 5.500l1.300-2 4 1.600v3.400a1.500 1.500 0 0 1-1.600 1.500C10.600 19.300 4.700 13.400 3.700 6.100A1.500 1.500 0 0 1 5.200 4.500Z" />,
  alert: <><path d="M12 4.2 21 19.5H3Z" /><path d="M12 10v4.2M12 16.8v.1" /></>,
  edit: <><path d="M4 20h4L19 9a2.800 2.800 0 0 0-4-4L4 16Z" /><path d="m13.500 6.500 4 4" /></>,
  trash: <><path d="M4.500 7h15M9.500 7V4.500h5V7M6.500 7l.8 12.500h9.400L17.500 7" /></>,
  repeat: <><path d="M4 11V9.500a3 3 0 0 1 3-3h12M16 3.500l3 3-3 3M20 13v1.500a3 3 0 0 1-3 3H5M8 20.500l-3-3 3-3" /></>,
  dots: <><circle cx="5.500" cy="12" r="1.300" /><circle cx="12" cy="12" r="1.300" /><circle cx="18.500" cy="12" r="1.300" /></>,
  info: <><circle cx="12" cy="12" r="8.500" /><path d="M12 11v5M12 7.800v.1" /></>,
  leaf: <><path d="M5 19c0-8 4-13 14-14 0 9-4.500 14-12.500 14.200" /><path d="M5 19c2-4 5-7 9-9" /></>,
  inbox: <><path d="M3.5 13.5 6 5.5h12l2.5 8" /><path d="M3.5 13.5v5a1.5 1.5 0 0 0 1.500 1.500h13a1.500 1.500 0 0 0 1.500-1.500v-5h-5.500a3.500 3.500 0 0 1-7 0Z" /></>,
  cash: <><rect x="3" y="6.500" width="18" height="11" rx="2" /><circle cx="12" cy="12" r="2.600" /><path d="M6.500 10v4M17.500 10v4" /></>,
  bolt: <path d="M13 3 5.500 13.500H11L10 21l8-11h-5.500Z" />,
  receipt: <><path d="M6 3.500h12v17l-3-1.800-3 1.800-3-1.800-3 1.800Z" /><path d="M9 8.500h6M9 12h6" /></>,
  briefcase: <><rect x="3.500" y="7.500" width="17" height="12" rx="2.200" /><path d="M9 7.500V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.500M3.500 13h17" /></>,
  download: <path d="M12 4v11M7.500 11 12 15.500 16.500 11M5 20h14" />,
  wa: <><path d="M4 20l1.200-4.200A8.200 8.200 0 1 1 8.200 18.800Z" /><path d="M9.200 8.800c.2 2.600 2.300 4.800 5 5.600l1.200-1.300-1.800-.9-.8.700a5 5 0 0 1-2-2l.7-.8-.9-1.800Z" /></>,
};

export function Icon({ n, size = 22, className }: { n: keyof typeof P | string; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[n]}
    </svg>
  );
}

export const Chevron = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 10 16" aria-hidden="true" fill="currentColor"><path d="M6 0h4L4 8l6 8H6L0 8z" /></svg>
);

// ---------- elementi base ----------
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'ghost' | 'quiet' | 'danger'; size?: 'sm' | 'md'; block?: boolean };
export function Btn({ kind = 'primary', size = 'md', block, className = '', children, ...rest }: BtnProps) {
  return <button type="button" className={`btn btn-${kind} btn-${size}${block ? ' btn-block' : ''} ${className}`} {...rest}><span>{children}</span></button>;
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">{initials(name)}</span>;
}

export function Badge({ tone = 'mute', children }: { tone?: 'ok' | 'warn' | 'bad' | 'mute' | 'accent' | 'rust'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export const toneClass = (t: Tone) => `tone-${t}`;

export function Empty({ icon = 'calendar', title, text, action }: { icon?: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-ic"><Icon n={icon} size={26} /></span>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { v: T; t: string }[]; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" className={value === o.v ? 'on' : ''} aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.t}</button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch${on ? ' on' : ''}`} onClick={() => onChange(!on)}><i /></button>
  );
}

// ---------- finestra ----------
export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef<Element | null>(null);
  useEffect(() => {
    if (!open) return;
    prev.current = document.activeElement;
    document.body.classList.add('lock');
    const t = setTimeout(() => { (ref.current?.querySelector('[data-autofocus]') as HTMLElement | null)?.focus() ?? (ref.current?.querySelector('button.close') as HTMLElement | null)?.focus(); }, 30);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', key);
      document.body.classList.remove('lock');
      (prev.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`sheet${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="close" onClick={onClose} aria-label="Chiudi"><Icon n="x" size={20} /></button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Host() {
  const s = useStore();
  return (
    <>
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {s.toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <Icon n={t.kind === 'error' ? 'alert' : t.kind === 'ok' ? 'check' : 'info'} size={18} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
      <Sheet open={!!s.asking} onClose={() => s.answer(false)} title={s.asking?.title ?? ''}
        footer={<><Btn kind="quiet" onClick={() => s.answer(false)}>{s.asking?.cancel ?? 'Indietro'}</Btn><Btn kind={s.asking?.danger ? 'danger' : 'primary'} data-autofocus onClick={() => s.answer(true)}>{s.asking?.confirm ?? 'Conferma'}</Btn></>}>
        {s.asking?.text && <p className="ask-text">{s.asking.text}</p>}
      </Sheet>
    </>
  );
}
