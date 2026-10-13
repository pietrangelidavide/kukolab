-- KUKO LAB — database delle prenotazioni (Supabase / PostgreSQL).
-- Si incolla tutto nello SQL Editor di Supabase e si esegue. Si può rieseguire senza perdere dati.
--
-- Come è fatto:
--  * le tabelle sono chiuse: nessuno le legge o scrive direttamente (RLS attiva, nessuna policy);
--  * l'app parla solo con le funzioni qui sotto (snapshot, book_session, cancel_booking, ...), che controllano chi sei;
--  * le regole (posti, abbonamenti, lista d'attesa, annulli) sono le stesse di src/lib/rules.ts: se cambia una, cambia anche l'altra.

create schema if not exists private;

-- =========================================================================================== tabelle
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  studio_name text not null default 'KUKO LAB',
  cancel_window_hours int not null default 12 check (cancel_window_hours between 0 and 72),
  booking_horizon_days int not null default 14 check (booking_horizon_days between 1 and 60),
  booking_close_minutes int not null default 15 check (booking_close_minutes between 0 and 240),
  waitlist_enabled boolean not null default true,
  generated_until date
);
insert into public.settings (id) values (1) on conflict do nothing;

create table if not exists public.course_types (
  id text primary key,
  name text not null,
  capacity int not null check (capacity >= 1),
  duration int not null check (duration >= 10),
  tone text not null default 'orange' check (tone in ('orange', 'rust', 'white'))
);
insert into public.course_types (id, name, capacity, duration, tone) values
  ('functional', 'Functional', 8, 50, 'orange'),
  ('pilates', 'Pilates', 4, 50, 'rust'),
  ('pt', 'Personal training', 1, 60, 'white')
on conflict do nothing;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  email text not null default '',
  phone text not null default '',
  role text not null default 'client' check (role in ('client', 'owner')),
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists members_email_idx on public.members (lower(email));

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  type_id text not null references public.course_types (id),
  weekday int not null check (weekday between 1 and 7),
  time time not null,
  capacity int not null check (capacity >= 1),
  duration int not null default 50 check (duration >= 10),
  trainer text not null default '',
  active boolean not null default true
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  type_id text not null references public.course_types (id),
  starts_at timestamptz not null,
  duration int not null default 50 check (duration >= 10),
  capacity int not null check (capacity >= 1),
  trainer text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  template_id uuid references public.templates (id) on delete set null,
  note text not null default ''
);
create index if not exists sessions_starts_idx on public.sessions (starts_at);
create unique index if not exists sessions_template_start_idx on public.sessions (template_id, starts_at) where template_id is not null;

create table if not exists public.packs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  kind text not null check (kind in ('pack', 'monthly')),
  lessons int check (lessons is null or lessons >= 1),
  validity_days int not null check (validity_days >= 1),
  price_cents int not null default 0 check (price_cents >= 0),
  type_ids text[] not null default '{}',
  weekly_limit int check (weekly_limit is null or weekly_limit >= 1),
  active boolean not null default true
);

create table if not exists public.passes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  pack_id uuid references public.packs (id) on delete set null,
  name text not null,
  kind text not null check (kind in ('pack', 'monthly')),
  credits_total int,
  credits_left int check (credits_left is null or credits_left >= 0),
  starts_on date not null,
  expires_on date not null check (expires_on >= starts_on),
  type_ids text[] not null default '{}',
  weekly_limit int,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists passes_member_idx on public.passes (member_id);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  status text not null check (status in ('booked', 'waitlist', 'cancelled', 'late_cancelled', 'attended', 'no_show')),
  pass_id uuid references public.passes (id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  cancelled_at timestamptz,
  promoted_at timestamptz
);
create index if not exists bookings_session_idx on public.bookings (session_id);
create index if not exists bookings_member_idx on public.bookings (member_id);
create index if not exists bookings_pass_idx on public.bookings (pass_id);
-- una persona non può avere due posti (o due attese) sulla stessa lezione
create unique index if not exists bookings_one_active_idx on public.bookings (session_id, member_id) where status in ('booked', 'waitlist', 'attended', 'no_show');

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null check (kind in ('promoted', 'session_cancelled', 'info')),
  text text not null,
  created_at timestamptz not null default clock_timestamp(),
  read boolean not null default false
);
create index if not exists notices_member_idx on public.notices (member_id);

alter table public.settings enable row level security;
alter table public.course_types enable row level security;
alter table public.members enable row level security;
alter table public.templates enable row level security;
alter table public.sessions enable row level security;
alter table public.packs enable row level security;
alter table public.passes enable row level security;
alter table public.bookings enable row level security;
alter table public.notices enable row level security;
revoke all on all tables in schema public from anon, authenticated;

-- =========================================================================================== funzioni interne (schema private)
create or replace function private.fail(code text) returns void language plpgsql as $$
begin
  raise exception '%', code;
end $$;

create or replace function private.need_member() returns public.members language plpgsql stable security definer set search_path = public, pg_temp as $$
declare m public.members;
begin
  select * into m from public.members where user_id = auth.uid() limit 1;
  if not found then perform private.fail('auth'); end if;
  return m;
end $$;

create or replace function private.need_owner() returns public.members language plpgsql stable security definer set search_path = public, pg_temp as $$
declare m public.members;
begin
  m := private.need_member();
  if m.role <> 'owner' then perform private.fail('forbidden'); end if;
  return m;
end $$;

create or replace function private.sday(ts timestamptz) returns date language sql stable as $$
  select (ts at time zone 'Europe/Rome')::date
$$;

create or replace function private.monday(d date) returns date language sql immutable as $$
  select date_trunc('week', d::timestamp)::date
$$;

create or replace function private.when_it(ts timestamptz) returns text language sql stable as $$
  select (array['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'])[extract(isodow from ts at time zone 'Europe/Rome')::int]
    || ' ' || extract(day from ts at time zone 'Europe/Rome')::int || ' '
    || (array['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'])[extract(month from ts at time zone 'Europe/Rome')::int]
    || ' alle ' || to_char(ts at time zone 'Europe/Rome', 'HH24:MI')
$$;

create or replace function private.type_name(t text) returns text language sql stable as $$
  select coalesce((select name from public.course_types where id = t), 'Lezione')
$$;

create or replace function private.notice(m uuid, k text, t text) returns void language sql as $$
  insert into public.notices (member_id, kind, text) values (m, k, t)
$$;

create or replace function private.booked_count(sid uuid) returns int language sql stable as $$
  select count(*)::int from public.bookings where session_id = sid and status in ('booked', 'attended', 'no_show')
$$;

-- L'abbonamento può pagare questa lezione?
create or replace function private.pass_usable(p public.passes, s public.sessions) returns boolean language plpgsql stable as $$
declare d date := private.sday(s.starts_at); used int;
begin
  if cardinality(p.type_ids) > 0 and not (s.type_id = any (p.type_ids)) then return false; end if;
  if d < p.starts_on or d > p.expires_on then return false; end if;
  if p.kind = 'pack' then return coalesce(p.credits_left, 0) > 0; end if;
  if p.weekly_limit is not null then
    select count(*) into used
      from public.bookings b join public.sessions bs on bs.id = b.session_id
     where b.pass_id = p.id and b.status in ('booked', 'attended', 'no_show', 'late_cancelled')
       and private.monday(private.sday(bs.starts_at)) = private.monday(d);
    if used >= p.weekly_limit then return false; end if;
  end if;
  return true;
end $$;

-- Sceglie l'abbonamento da usare: quello che scade prima.
create or replace function private.pick_pass(m uuid, s public.sessions) returns uuid language sql stable as $$
  select p.id from public.passes p
   where p.member_id = m and private.pass_usable(p, s)
   order by p.expires_on, p.created_at, p.id
   limit 1
$$;

create or replace function private.overlaps(m uuid, s public.sessions) returns boolean language sql stable as $$
  select exists (
    select 1 from public.bookings b join public.sessions o on o.id = b.session_id
     where b.member_id = m and b.status in ('booked', 'attended', 'no_show') and b.session_id <> s.id and o.status = 'scheduled'
       and o.starts_at < s.starts_at + make_interval(mins => s.duration)
       and o.starts_at + make_interval(mins => o.duration) > s.starts_at)
$$;

create or replace function private.charge(pid uuid) returns void language sql as $$
  update public.passes set credits_left = greatest(0, credits_left - 1) where id = pid and kind = 'pack' and credits_left is not null
$$;

create or replace function private.refund(pid uuid) returns void language sql as $$
  update public.passes set credits_left = least(credits_total, credits_left + 1) where id = pid and kind = 'pack' and credits_left is not null and credits_total is not null
$$;

-- Porta in lezione chi è in lista d'attesa, finché ci sono posti. Salta chi non ha un abbonamento valido o ha un'altra lezione.
create or replace function private.promote(sid uuid) returns int language plpgsql as $$
declare s public.sessions; w record; pid uuid; n int := 0;
begin
  select * into s from public.sessions where id = sid;
  if not found or s.status <> 'scheduled' or now() >= s.starts_at then return 0; end if;
  for w in select * from public.bookings where session_id = sid and status = 'waitlist' order by created_at, id loop
    exit when private.booked_count(sid) >= s.capacity;
    pid := private.pick_pass(w.member_id, s);
    if pid is null or private.overlaps(w.member_id, s) then continue; end if;
    update public.bookings set status = 'booked', pass_id = pid, promoted_at = clock_timestamp() where id = w.id;
    perform private.charge(pid);
    perform private.notice(w.member_id, 'promoted', format('Si è liberato un posto: sei dentro a %s, %s.', private.type_name(s.type_id), private.when_it(s.starts_at)));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Prenota (o mette in lista d'attesa). Restituisce 'booked' o 'waitlist'.
create or replace function private.do_book(mid uuid, sid uuid, as_owner boolean, allow_no_pass boolean) returns text language plpgsql as $$
declare s public.sessions; st public.settings; pid uuid; dup text; left_seats int; is_full boolean;
begin
  select * into s from public.sessions where id = sid for update;
  if not found then perform private.fail('session_not_found'); end if;
  if not exists (select 1 from public.members where id = mid) then perform private.fail('member_not_found'); end if;
  if s.status = 'cancelled' then perform private.fail('session_cancelled'); end if;
  select * into st from public.settings where id = 1;
  if not as_owner then
    if now() >= s.starts_at - make_interval(mins => st.booking_close_minutes) then perform private.fail('booking_closed'); end if;
    if s.starts_at > now() + make_interval(days => st.booking_horizon_days) then perform private.fail('too_far'); end if;
  end if;
  select status into dup from public.bookings where session_id = sid and member_id = mid and status in ('booked', 'attended', 'no_show', 'waitlist') limit 1;
  if dup is not null then perform private.fail(case when dup = 'waitlist' then 'on_waitlist' else 'already_booked' end); end if;
  if private.overlaps(mid, s) then perform private.fail('overlap'); end if;
  pid := private.pick_pass(mid, s);
  if pid is null and not (as_owner and allow_no_pass) then perform private.fail('no_pass'); end if;
  left_seats := s.capacity - private.booked_count(sid);
  if left_seats <= 0 and not st.waitlist_enabled then perform private.fail('full'); end if;
  is_full := left_seats <= 0;
  insert into public.bookings (session_id, member_id, status, pass_id)
    values (sid, mid, case when is_full then 'waitlist' else 'booked' end, case when is_full then null else pid end);
  if not is_full then perform private.charge(pid); end if;
  return case when is_full then 'waitlist' else 'booked' end;
end $$;

create or replace function private.do_cancel(bid uuid, actor public.members) returns jsonb language plpgsql as $$
declare sid uuid; b public.bookings; s public.sessions; st public.settings; was_seat boolean; late boolean; new_status text; refunded boolean; promoted int := 0; as_owner boolean := actor.role = 'owner';
begin
  select session_id into sid from public.bookings where id = bid;
  if not found then perform private.fail('booking_not_found'); end if;
  select * into s from public.sessions where id = sid for update;
  select * into b from public.bookings where id = bid;
  if not as_owner and b.member_id <> actor.id then perform private.fail('forbidden'); end if;
  if b.status not in ('booked', 'waitlist') then perform private.fail('not_cancellable'); end if;
  if not as_owner and now() >= s.starts_at then perform private.fail('session_started'); end if;
  select * into st from public.settings where id = 1;
  was_seat := b.status = 'booked';
  late := not as_owner and was_seat and (s.starts_at - now()) < make_interval(hours => st.cancel_window_hours);
  new_status := case when late then 'late_cancelled' else 'cancelled' end;
  update public.bookings set status = new_status, cancelled_at = clock_timestamp() where id = bid;
  refunded := was_seat and not late;
  if refunded then perform private.refund(b.pass_id); end if;
  if was_seat then promoted := private.promote(sid); end if;
  return jsonb_build_object('status', new_status, 'refunded', refunded, 'promoted', promoted);
end $$;

-- Cancella le lezioni future di una riga d'orario che non hanno ancora nessuno.
create or replace function private.prune_future(tid uuid) returns int language plpgsql as $$
declare n int;
begin
  delete from public.sessions s
   where s.template_id = tid and s.status = 'scheduled' and s.starts_at > now()
     and not exists (select 1 from public.bookings b where b.session_id = s.id and b.status in ('booked', 'waitlist', 'attended', 'no_show'));
  get diagnostics n = row_count;
  return n;
end $$;

-- Crea le lezioni dall'orario settimanale tra due giorni (di Roma, inclusi). Non duplica quelle già presenti.
create or replace function private.generate(d0 date, d1 date) returns int language plpgsql as $$
declare n int;
begin
  insert into public.sessions (type_id, starts_at, duration, capacity, trainer, template_id)
  select t.type_id, ((g.d::date)::timestamp + t.time) at time zone 'Europe/Rome', t.duration, t.capacity, t.trainer, t.id
    from generate_series(d0::timestamp, d1::timestamp, interval '1 day') g(d)
    join public.templates t on t.active and t.weekday = extract(isodow from g.d)::int
  on conflict (template_id, starts_at) where template_id is not null do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function private.ensure_sessions() returns void language plpgsql as $$
declare st public.settings; today date := private.sday(now());
begin
  select * into st from public.settings where id = 1;
  if st.generated_until is null or st.generated_until < today + st.booking_horizon_days + 7 then
    perform private.generate(today, today + st.booking_horizon_days + 21);
    update public.settings set generated_until = today + st.booking_horizon_days + 21 where id = 1;
  end if;
end $$;

-- =========================================================================================== collegamento account ↔ iscritto
-- Chi si registra diventa un iscritto. Se l'owner lo aveva già inserito con la stessa email e l'email è confermata, i due profili si uniscono.
create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare mid uuid; em text := lower(trim(coalesce(new.email, '')));
begin
  if new.email_confirmed_at is not null and em <> '' then
    select id into mid from public.members where user_id is null and lower(email) = em order by created_at limit 1;
  end if;
  if mid is not null then
    update public.members set user_id = new.id where id = mid;
  else
    insert into public.members (user_id, name, email, phone)
    values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), nullif(split_part(em, '@', 1), ''), 'Nuovo iscritto'), em, coalesce(trim(new.raw_user_meta_data ->> 'phone'), ''));
  end if;
  return new;
end $$;

create or replace function private.handle_confirmed() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare ex uuid; fresh uuid; em text := lower(trim(coalesce(new.email, '')));
begin
  if em = '' then return new; end if;
  select id into ex from public.members where user_id is null and lower(email) = em order by created_at limit 1;
  if ex is null then return new; end if;
  select id into fresh from public.members where user_id = new.id;
  if fresh is not null then
    if exists (select 1 from public.bookings where member_id = fresh) or exists (select 1 from public.passes where member_id = fresh) then return new; end if;
    delete from public.members where id = fresh;
  end if;
  update public.members set user_id = new.id where id = ex;
  return new;
end $$;

drop trigger if exists kuko_user_created on auth.users;
create trigger kuko_user_created after insert on auth.users for each row execute function private.handle_new_user();
drop trigger if exists kuko_user_confirmed on auth.users;
create trigger kuko_user_confirmed after update of email_confirmed_at on auth.users for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null) execute function private.handle_confirmed();

-- =========================================================================================== funzioni per l'app (schema public)
-- Tutto quello che l'app deve mostrare, in una sola chiamata. Il cliente vede solo le sue cose; l'owner vede tutto.
create or replace function public.snapshot() returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; st public.settings; own boolean; lo timestamptz; hi timestamptz; res jsonb;
begin
  me := private.need_member();
  perform private.ensure_sessions();
  select * into st from public.settings where id = 1;
  own := me.role = 'owner';
  if own then
    lo := now() - interval '95 days';
    hi := now() + make_interval(days => st.booking_horizon_days + 21);
  else
    lo := now() - interval '1 day';
    hi := now() + make_interval(days => st.booking_horizon_days + 3);
  end if;

  with ss as (
    select s.* from public.sessions s
     where s.starts_at between lo and hi
        or (not own and exists (select 1 from public.bookings b where b.session_id = s.id and b.member_id = me.id))
  ), bk as (
    select b.*,
           case when b.status = 'waitlist'
                then (select count(*) from public.bookings w where w.session_id = b.session_id and w.status = 'waitlist' and (w.created_at, w.id) <= (b.created_at, b.id))
           end as position
      from public.bookings b join ss on ss.id = b.session_id
     where own or b.member_id = me.id
  )
  select jsonb_build_object(
    'me', to_jsonb(me) - 'user_id' - case when own then '' else 'notes' end,
    'settings', to_jsonb(st) - 'id' - 'generated_until',
    'types', (select coalesce(jsonb_agg(to_jsonb(t) order by t.name), '[]'::jsonb) from public.course_types t),
    'members', case when own then (select coalesce(jsonb_agg(to_jsonb(m) - 'user_id' order by m.name), '[]'::jsonb) from public.members m) else jsonb_build_array(to_jsonb(me) - 'user_id' - 'notes') end,
    'templates', case when own then (select coalesce(jsonb_agg(to_jsonb(t) order by t.weekday, t.time), '[]'::jsonb) from public.templates t) else '[]'::jsonb end,
    'sessions', (select coalesce(jsonb_agg(to_jsonb(s) order by s.starts_at, s.id), '[]'::jsonb) from ss s),
    'packs', (select coalesce(jsonb_agg(to_jsonb(p) order by p.price_cents, p.name), '[]'::jsonb) from public.packs p where own or p.active),
    'passes', (select coalesce(jsonb_agg(to_jsonb(p) order by p.expires_on desc), '[]'::jsonb) from public.passes p where own or p.member_id = me.id),
    'bookings', (select coalesce(jsonb_agg(to_jsonb(b) order by b.created_at, b.id), '[]'::jsonb) from bk b),
    'notices', case when own then '[]'::jsonb else (select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc), '[]'::jsonb) from (select * from public.notices where member_id = me.id order by created_at desc limit 50) n) end,
    'counts', case when own then null else (
      select coalesce(jsonb_object_agg(s.id, jsonb_build_object(
               'booked', (select count(*) from public.bookings b where b.session_id = s.id and b.status in ('booked', 'attended', 'no_show')),
               'waitlist', (select count(*) from public.bookings b where b.session_id = s.id and b.status = 'waitlist'))), '{}'::jsonb)
        from ss s) end
  ) into res;
  return res;
end $$;

create or replace function public.book_session(p_session uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members := private.need_member();
begin
  return jsonb_build_object('status', private.do_book(me.id, p_session, false, false));
end $$;

create or replace function public.cancel_booking(p_booking uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members := private.need_member();
begin
  return private.do_cancel(p_booking, me);
end $$;

create or replace function public.update_profile(p_name text, p_phone text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members := private.need_member();
begin
  if length(trim(coalesce(p_name, ''))) = 0 then perform private.fail('invalid'); end if;
  update public.members set name = trim(p_name), phone = trim(coalesce(p_phone, '')) where id = me.id;
end $$;

create or replace function public.read_notices() returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members := private.need_member();
begin
  update public.notices set read = true where member_id = me.id and not read;
end $$;

-- ---------- solo owner
create or replace function public.owner_book(p_member uuid, p_session uuid, p_allow_no_pass boolean) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members := private.need_owner();
begin
  return jsonb_build_object('status', private.do_book(p_member, p_session, true, coalesce(p_allow_no_pass, false)));
end $$;

create or replace function public.set_attendance(p_booking uuid, p_status text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members := private.need_owner(); b public.bookings;
begin
  if p_status not in ('attended', 'no_show', 'booked') then perform private.fail('invalid'); end if;
  select * into b from public.bookings where id = p_booking;
  if not found then perform private.fail('booking_not_found'); end if;
  if b.status not in ('booked', 'attended', 'no_show') then perform private.fail('not_cancellable'); end if;
  update public.bookings set status = p_status where id = p_booking;
end $$;

-- L'owner annulla una lezione: tutti vengono rimborsati e avvisati.
create or replace function public.cancel_session(p_session uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members := private.need_owner(); s public.sessions; b record; n int := 0; nm text;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found then perform private.fail('session_not_found'); end if;
  if s.status = 'cancelled' then perform private.fail('session_cancelled'); end if;
  update public.sessions set status = 'cancelled' where id = p_session;
  nm := private.type_name(s.type_id);
  for b in select * from public.bookings where session_id = p_session and status in ('booked', 'waitlist') order by created_at loop
    update public.bookings set status = 'cancelled', cancelled_at = clock_timestamp() where id = b.id;
    n := n + 1;
    if b.status = 'booked' then
      perform private.refund(b.pass_id);
      perform private.notice(b.member_id, 'session_cancelled', format('%s di %s è stato annullato. La lezione è tornata nel tuo abbonamento.', nm, private.when_it(s.starts_at)));
    else
      perform private.notice(b.member_id, 'session_cancelled', format('%s di %s è stato annullato.', nm, private.when_it(s.starts_at)));
    end if;
  end loop;
  return jsonb_build_object('affected', n);
end $$;

-- Cambia capienza, istruttore, note o orario di una lezione. Chiavi ammesse: capacity, trainer, note, startsAt, duration.
create or replace function public.edit_session(p_session uuid, p_patch jsonb) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members := private.need_owner(); s public.sessions; cap int; dur int; moved boolean := false; new_start timestamptz; b record;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found then perform private.fail('session_not_found'); end if;
  cap := s.capacity; dur := s.duration; new_start := s.starts_at;
  if p_patch ? 'capacity' then
    cap := (p_patch ->> 'capacity')::numeric::int;
    if (p_patch ->> 'capacity')::numeric <> cap or cap < 1 or cap < private.booked_count(p_session) then perform private.fail('invalid'); end if;
  end if;
  if p_patch ? 'duration' then
    dur := (p_patch ->> 'duration')::numeric::int;
    if (p_patch ->> 'duration')::numeric <> dur or dur < 10 then perform private.fail('invalid'); end if;
  end if;
  if p_patch ? 'startsAt' then
    new_start := (p_patch ->> 'startsAt')::timestamptz;
    moved := new_start <> s.starts_at;
  end if;
  update public.sessions set capacity = cap, duration = dur, starts_at = new_start,
         trainer = coalesce(p_patch ->> 'trainer', trainer), note = coalesce(p_patch ->> 'note', note)
   where id = p_session;
  if moved then
    for b in select * from public.bookings where session_id = p_session and status in ('booked', 'waitlist') loop
      perform private.notice(b.member_id, 'info', format('%s è stato spostato a %s.', private.type_name(s.type_id), private.when_it(new_start)));
    end loop;
  end if;
  return jsonb_build_object('promoted', private.promote(p_session));
end $$;

create or replace function public.add_session(p_type text, p_starts timestamptz, p_capacity int, p_duration int, p_trainer text, p_note text default '') returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members := private.need_owner();
begin
  if not exists (select 1 from public.course_types where id = p_type) or p_capacity is null or p_capacity < 1 or p_starts is null or coalesce(p_duration, 0) < 10 then perform private.fail('invalid'); end if;
  insert into public.sessions (type_id, starts_at, duration, capacity, trainer, note) values (p_type, p_starts, p_duration, p_capacity, coalesce(p_trainer, ''), coalesce(p_note, ''));
end $$;

-- Salva una riga dell'orario settimanale. Chiavi: id, typeId, weekday, time, capacity, duration, trainer, active.
create or replace function public.save_template(p jsonb) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members := private.need_owner(); st public.settings; tid uuid; ttype text; wd int; tm time; cap int; dur int; is_active boolean; removed int; created int := 0; today date := private.sday(now());
begin
  ttype := p ->> 'typeId';
  wd := (p ->> 'weekday')::int;
  cap := (p ->> 'capacity')::int;
  dur := coalesce((p ->> 'duration')::int, 50);
  is_active := coalesce((p ->> 'active')::boolean, true);
  if coalesce(p ->> 'time', '') !~ '^\d{2}:\d{2}$' or wd is null or cap is null then perform private.fail('invalid'); end if;
  tm := (p ->> 'time')::time;
  if not exists (select 1 from public.course_types where id = ttype) or wd not between 1 and 7 or cap < 1 or dur < 10 then perform private.fail('invalid'); end if;
  if nullif(p ->> 'id', '') is not null then
    tid := (p ->> 'id')::uuid;
    update public.templates set type_id = ttype, weekday = wd, time = tm, capacity = cap, duration = dur, trainer = coalesce(p ->> 'trainer', ''), active = is_active where id = tid;
    if not found then tid := null; end if;
  end if;
  if tid is null then
    insert into public.templates (type_id, weekday, time, capacity, duration, trainer, active) values (ttype, wd, tm, cap, dur, coalesce(p ->> 'trainer', ''), is_active) returning id into tid;
  end if;
  removed := private.prune_future(tid);
  if is_active then
    select * into st from public.settings where id = 1;
    created := private.generate(today, today + st.booking_horizon_days + 14);
  end if;
  return jsonb_build_object('created', created, 'removed', removed);
exception when invalid_text_representation or check_violation or not_null_violation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format then
  perform private.fail('invalid');
end $$;

create or replace function public.delete_template(p_template uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members := private.need_owner(); removed int;
begin
  if not exists (select 1 from public.templates where id = p_template) then perform private.fail('invalid'); end if;
  removed := private.prune_future(p_template);
  delete from public.templates where id = p_template;
  return jsonb_build_object('removed', removed);
end $$;

create or replace function public.add_member(p_name text, p_email text, p_phone text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members := private.need_owner(); mid uuid;
begin
  if length(trim(coalesce(p_name, ''))) = 0 then perform private.fail('invalid'); end if;
  insert into public.members (name, email, phone) values (trim(p_name), lower(trim(coalesce(p_email, ''))), trim(coalesce(p_phone, ''))) returning id into mid;
  return jsonb_build_object('memberId', mid);
end $$;

create or replace function public.save_member(p_member uuid, p_name text, p_email text, p_phone text, p_notes text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members := private.need_owner();
begin
  if length(trim(coalesce(p_name, ''))) = 0 then perform private.fail('invalid'); end if;
  update public.members set name = trim(p_name), email = lower(trim(coalesce(p_email, ''))), phone = trim(coalesce(p_phone, '')), notes = coalesce(p_notes, '') where id = p_member;
  if not found then perform private.fail('member_not_found'); end if;
end $$;

create or replace function public.assign_pass(p_member uuid, p_pack uuid, p_starts date, p_note text default '') returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members := private.need_owner(); k public.packs;
begin
  if not exists (select 1 from public.members where id = p_member) then perform private.fail('member_not_found'); end if;
  select * into k from public.packs where id = p_pack;
  if not found then perform private.fail('pack_not_found'); end if;
  if p_starts is null then perform private.fail('invalid'); end if;
  insert into public.passes (member_id, pack_id, name, kind, credits_total, credits_left, starts_on, expires_on, type_ids, weekly_limit, note)
  values (p_member, k.id, k.name, k.kind, case when k.kind = 'pack' then coalesce(k.lessons, 0) end, case when k.kind = 'pack' then coalesce(k.lessons, 0) end,
          p_starts, p_starts + (greatest(1, k.validity_days) - 1), k.type_ids, k.weekly_limit, coalesce(p_note, ''));
end $$;

create or replace function public.adjust_credits(p_pass uuid, p_delta int) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members := private.need_owner(); p public.passes; left_now int;
begin
  select * into p from public.passes where id = p_pass for update;
  if not found then perform private.fail('pass_not_found'); end if;
  if p.kind <> 'pack' or p.credits_left is null then perform private.fail('invalid'); end if;
  left_now := greatest(0, p.credits_left + coalesce(p_delta, 0));
  update public.passes set credits_left = left_now, credits_total = greatest(coalesce(credits_total, 0), left_now) where id = p_pass;
end $$;

-- Chiavi: id, name, kind, lessons, validityDays, priceCents, typeIds, weeklyLimit, active.
create or replace function public.save_pack(p jsonb) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members := private.need_owner(); pid uuid; k text; les int; vd int; pc int; wl int; tids text[]; act boolean;
begin
  k := p ->> 'kind';
  les := (p ->> 'lessons')::int; vd := (p ->> 'validityDays')::int; pc := coalesce((p ->> 'priceCents')::int, 0); wl := (p ->> 'weeklyLimit')::int;
  act := coalesce((p ->> 'active')::boolean, true);
  select coalesce(array_agg(x), '{}') into tids from jsonb_array_elements_text(coalesce(p -> 'typeIds', '[]'::jsonb)) x;
  if length(trim(coalesce(p ->> 'name', ''))) = 0 or k not in ('pack', 'monthly') or vd is null or vd < 1 or pc < 0 or (k = 'pack' and coalesce(les, 0) < 1) then perform private.fail('invalid'); end if;
  if exists (select 1 from unnest(tids) t where t not in (select id from public.course_types)) then perform private.fail('invalid'); end if;
  if nullif(p ->> 'id', '') is not null then
    pid := (p ->> 'id')::uuid;
    update public.packs set name = trim(p ->> 'name'), kind = k, lessons = case when k = 'pack' then les end, validity_days = vd, price_cents = pc, type_ids = tids, weekly_limit = case when k = 'monthly' then wl end, active = act where id = pid;
    if found then return; end if;
  end if;
  insert into public.packs (name, kind, lessons, validity_days, price_cents, type_ids, weekly_limit, active)
  values (trim(p ->> 'name'), k, case when k = 'pack' then les end, vd, pc, tids, case when k = 'monthly' then wl end, act);
end $$;

-- Chiavi: cancelWindowHours, bookingHorizonDays, bookingCloseMinutes, waitlistEnabled.
create or replace function public.save_settings(p jsonb) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members := private.need_owner();
begin
  update public.settings set
    cancel_window_hours = coalesce((p ->> 'cancelWindowHours')::int, cancel_window_hours),
    booking_horizon_days = coalesce((p ->> 'bookingHorizonDays')::int, booking_horizon_days),
    booking_close_minutes = coalesce((p ->> 'bookingCloseMinutes')::int, booking_close_minutes),
    waitlist_enabled = coalesce((p ->> 'waitlistEnabled')::boolean, waitlist_enabled),
    generated_until = null
  where id = 1;
exception when check_violation or invalid_text_representation then
  perform private.fail('invalid');
end $$;

-- =========================================================================================== permessi
-- Le funzioni dell'app le possono chiamare solo gli utenti collegati; quelle interne nessuno.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.prokind = 'f' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
revoke all on schema private from public, anon, authenticated;

-- =========================================================================================== primo owner
-- Dopo che Valerio si è registrato dall'app con la sua email, eseguire (con la sua email vera):
--   update public.members set role = 'owner' where lower(email) = lower('EMAIL_DI_VALERIO');
