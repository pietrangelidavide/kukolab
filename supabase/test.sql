-- Prove dello schema. Ogni controllo è un assert: se fallisce, lo script si ferma con il nome della prova.
-- Le chiamate "come utente" passano da t.rpc / t.run / t.err: impostano utente e ruolo "authenticated" solo per quella chiamata.
create function t.as_user(who text) returns void language plpgsql as $$
begin
  perform set_config('test.uid', coalesce((select id::text from auth.users where email = who || '@example.com'), ''), false);
  execute 'set role authenticated';
end $$;
create function t.back() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('test.uid', '', false);
end $$;
-- chiamata che restituisce jsonb
create function t.rpc(who text, q text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform t.as_user(who);
  begin
    execute q into r;
  exception when others then
    perform t.back();
    raise;
  end;
  perform t.back();
  return r;
end $$;
-- chiamata senza risultato
create function t.run(who text, q text) returns void language plpgsql as $$
begin
  perform t.as_user(who);
  begin
    execute q;
  exception when others then
    perform t.back();
    raise;
  end;
  perform t.back();
end $$;
-- chiamata che deve fallire: restituisce il messaggio d'errore (o 'nessun errore')
create function t.err(who text, q text) returns text language plpgsql as $$
declare m text;
begin
  perform t.as_user(who);
  begin
    execute q;
    m := 'nessun errore';
  exception when others then
    m := sqlerrm;
  end;
  perform t.back();
  return m;
end $$;
create function t.uid(who text) returns uuid language sql as $$ select id from public.members where email = who || '@example.com' $$;

-- Le prove qui sotto creano gli account direttamente, senza iscrivere prima le persone: la guardia sulle registrazioni
-- (kuko_signup_guard) si spegne per questa parte e si riaccende, con le sue prove, in fondo.
alter table auth.users disable trigger kuko_signup_guard;

-- ------------------------------------------------------------------ persone, pacchetti
do $$
declare w text;
begin
  foreach w in array array['valerio', 'martina', 'luca', 'sara', 'anna'] loop
    insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values (w || '@example.com', jsonb_build_object('name', initcap(w) || ' Test', 'phone', '333'), now());
  end loop;
  assert (select count(*) from public.members) = 5, 'ogni utente diventa un iscritto';
  update public.members set role = 'owner' where email = 'valerio@example.com';

  perform t.run('valerio', $q$select public.save_pack(jsonb_build_object('name', 'Functional 10', 'kind', 'pack', 'lessons', 10, 'validityDays', 90, 'priceCents', 11000, 'typeIds', jsonb_build_array('functional'), 'active', true))$q$);
  perform t.run('valerio', $q$select public.save_pack(jsonb_build_object('name', 'Mensile Pilates', 'kind', 'monthly', 'validityDays', 30, 'priceCents', 9500, 'typeIds', jsonb_build_array('pilates'), 'weeklyLimit', 2, 'active', true))$q$);
  assert (select count(*) from public.packs) = 2, 'pacchetti creati';
  raise notice 'ok  setup';
end $$;

-- ------------------------------------------------------------------ permessi
do $$
declare e text;
begin
  e := t.err('martina', 'select * from public.bookings');
  assert e like 'permission denied%', 'le tabelle non si leggono direttamente: ' || e;
  e := t.err('martina', 'select * from public.members');
  assert e like 'permission denied%', 'members chiusa: ' || e;
  e := t.err('martina', 'insert into public.packs (name, kind, validity_days) values (''x'', ''pack'', 1)');
  assert e like 'permission denied%', 'scrittura diretta negata: ' || e;
  e := t.err('martina', 'select public.add_member(''Hack'', '''', '''')');
  assert e = 'forbidden', 'un cliente non usa le funzioni owner: ' || e;
  e := t.err('martina', 'select public.save_settings(''{"cancelWindowHours": 0}'')');
  assert e = 'forbidden', 'impostazioni solo owner: ' || e;
  e := t.err('martina', 'select public.cancel_session(gen_random_uuid())');
  assert e = 'forbidden', 'annullo lezione solo owner: ' || e;
  e := t.err('martina', 'select private.fail(''x'')');
  assert e like 'permission denied%', 'le funzioni interne sono chiuse: ' || e;

  execute 'set role anon';
  begin perform public.snapshot(); e := 'nessun errore'; exception when others then e := sqlerrm; end;
  execute 'reset role';
  assert e like 'permission denied%', 'anon non chiama nulla: ' || e;

  e := t.err('nessuno', 'select public.snapshot()');
  assert e = 'auth', 'senza utente: ' || e;
  raise notice 'ok  permessi';
end $$;

-- ------------------------------------------------------------------ prenotare, lista d'attesa, annulli
do $$
declare e text; r jsonb; fun uuid; far uuid; late uuid; soon uuid; b1 uuid; mm uuid := t.uid('martina'); ll uuid := t.uid('luca'); ss uuid := t.uid('sara'); pk uuid;
begin
  select id into pk from public.packs where name = 'Functional 10';
  perform t.run('valerio', $q$select public.add_session('functional', now() + interval '30 hours', 2, 50, 'Valerio', '')$q$);
  perform t.run('valerio', $q$select public.add_session('functional', now() + interval '5 hours', 4, 50, 'Valerio', '')$q$);
  perform t.run('valerio', $q$select public.add_session('functional', now() + interval '10 minutes', 4, 50, 'Valerio', '')$q$);
  perform t.run('valerio', $q$select public.add_session('functional', now() + interval '40 days', 4, 50, 'Valerio', '')$q$);
  foreach e in array array['martina', 'luca', 'sara'] loop
    perform t.run('valerio', format('select public.assign_pass(%L, %L, %L, '''')', t.uid(e), pk, (now() at time zone 'Europe/Rome')::date));
  end loop;
  select id into fun from public.sessions where starts_at between now() + interval '29 hours' and now() + interval '31 hours';
  select id into late from public.sessions where starts_at between now() + interval '4 hours' and now() + interval '6 hours';
  select id into soon from public.sessions where starts_at between now() + interval '5 minutes' and now() + interval '15 minutes';
  select id into far from public.sessions where starts_at > now() + interval '39 days';

  e := t.err('anna', format('select public.book_session(%L)', fun));
  assert e = 'no_pass', 'senza abbonamento: ' || e;

  r := t.rpc('martina', format('select public.book_session(%L)', fun));
  assert r ->> 'status' = 'booked', 'prenotata';
  assert (select credits_left from public.passes where member_id = mm) = 9, 'scala una lezione';

  e := t.err('martina', format('select public.book_session(%L)', fun));
  assert e = 'already_booked', 'doppia prenotazione: ' || e;
  e := t.err('martina', format('select public.book_session(%L)', soon));
  assert e = 'booking_closed', 'chiusa: ' || e;
  e := t.err('martina', format('select public.book_session(%L)', far));
  assert e = 'too_far', 'troppo lontana: ' || e;

  r := t.rpc('luca', format('select public.book_session(%L)', fun));
  assert r ->> 'status' = 'booked', 'luca dentro';
  r := t.rpc('sara', format('select public.book_session(%L)', fun));
  assert r ->> 'status' = 'waitlist', 'sara in attesa';
  assert (select credits_left from public.passes where member_id = ss) = 10, 'in attesa non scala nulla';

  r := t.rpc('sara', 'select public.snapshot()');
  assert jsonb_array_length(r -> 'bookings') = 1, 'sara vede solo la sua prenotazione';
  assert (r -> 'bookings' -> 0 ->> 'position')::int = 1, 'posizione 1 in lista';
  assert (r -> 'counts' -> fun::text ->> 'booked')::int = 2 and (r -> 'counts' -> fun::text ->> 'waitlist')::int = 1, 'conteggi';
  assert jsonb_array_length(r -> 'members') = 1 and not (r -> 'me' ? 'notes'), 'il cliente non vede altri iscritti né note';
  assert jsonb_array_length(r -> 'templates') = 0 and r -> 'passes' -> 0 ->> 'member_id' = ss::text, 'solo i suoi abbonamenti';
  assert not (r ? 'user_id') and not (r -> 'me' ? 'user_id'), 'niente id interni';

  -- annullo gratuito: rimborso e promozione
  select id into b1 from public.bookings where session_id = fun and member_id = mm;
  r := t.rpc('martina', format('select public.cancel_booking(%L)', b1));
  assert r ->> 'status' = 'cancelled' and (r ->> 'refunded')::boolean and (r ->> 'promoted')::int = 1, 'annullo gratis: ' || r::text;
  assert (select credits_left from public.passes where member_id = mm) = 10, 'rimborsata';
  assert (select status from public.bookings where session_id = fun and member_id = ss) = 'booked', 'sara promossa';
  assert (select credits_left from public.passes where member_id = ss) = 9, 'sara paga ora';
  assert exists (select 1 from public.notices where member_id = ss and kind = 'promoted'), 'avviso a sara';

  -- annullo tardivo: nessun rimborso
  perform t.rpc('luca', format('select public.book_session(%L)', late));
  select id into b1 from public.bookings where session_id = late and member_id = ll;
  r := t.rpc('luca', format('select public.cancel_booking(%L)', b1));
  assert r ->> 'status' = 'late_cancelled' and not (r ->> 'refunded')::boolean, 'annullo tardivo: ' || r::text;
  assert (select credits_left from public.passes where member_id = ll) = 8, 'lezione persa';

  -- un altro non può annullare la prenotazione altrui
  select id into b1 from public.bookings where session_id = fun and member_id = ss;
  e := t.err('luca', format('select public.cancel_booking(%L)', b1));
  assert e = 'forbidden', 'altrui: ' || e;

  -- l'owner può prenotare anche a lezione chiusa, e senza abbonamento solo se lo conferma
  r := t.rpc('valerio', format('select public.owner_book(%L, %L, true)', t.uid('anna'), soon));
  assert r ->> 'status' = 'booked', 'owner senza abbonamento';
  e := t.err('valerio', format('select public.owner_book(%L, %L, false)', t.uid('anna'), far));
  assert e = 'no_pass', 'owner senza conferma: ' || e;
  raise notice 'ok  prenotazioni';
end $$;

-- ------------------------------------------------------------------ sovrapposizioni, limite settimanale
do $$
declare e text; mon timestamptz; pk uuid; s1 uuid; s2 uuid; s3 uuid; s4 uuid; aa uuid := t.uid('anna');
begin
  -- lunedì prossimo alle 10:00 ora di Roma
  mon := ((date_trunc('week', (now() at time zone 'Europe/Rome') + interval '7 days'))::date + time '10:00') at time zone 'Europe/Rome';
  select id into pk from public.packs where name = 'Mensile Pilates';
  perform t.run('valerio', format('select public.add_session(''pilates'', %L, 4, 50, ''T'', '''')', mon));
  perform t.run('valerio', format('select public.add_session(''pilates'', %L, 4, 50, ''T'', '''')', mon + interval '1 day'));
  perform t.run('valerio', format('select public.add_session(''pilates'', %L, 4, 50, ''T'', '''')', mon + interval '2 days'));
  perform t.run('valerio', format('select public.add_session(''pilates'', %L, 4, 50, ''T'', '''')', mon + interval '1 day 20 minutes'));
  perform t.run('valerio', format('select public.assign_pass(%L, %L, %L, '''')', aa, pk, (mon at time zone 'Europe/Rome')::date - 1));
  select id into s1 from public.sessions where starts_at = mon;
  select id into s2 from public.sessions where starts_at = mon + interval '1 day';
  select id into s3 from public.sessions where starts_at = mon + interval '2 days';
  select id into s4 from public.sessions where starts_at = mon + interval '1 day 20 minutes';

  perform t.rpc('anna', format('select public.book_session(%L)', s1));
  perform t.rpc('anna', format('select public.book_session(%L)', s2));
  e := t.err('anna', format('select public.book_session(%L)', s4));
  assert e = 'overlap', 'sovrapposta: ' || e;
  e := t.err('anna', format('select public.book_session(%L)', s3));
  assert e = 'no_pass', 'limite di 2 a settimana: ' || e;
  raise notice 'ok  sovrapposizione e limite settimanale';
end $$;

-- ------------------------------------------------------------------ owner: modifica, annullo lezione
do $$
declare e text; r jsonb; fun uuid; before_s int; before_m int; ss uuid := t.uid('sara'); mm uuid := t.uid('martina');
begin
  select id into fun from public.sessions where starts_at between now() + interval '29 hours' and now() + interval '31 hours';
  -- 2 posti, occupati da luca e sara; martina rientra in lista
  perform t.rpc('martina', format('select public.book_session(%L)', fun));
  assert (select status from public.bookings where session_id = fun and member_id = mm and status = 'waitlist') = 'waitlist', 'martina in attesa';

  e := t.err('valerio', format('select public.edit_session(%L, ''{"capacity": 1}'')', fun));
  assert e = 'invalid', 'capienza sotto i prenotati: ' || e;
  r := t.rpc('valerio', format('select public.edit_session(%L, ''{"capacity": 3, "trainer": "Team"}'')', fun));
  assert (r ->> 'promoted')::int = 1, 'un posto in più fa entrare chi è in attesa: ' || r::text;
  assert (select status from public.bookings where session_id = fun and member_id = mm and status <> 'cancelled') = 'booked', 'martina entra';
  assert (select trainer from public.sessions where id = fun) = 'Team', 'istruttore cambiato';

  select credits_left into before_s from public.passes where member_id = ss;
  select credits_left into before_m from public.passes where member_id = mm;
  r := t.rpc('valerio', format('select public.cancel_session(%L)', fun));
  assert (r ->> 'affected')::int = 3, 'tre persone avvisate: ' || r::text;
  e := t.err('valerio', format('select public.cancel_session(%L)', fun));
  assert e = 'session_cancelled', 'già annullata: ' || e;
  assert (select credits_left from public.passes where member_id = ss) = before_s + 1, 'rimborso a sara';
  assert (select credits_left from public.passes where member_id = mm) = before_m + 1, 'rimborso a martina';
  assert (select count(*) from public.notices where kind = 'session_cancelled') = 3, 'tre avvisi';
  assert (select count(*) from public.bookings where session_id = fun and status = 'cancelled') = 4, 'prenotazioni annullate (comprese quelle di prima)';

  e := t.err('martina', format('select public.book_session(%L)', fun));
  assert e = 'session_cancelled', 'non si prenota una lezione annullata: ' || e;
  perform t.run('martina', 'select public.read_notices()');
  assert not exists (select 1 from public.notices where member_id = mm and not read), 'avvisi letti';
  raise notice 'ok  owner';
end $$;

-- ------------------------------------------------------------------ la lista d'attesa salta chi non può entrare
do $$
declare r jsonb; s uuid; b uuid; sp uuid; mm uuid := t.uid('martina'); ss uuid := t.uid('sara');
begin
  perform t.run('valerio', 'select public.add_session(''functional'', now() + interval ''50 hours'', 1, 50, ''V'', '''')');
  select id into s from public.sessions where starts_at between now() + interval '49 hours' and now() + interval '51 hours';
  perform t.rpc('martina', format('select public.book_session(%L)', s));
  r := t.rpc('sara', format('select public.book_session(%L)', s));
  assert r ->> 'status' = 'waitlist', 'sara in attesa';
  select id into sp from public.passes where member_id = ss;
  perform t.run('valerio', format('select public.adjust_credits(%L, -100)', sp));      -- sara resta senza lezioni
  select id into b from public.bookings where session_id = s and member_id = mm;
  r := t.rpc('martina', format('select public.cancel_booking(%L)', b));
  assert (r ->> 'promoted')::int = 0, 'sara non ha lezioni: non entra';
  assert (select status from public.bookings where session_id = s and member_id = ss) = 'waitlist', 'resta in lista';
  perform t.run('valerio', format('select public.adjust_credits(%L, 1)', sp));          -- ora ne ha una
  r := t.rpc('valerio', format('select public.edit_session(%L, ''{"trainer": "W"}'')', s));
  assert (r ->> 'promoted')::int = 1, 'quando può, entra: ' || r::text;
  assert (select credits_left from public.passes where id = sp) = 0, 'paga la lezione';
  raise notice 'ok  lista d''attesa';
end $$;

-- ------------------------------------------------------------------ presenze, crediti, schede, impostazioni
do $$
declare e text; b uuid; ll uuid := t.uid('luca'); pass uuid; p int; aa uuid := t.uid('anna'); soon uuid; mpass uuid;
begin
  select id into soon from public.sessions where starts_at between now() + interval '5 minutes' and now() + interval '15 minutes';
  select id into b from public.bookings where session_id = soon and member_id = aa;
  perform t.run('valerio', format('select public.set_attendance(%L, ''attended'')', b));
  assert (select status from public.bookings where id = b) = 'attended', 'presente';
  perform t.run('valerio', format('select public.set_attendance(%L, ''no_show'')', b));
  perform t.run('valerio', format('select public.set_attendance(%L, ''booked'')', b));
  e := t.err('valerio', format('select public.set_attendance(%L, ''boh'')', b));
  assert e = 'invalid', 'stato non valido: ' || e;

  select id, credits_left into pass, p from public.passes where member_id = ll order by created_at limit 1;
  perform t.run('valerio', format('select public.adjust_credits(%L, 3)', pass));
  assert (select credits_left from public.passes where id = pass) = p + 3 and (select credits_total from public.passes where id = pass) = greatest(10, p + 3), 'più crediti';
  perform t.run('valerio', format('select public.adjust_credits(%L, -100)', pass));
  assert (select credits_left from public.passes where id = pass) = 0, 'mai sotto zero';
  select id into mpass from public.passes where kind = 'monthly' limit 1;
  e := t.err('valerio', format('select public.adjust_credits(%L, 1)', mpass));
  assert e = 'invalid', 'i mensili non hanno crediti: ' || e;

  perform t.run('valerio', 'select public.add_member(''Giulia Nuova'', ''Giulia@Example.com '', ''333 1'')');
  assert (select email from public.members where name = 'Giulia Nuova') = 'giulia@example.com', 'email normalizzata';
  perform t.run('valerio', format('select public.save_member(%L, ''Giulia Nuova'', ''giulia@example.com'', ''333 2'', ''Note private'')', (select id from public.members where name = 'Giulia Nuova')));
  assert (select notes from public.members where name = 'Giulia Nuova') = 'Note private', 'note salvate';
  e := t.err('valerio', 'select public.add_member(''   '', '''', '''')');
  assert e = 'invalid', 'nome vuoto: ' || e;

  perform t.run('valerio', 'select public.save_settings(''{"cancelWindowHours": 6, "bookingHorizonDays": 21, "bookingCloseMinutes": 30, "waitlistEnabled": false}'')');
  assert (select cancel_window_hours from public.settings) = 6 and not (select waitlist_enabled from public.settings), 'impostazioni';
  e := t.err('valerio', 'select public.save_settings(''{"cancelWindowHours": 500}'')');
  assert e = 'invalid', 'fuori limite: ' || e;
  perform t.run('valerio', 'select public.save_settings(''{"cancelWindowHours": 12, "bookingHorizonDays": 14, "bookingCloseMinutes": 15, "waitlistEnabled": true}'')');

  assert not ((t.rpc('luca', 'select public.snapshot()') -> 'me') ? 'notes'), 'note nascoste al cliente';
  raise notice 'ok  presenze, crediti, schede';
end $$;

-- ------------------------------------------------------------------ orario settimanale
do $$
declare r jsonb; tid uuid; n int; n2 int; sid uuid; ll uuid := t.uid('luca'); e text; wd int := extract(isodow from (now() at time zone 'Europe/Rome') + interval '3 days')::int;
begin
  r := t.rpc('valerio', format('select public.save_template(jsonb_build_object(''id'', '''', ''typeId'', ''pilates'', ''weekday'', %s, ''time'', ''18:30'', ''capacity'', 4, ''duration'', 50, ''trainer'', ''Team'', ''active'', true))', wd));
  assert (r ->> 'created')::int >= 2, 'crea le lezioni delle prossime settimane: ' || r::text;
  select id into tid from public.templates;
  select count(*) into n from public.sessions where template_id = tid;
  assert (select count(*) from public.sessions where template_id = tid and (starts_at at time zone 'Europe/Rome')::time = time '18:30') = n, 'ore di Roma';
  assert (select count(*) from public.sessions where template_id = tid and extract(isodow from starts_at at time zone 'Europe/Rome') = wd) = n, 'giorno giusto';

  r := t.rpc('valerio', format('select public.save_template(jsonb_build_object(''id'', %L, ''typeId'', ''pilates'', ''weekday'', %s, ''time'', ''18:30'', ''capacity'', 4, ''duration'', 50, ''trainer'', ''Team'', ''active'', true))', tid, wd));
  select count(*) into n2 from public.sessions where template_id = tid;
  assert n2 = n, 'rifare non duplica: ' || n || ' / ' || n2;

  -- una lezione con una prenotazione resta anche se spengo la riga
  select id into sid from public.sessions where template_id = tid order by starts_at limit 1;
  perform t.run('valerio', format('select public.owner_book(%L, %L, true)', ll, sid));
  r := t.rpc('valerio', format('select public.save_template(jsonb_build_object(''id'', %L, ''typeId'', ''pilates'', ''weekday'', %s, ''time'', ''18:30'', ''capacity'', 4, ''duration'', 50, ''trainer'', ''Team'', ''active'', false))', tid, wd));
  assert (r ->> 'removed')::int = n - 1, 'toglie solo le lezioni vuote: ' || r::text;
  assert exists (select 1 from public.sessions where id = sid), 'resta quella con prenotati';

  e := t.err('valerio', 'select public.save_template(''{"typeId": "pilates", "weekday": 9, "time": "10:00", "capacity": 4}'')');
  assert e = 'invalid', 'giorno non valido: ' || e;
  e := t.err('valerio', 'select public.save_template(''{"typeId": "pilates", "weekday": 2, "time": "boh", "capacity": 4}'')');
  assert e = 'invalid', 'ora non valida: ' || e;
  e := t.err('valerio', 'select public.save_template(''{"typeId": "yoga", "weekday": 2, "time": "10:00", "capacity": 4}'')');
  assert e = 'invalid', 'corso inesistente: ' || e;

  perform t.run('valerio', format('select public.delete_template(%L)', tid));
  assert not exists (select 1 from public.templates), 'riga eliminata';
  assert exists (select 1 from public.sessions where id = sid and template_id is null), 'la lezione con prenotati resta, scollegata';

  -- le lezioni future si creano da sole quando si apre l'app
  update public.settings set generated_until = null;
  insert into public.templates (type_id, weekday, time, capacity, duration, trainer) values ('functional', wd, '07:30', 8, 50, 'V');
  perform t.rpc('luca', 'select public.snapshot()');
  assert exists (select 1 from public.sessions s join public.templates t2 on t2.id = s.template_id where t2.time = time '07:30'), 'ensure_sessions genera';
  raise notice 'ok  orario settimanale';
end $$;

-- ------------------------------------------------------------------ istantanea dell'owner
do $$
declare r jsonb;
begin
  r := t.rpc('valerio', 'select public.snapshot()');
  assert jsonb_array_length(r -> 'members') >= 6 and r -> 'counts' = 'null'::jsonb, 'l''owner vede tutti, i conteggi li calcola da solo';
  assert jsonb_array_length(r -> 'bookings') >= 6 and jsonb_array_length(r -> 'packs') = 2, 'prenotazioni e pacchetti';
  assert (r -> 'me' ->> 'role') = 'owner', 'ruolo owner';
  assert exists (select 1 from jsonb_array_elements(r -> 'members') m where m ->> 'notes' = 'Note private'), 'l''owner vede le note';
  raise notice 'ok  snapshot owner';
end $$;

-- ------------------------------------------------------------------ Segreteria, Trainer e incassi
do $$
declare r jsonb; e text; q text; n int; sm uuid; se uuid; sx uuid; sn uuid; bm uuid; be uuid; bs uuid; mid uuid; pay uuid; marco uuid; stf uuid;
        ll uuid := t.uid('luca'); aa uuid := t.uid('anna'); sa uuid := t.uid('sara'); pk uuid; pk_off uuid; nobody text := '00000000-0000-0000-0000-000000000000';
        day4 timestamptz := date_trunc('day', now()) + interval '4 days 3 hours';
begin
  -- il team lo crea solo l'owner, con un'email vera e un ruolo ammesso
  assert t.err('luca', $q$select public.add_team_member('Segreteria', 'segreteria@example.com', 'staff')$q$) = 'forbidden', 'un iscritto non crea il team';
  assert t.err('valerio', $q$select public.add_team_member('Segreteria', 'non-una-email', 'staff')$q$) = 'invalid', 'serve un''email vera';
  assert t.err('valerio', $q$select public.add_team_member('Boss', 'boss@example.com', 'owner')$q$) = 'invalid', 'owner non si crea da qui';
  assert t.err('valerio', $q$select public.add_team_member('Valerio', 'valerio@example.com', 'trainer')$q$) = 'email_in_use', 'l''owner non diventa Trainer';
  perform t.rpc('valerio', $q$select public.add_team_member('Segreteria', ' Segreteria@Example.com ', 'staff')$q$);
  perform t.rpc('valerio', $q$select public.add_team_member('Marco Rossi', 'marco@example.com', 'trainer', '333 111')$q$);
  perform t.rpc('valerio', $q$select public.add_team_member('Elena Bianchi', 'elena@example.com', 'trainer')$q$);
  assert t.err('valerio', $q$select public.add_team_member('Altra Segreteria', 'altra@example.com', 'staff')$q$) = 'staff_exists', 'la Segreteria è una sola';
  begin
    insert into public.members (name, email, role) values ('Seconda', 'seconda@example.com', 'staff');
    assert false, 'il database ammette due Segreterie';
  exception when unique_violation then null;
  end;
  assert (select email from public.members where role = 'staff') = 'segreteria@example.com', 'email normalizzata';
  -- il primo accesso collega l'account alla scheda del team (non se ne crea un'altra)
  insert into auth.users (email, email_confirmed_at) values ('segreteria@example.com', now()), ('marco@example.com', now()), ('elena@example.com', now());
  assert (select count(*) from public.members where role in ('staff', 'trainer') and user_id is not null) = 3, 'tre account del team collegati';
  assert (select count(*) from public.members where lower(email) = 'marco@example.com') = 1, 'nessun doppione';

  -- a quali lezioni è abbinato un Trainer: stesso nome o solo il nome di battesimo, senza badare a maiuscole e spazi
  insert into public.sessions (type_id, starts_at, capacity, trainer) values ('functional', day4 + interval '1 hour', 8, 'Marco') returning id into sm;
  insert into public.sessions (type_id, starts_at, capacity, trainer) values ('pilates', day4 + interval '3 hours', 4, '  ELENA   bianchi ') returning id into se;
  insert into public.sessions (type_id, starts_at, capacity, trainer) values ('functional', day4 + interval '5 hours', 8, 'Marcos') returning id into sx;
  assert (select private.teaches(m, x) from public.members m, public.sessions x where m.email = 'marco@example.com' and x.id = sm), 'il nome di battesimo basta';
  assert (select private.teaches(m, x) from public.members m, public.sessions x where m.email = 'elena@example.com' and x.id = se), 'maiuscole e spazi non contano';
  assert not (select private.teaches(m, x) from public.members m, public.sessions x where m.email = 'marco@example.com' and x.id = sx), 'un altro nome non vale';
  assert not (select private.teaches(m, x) from public.members m, public.sessions x where m.email = 'marco@example.com' and x.id = se), 'non le lezioni di un altro';
  assert not (select private.teaches(m, x) from public.members m, public.sessions x where m.email = 'luca@example.com' and x.id = sm), 'un iscritto non tiene lezioni';
  insert into public.sessions (type_id, starts_at, capacity, trainer) values ('functional', day4 + interval '7 hours', 8, '') returning id into sn;
  assert not (select private.teaches(m, x) from public.members m, public.sessions x where m.email = 'marco@example.com' and x.id = sn), 'senza istruttore non è di nessuno';

  perform t.run('valerio', format('select public.owner_book(%L, %L, true)', ll, sm));
  perform t.run('valerio', format('select public.owner_book(%L, %L, true)', aa, se));
  perform t.run('valerio', format('select public.owner_book(%L, %L, true)', sa, sx));
  select id into bm from public.bookings where session_id = sm and member_id = ll;
  select id into be from public.bookings where session_id = se and member_id = aa;
  select id into pk from public.packs where name = 'Functional 10';

  -- ---- Trainer
  r := t.rpc('marco', 'select public.snapshot()');
  assert (r -> 'me' ->> 'role') = 'trainer' and not (r -> 'me' ? 'notes'), 'ruolo Trainer';
  assert exists (select 1 from jsonb_array_elements(r -> 'sessions') x where x ->> 'id' = sm::text), 'vede la sua lezione';
  assert not exists (select 1 from jsonb_array_elements(r -> 'sessions') x where x ->> 'trainer' <> 'Marco'), 'solo le sue lezioni';
  assert jsonb_array_length(r -> 'bookings') = 1, 'solo chi è iscritto alle sue lezioni';
  assert not exists (select 1 from jsonb_array_elements(r -> 'members') m where m ? 'email' or m ? 'phone' or m ? 'notes'), 'dei partecipanti solo il nome';
  assert exists (select 1 from jsonb_array_elements(r -> 'members') m where m ->> 'name' like 'Luca%'), 'il partecipante c''è';
  assert not exists (select 1 from jsonb_array_elements(r -> 'members') m where m ->> 'id' in (aa::text, sa::text)), 'non gli iscritti ad altre lezioni';
  assert r -> 'leads' = '[]'::jsonb and r -> 'templates' = '[]'::jsonb and r -> 'passes' = '[]'::jsonb and r -> 'payments' = '[]'::jsonb and r -> 'notices' = '[]'::jsonb, 'niente richieste, orario, abbonamenti, incassi';
  perform t.run('marco', format('select public.set_attendance(%L, ''attended'')', bm));
  assert (select status from public.bookings where id = bm) = 'attended', 'segna la presenza';
  perform t.run('marco', format('select public.set_attendance(%L, ''no_show'')', bm));
  assert t.err('marco', format('select public.set_attendance(%L, ''attended'')', be)) = 'forbidden', 'non le presenze di un altro';
  assert t.err('marco', format('select public.cancel_booking(%L)', be)) = 'forbidden', 'non annulla prenotazioni altrui';
  select id into bs from public.bookings where session_id = sx and member_id = sa;
  assert t.err('elena', format('select public.set_attendance(%L, ''attended'')', bm)) = 'forbidden', 'nemmeno l''altro Trainer';
  assert t.err('luca', format('select public.set_attendance(%L, ''attended'')', bm)) = 'forbidden', 'un iscritto non segna presenze';

  -- ---- tutto quello che né il Trainer né la Segreteria possono fare
  foreach q in array array[
    format('select public.edit_session(%L, ''{"trainer": "Io"}'')', sm),
    format('select public.cancel_session(%L)', sm),
    format('select public.add_session(''functional'', now() + interval ''9 days'', 8, 50, ''Io'')'),
    'select public.save_template(''{"typeId": "functional", "weekday": 2, "time": "10:00", "capacity": 4}'')',
    format('select public.delete_template(%L)', nobody),
    'select public.save_pack(''{"name": "X", "kind": "pack", "lessons": 1, "validityDays": 5}'')',
    format('select public.adjust_credits(%L, 1)', nobody),
    'select public.save_settings(''{"cancelWindowHours": 1}'')',
    format('select public.save_lead(%L, ''done'')', nobody),
    format('select public.delete_lead(%L)', nobody),
    format('select public.void_payment(%L)', nobody),
    'select public.add_team_member(''X'', ''x@example.com'', ''trainer'')',
    format('select public.remove_team_member(%L)', nobody)
  ] loop
    assert t.err('marco', q) = 'forbidden', 'Trainer: ' || q;
    assert t.err('segreteria', q) = 'forbidden', 'Segreteria: ' || q;
  end loop;
  foreach q in array array[
    format('select public.owner_book(%L, %L, true)', sa, sm),
    'select public.add_member(''Y'', ''y@example.com'', '''')',
    format('select public.save_member(%L, ''Y'', '''', '''', '''')', ll),
    format('select public.assign_pass(%L, %L, current_date, '''', 100, ''cash'')', ll, pk),
    format('select public.add_payment(%L, 100, ''cash'')', ll)
  ] loop
    assert t.err('marco', q) = 'forbidden', 'Trainer: ' || q;
  end loop;

  -- ---- Segreteria: cosa vede
  insert into public.payments (member_id, amount_cents, method, paid_at, by_name) values (ll, 9500, 'cash', now() - interval '3 days', 'Valerio');
  r := t.rpc('segreteria', 'select public.snapshot()');
  assert (r -> 'me' ->> 'role') = 'staff', 'ruolo Segreteria';
  assert not exists (select 1 from jsonb_array_elements(r -> 'members') m where m ? 'notes'), 'senza le note degli iscritti';
  assert not exists (select 1 from jsonb_array_elements(r -> 'members') m where m ->> 'role' <> 'client' and m ->> 'email' <> 'segreteria@example.com'), 'né owner né Trainer tra gli iscritti';
  assert jsonb_array_length(r -> 'members') >= 6 and jsonb_array_length(r -> 'bookings') >= 6 and jsonb_array_length(r -> 'passes') >= 1, 'vede iscritti, prenotazioni, abbonamenti';
  assert r -> 'leads' = '[]'::jsonb and r -> 'templates' = '[]'::jsonb and r -> 'counts' = 'null'::jsonb, 'niente richieste dal sito né orario';
  assert r -> 'payments' = '[]'::jsonb, 'gli incassi di giorni passati non li vede';

  -- ---- Segreteria: cosa fa
  perform t.run('segreteria', format('select public.owner_book(%L, %L, true)', ll, sx));
  assert exists (select 1 from public.bookings where session_id = sx and member_id = ll and status = 'booked'), 'prenota al banco';
  perform t.run('segreteria', format('select public.set_attendance(%L, ''attended'')', bs));
  assert (select status from public.bookings where id = bs) = 'attended', 'segna presenze';
  perform t.run('segreteria', format('select public.set_attendance(%L, ''booked'')', bs));
  perform t.run('segreteria', format('select public.cancel_booking(%L)', bs));
  assert (select status from public.bookings where id = bs) = 'cancelled', 'annulla per un iscritto';

  r := t.rpc('segreteria', $q$select public.add_member('Nuovo Cliente', 'Nuovo.Cliente@example.com', '333 000')$q$);
  mid := (r ->> 'memberId')::uuid;
  assert (select role from public.members where id = mid) = 'client' and (select email from public.members where id = mid) = 'nuovo.cliente@example.com', 'iscrive un cliente';
  perform t.run('segreteria', format('select public.save_member(%L, ''Giulia Corretta'', ''giulia@example.com'', ''333 7'', ''scritto dal banco'')', (select id from public.members where notes = 'Note private')));
  assert (select name from public.members where notes = 'Note private') = 'Giulia Corretta', 'corregge i dati';
  assert exists (select 1 from public.members where name = 'Giulia Corretta' and notes = 'Note private'), 'le note restano dell''owner';
  perform t.run('valerio', format('select public.save_member(%L, ''Giulia Nuova'', ''giulia@example.com'', ''333 2'', ''Note private'')', (select id from public.members where name = 'Giulia Corretta')));
  assert t.err('segreteria', format('select public.save_member(%L, ''Valerio'', ''valerio@example.com'', '''', '''')', t.uid('valerio'))) = 'forbidden', 'non tocca l''owner';
  assert t.err('segreteria', format('select public.save_member(%L, ''Marco'', ''marco@example.com'', '''', '''')', (select id from public.members where role = 'trainer' limit 1))) = 'forbidden', 'né il team';

  -- vendita con incasso
  perform t.run('valerio', 'select public.save_pack(jsonb_build_object(''name'', ''Vecchio'', ''kind'', ''pack'', ''lessons'', 5, ''validityDays'', 30, ''priceCents'', 5000, ''active'', false))');
  select id into pk_off from public.packs where name = 'Vecchio';
  assert t.err('segreteria', format('select public.assign_pass(%L, %L, current_date)', mid, pk)) = 'invalid', 'la Segreteria registra sempre l''incasso';
  assert t.err('segreteria', format('select public.assign_pass(%L, %L, current_date, '''', 11000, ''bitcoin'')', mid, pk)) = 'invalid', 'metodo non ammesso';
  assert t.err('segreteria', format('select public.assign_pass(%L, %L, current_date, '''', -5, ''cash'')', mid, pk)) = 'invalid', 'importo negativo';
  assert t.err('segreteria', format('select public.assign_pass(%L, %L, current_date, '''', 5000, ''cash'')', mid, pk_off)) = 'invalid', 'solo pacchetti attivi';
  assert (select count(*) from public.passes where member_id = mid) = 0 and (select count(*) from public.payments) = 1, 'nulla è stato registrato per metà';
  perform t.run('segreteria', format('select public.assign_pass(%L, %L, current_date, ''al banco'', 11000, ''cash'')', mid, pk));
  assert (select count(*) from public.passes where member_id = mid) = 1, 'abbonamento venduto';
  assert exists (select 1 from public.payments y where y.member_id = mid and y.amount_cents = 11000 and y.method = 'cash' and y.by_name = 'Segreteria' and y.pass_id = (select id from public.passes where member_id = mid)), 'incasso collegato all''abbonamento';
  perform t.run('segreteria', format('select public.assign_pass(%L, %L, current_date, ''omaggio'', 0, ''other'')', mid, pk));
  assert exists (select 1 from public.payments y where y.member_id = mid and y.amount_cents = 0), 'l''omaggio si registra a zero';
  perform t.run('segreteria', format('select public.add_payment(%L, 2500, ''card'', ''Quota iscrizione'')', mid));
  assert t.err('segreteria', format('select public.add_payment(%L, 0, ''card'')', mid)) = 'invalid', 'un incasso a zero non ha senso';
  assert t.err('segreteria', format('select public.add_payment(%L, 100, ''assegno'')', mid)) = 'invalid', 'metodo non ammesso';
  assert t.err('segreteria', format('select public.add_payment(%L, 100, ''cash'')', t.uid('valerio'))) = 'member_not_found', 'non per l''owner';
  r := t.rpc('segreteria', 'select public.snapshot()');
  assert jsonb_array_length(r -> 'payments') = 3, 'vede gli incassi di oggi: ' || jsonb_array_length(r -> 'payments');

  -- ---- owner: tutto, e lo storno
  r := t.rpc('valerio', 'select public.snapshot()');
  assert jsonb_array_length(r -> 'payments') = 4, 'l''owner vede anche quelli dei giorni scorsi';
  perform t.run('valerio', format('select public.assign_pass(%L, %L, current_date)', mid, pk));
  assert (select count(*) from public.payments) = 4, 'senza importo non si registra nessun incasso';
  select id into pay from public.payments where amount_cents = 2500;
  perform t.run('valerio', format('select public.void_payment(%L)', pay));
  assert (select voided_at from public.payments where id = pay) is not null, 'stornato';
  perform t.run('valerio', format('select public.void_payment(%L, false)', pay));
  assert (select voided_at from public.payments where id = pay) is null, 'ripristinato';
  assert t.err('valerio', format('select public.void_payment(%L)', nobody)) = 'payment_not_found', 'incasso inesistente';

  -- ---- togliere dal team
  assert t.err('valerio', format('select public.remove_team_member(%L)', ll)) = 'member_not_found', 'un iscritto non è del team';
  select id into marco from public.members where email = 'marco@example.com';
  r := t.rpc('valerio', format('select public.remove_team_member(%L)', marco));
  assert (r ->> 'kept') = 'false' and not exists (select 1 from public.members where id = marco), 'senza storia la scheda sparisce';
  assert t.err('marco', 'select public.snapshot()') = 'auth', 'e l''accesso con essa';
  perform t.rpc('valerio', $q$select public.add_team_member('Marco Rossi', 'marco@example.com', 'trainer')$q$);
  assert (select user_id from public.members where email = 'marco@example.com') = (select id from auth.users where email = 'marco@example.com'), 'riaggiunto: si ricollega al suo account';
  assert (t.rpc('marco', 'select public.snapshot()') -> 'me' ->> 'role') = 'trainer', 'e può entrare';
  -- chi era già iscritto diventa del team senza perdere nulla, e se viene tolto torna iscritto
  perform t.rpc('valerio', $q$select public.add_team_member('Anna Rossi', 'anna@example.com', 'trainer')$q$);
  assert (select role from public.members where id = aa) = 'trainer' and exists (select 1 from public.bookings where member_id = aa), 'una scheda esistente passa al team';
  r := t.rpc('valerio', format('select public.remove_team_member(%L)', aa));
  assert (r ->> 'kept') = 'true' and (select role from public.members where id = aa) = 'client', 'con storia torna iscritta';
  select id into stf from public.members where role = 'staff';
  r := t.rpc('valerio', format('select public.remove_team_member(%L)', stf));
  assert (r ->> 'kept') = 'false' and not exists (select 1 from public.members where role = 'staff'), 'tolta la Segreteria';
  assert (select count(*) from public.payments where by_name = 'Segreteria') = 3 and not exists (select 1 from public.payments where created_by = stf), 'gli incassi restano, col nome di chi li ha registrati';
  perform t.rpc('valerio', $q$select public.add_team_member('Segreteria', 'segreteria@example.com', 'staff')$q$);
  assert (t.rpc('segreteria', 'select public.snapshot()') -> 'me' ->> 'role') = 'staff', 'si può rimettere una nuova Segreteria';
  raise notice 'ok  Segreteria, Trainer e incassi';
end $$;

-- ------------------------------------------------------------------ collegamento account ↔ iscritto
do $$
declare before_n int; gid uuid; uid uuid;
begin
  select id into gid from public.members where name = 'Giulia Nuova';
  select count(*) into before_n from public.members;
  -- email non confermata: non si prende la scheda di Giulia e non se ne crea una seconda (l'owner non vede doppioni)
  insert into auth.users (email, raw_user_meta_data) values ('giulia@example.com', '{"name": "Giulia"}') returning id into uid;
  assert (select user_id from public.members where id = gid) is null, 'non si collega prima della conferma';
  assert (select count(*) from public.members) = before_n, 'nessun profilo provvisorio per chi è già iscritto';
  -- conferma: la scheda dell'owner si collega all'account
  update auth.users set email_confirmed_at = now() where id = uid;
  assert (select user_id from public.members where id = gid) = uid, 'collegato dopo la conferma';
  assert (select count(*) from public.members) = before_n, 'ancora nessun doppione';
  assert (select name from public.members where id = gid) = 'Giulia Nuova', 'resta la scheda dell''owner';
  raise notice 'ok  collegamento dopo conferma';
end $$;

do $$
declare mid uuid; uid uuid; n int;
begin
  insert into public.members (name, email) values ('Paolo Prima', 'paolo@example.com') returning id into mid;
  select count(*) into n from public.members;
  insert into auth.users (email, email_confirmed_at) values ('Paolo@example.com', now()) returning id into uid;
  assert (select user_id from public.members where id = mid) = uid and (select count(*) from public.members) = n, 'email confermata: si collega subito';
  raise notice 'ok  collegamento immediato';
end $$;

-- ------------------------------------------------------------------ profilo
do $$
begin
  perform t.run('anna', 'select public.update_profile(''  Anna Rossi '', '' 333 999 '')');
  assert (select name from public.members where email = 'anna@example.com') = 'Anna Rossi' and (select phone from public.members where email = 'anna@example.com') = '333 999', 'profilo aggiornato';
  assert t.err('anna', 'select public.update_profile(''  '', '''')') = 'invalid', 'nome vuoto rifiutato';
  raise notice 'ok  profilo';
end $$;

-- ------------------------------------------------------------------ richieste dal sito (prova gratuita, nutrizionista)
create function t.anon_err(q text) returns text language plpgsql as $$
declare m text;
begin
  execute 'set role anon';
  begin
    execute q;
    m := 'nessun errore';
  exception when others then
    m := sqlerrm;
  end;
  execute 'reset role';
  return m;
end $$;

do $$
declare e text; r jsonb; lid uuid; n int;
begin
  delete from public.leads;
  -- chi non ha un account può mandare una richiesta, e solo quella
  e := t.anon_err($q$select public.submit_lead('{"topic":"functional","name":"  Elena   Bianchi ","phone":"+39 333 111 2222","email":"Elena@Example.com","slots":["sera","sera","boh"],"note":"ciao","consent":true}'::jsonb)$q$);
  assert e = 'nessun errore', 'anon può mandare una richiesta: ' || e;
  assert (select count(*) from public.leads) = 1, 'richiesta salvata';
  assert (select name from public.leads) = 'Elena Bianchi' and (select email from public.leads) = 'elena@example.com' and (select kind from public.leads) = 'trial', 'dati puliti e tipo prova';
  assert (select slots from public.leads) = array['sera'], 'solo fasce valide, senza doppioni';
  assert t.anon_err('select * from public.leads') like 'permission denied%', 'anon non legge le richieste';
  assert t.anon_err('select public.save_lead(gen_random_uuid(), ''done'', ''x'')') like 'permission denied%', 'anon non gestisce le richieste';
  assert t.anon_err('select public.delete_lead(gen_random_uuid())') like 'permission denied%', 'anon non cancella';
  assert t.anon_err('select public.snapshot()') like 'permission denied%', 'anon non vede lo snapshot';

  -- stessa persona, stesso argomento, stessi dieci minuti: vale la prima (anche scritto senza +39)
  perform t.anon_err($q$select public.submit_lead('{"topic":"functional","name":"Elena Bianchi","phone":"3331112222","consent":true}'::jsonb)$q$);
  assert (select count(*) from public.leads) = 1, 'doppia richiesta scartata';
  -- argomento diverso: è un'altra richiesta (e il nutrizionista ha il suo tipo)
  perform t.anon_err($q$select public.submit_lead('{"topic":"nutrition","name":"Elena Bianchi","phone":"3331112222","consent":true}'::jsonb)$q$);
  assert (select count(*) from public.leads) = 2 and exists (select 1 from public.leads where kind = 'nutrition' and topic = 'nutrition'), 'consulenza nutrizionale';

  -- dati sbagliati
  assert t.anon_err($q$select public.submit_lead('{"topic":"functional","name":"E","phone":"3331112222","consent":true}'::jsonb)$q$) = 'invalid', 'nome troppo corto';
  assert t.anon_err($q$select public.submit_lead('{"topic":"functional","name":"Elena","phone":"12","consent":true}'::jsonb)$q$) = 'invalid', 'telefono troppo corto';
  assert t.anon_err($q$select public.submit_lead('{"topic":"functional","name":"Elena","phone":"3331112222","email":"nonmail","consent":true}'::jsonb)$q$) = 'invalid', 'email sbagliata';
  assert t.anon_err($q$select public.submit_lead('{"topic":"zumba","name":"Elena","phone":"3331112222","consent":true}'::jsonb)$q$) = 'invalid', 'argomento sconosciuto';
  assert t.anon_err($q$select public.submit_lead('{"topic":"pilates","name":"Elena","phone":"3331112222"}'::jsonb)$q$) = 'invalid', 'senza consenso';
  assert t.anon_err($q$select public.submit_lead('{"topic":"pilates","name":"Elena","phone":"3331112222","consent":"forse"}'::jsonb)$q$) = 'invalid', 'consenso non valido';
  assert (select count(*) from public.leads) = 2, 'nessuna richiesta sbagliata salvata';

  -- trappola per i bot: sembra riuscita ma non salva nulla
  e := t.anon_err($q$select public.submit_lead('{"topic":"pilates","name":"Bot Bot","phone":"3339998888","consent":true,"website":"http://spam"}'::jsonb)$q$);
  assert e = 'nessun errore' and (select count(*) from public.leads) = 2, 'bot scartato in silenzio';

  -- cliente: nessun accesso. Owner: vede e gestisce
  assert t.err('martina', 'select public.save_lead(gen_random_uuid(), ''done'', ''x'')') = 'forbidden', 'cliente non gestisce le richieste';
  assert t.err('martina', 'select public.delete_lead(gen_random_uuid())') = 'forbidden', 'cliente non cancella le richieste';
  assert jsonb_array_length(t.rpc('martina', 'select public.snapshot()') -> 'leads') = 0, 'il cliente non vede le richieste';
  r := t.rpc('valerio', 'select public.snapshot()');
  assert jsonb_array_length(r -> 'leads') = 2, 'l''owner vede le richieste';
  assert (r -> 'leads' -> 0 ->> 'status') = 'new' and (r -> 'leads' -> 0 ->> 'created_at') is not null, 'stato iniziale';
  select id into lid from public.leads where kind = 'trial';
  perform t.run('valerio', format('select public.save_lead(%L, ''contacted'', ''Richiamata, viene giovedì'')', lid));
  assert (select status from public.leads where id = lid) = 'contacted' and (select owner_note from public.leads where id = lid) = 'Richiamata, viene giovedì' and (select updated_at from public.leads where id = lid) is not null, 'stato e nota salvati';
  perform t.run('valerio', format('select public.save_lead(%L, ''scheduled'')', lid));
  assert (select owner_note from public.leads where id = lid) = 'Richiamata, viene giovedì', 'la nota non si perde se si cambia solo lo stato';
  assert t.err('valerio', format('select public.save_lead(%L, ''boh'')', lid)) = 'invalid', 'stato sconosciuto';
  assert t.err('valerio', 'select public.save_lead(gen_random_uuid(), ''done'')') = 'lead_not_found', 'richiesta inesistente';
  perform t.run('valerio', format('select public.delete_lead(%L)', lid));
  assert (select count(*) from public.leads) = 1 and t.err('valerio', format('select public.delete_lead(%L)', lid)) = 'lead_not_found', 'cancellata';

  -- si tengono 12 mesi: le più vecchie spariscono
  insert into public.leads (kind, topic, name, phone, created_at) values ('trial', 'pt', 'Vecchia Richiesta', '3330000000', now() - interval '13 months');
  r := t.rpc('valerio', 'select public.snapshot()');
  assert jsonb_array_length(r -> 'leads') = 1 and not exists (select 1 from public.leads where name = 'Vecchia Richiesta'), 'richieste vecchie cancellate';

  -- freno generale: 30 richieste in un'ora e poi basta
  delete from public.leads;
  for n in 1..30 loop
    insert into public.leads (kind, topic, name, phone) values ('trial', 'pt', 'Prova ' || n, '34000000' || lpad(n::text, 2, '0'));
  end loop;
  e := t.anon_err($q$select public.submit_lead('{"topic":"pilates","name":"Elena","phone":"3351234567","consent":true}'::jsonb)$q$);
  assert e = 'busy', 'troppe richieste in un''ora: ' || e;
  delete from public.leads;

  -- un socio chiede la consulenza dall'app: i dati vengono dal suo profilo e la richiesta è segnata "app"
  assert t.anon_err($q$select public.request_consult('nutrition')$q$) like 'permission denied%', 'anon non usa request_consult';
  assert t.err('martina', $q$select public.request_consult('nutrition')$q$) = 'invalid', 'senza un telefono valido nel profilo non parte';
  update public.members set phone = '+39 333 555 6677' where email = 'martina@example.com';
  perform t.run('martina', $q$select public.request_consult('nutrition', 'vorrei un piano per la gara')$q$);
  assert (select count(*) from public.leads) = 1, 'richiesta del socio salvata';
  assert (select source from public.leads) = 'app' and (select kind from public.leads) = 'nutrition' and (select note from public.leads) = 'vorrei un piano per la gara', 'segnata come app';
  assert (select name from public.leads) = 'Martina Test' and (select phone from public.leads) = '+39 333 555 6677' and (select email from public.leads) = 'martina@example.com', 'dati dal profilo';
  perform t.run('martina', $q$select public.request_consult('nutrition')$q$);
  assert (select count(*) from public.leads) = 1, 'doppia richiesta dello stesso socio scartata';
  assert t.err('martina', $q$select public.request_consult('zumba')$q$) = 'invalid', 'argomento sconosciuto';
  r := t.rpc('valerio', 'select public.snapshot()');
  assert jsonb_array_length(r -> 'leads') = 1 and (r -> 'leads' -> 0 ->> 'source') = 'app', 'l''owner la vede con la provenienza';
  delete from public.leads;
  raise notice 'ok  richieste dal sito';
end $$;

-- ------------------------------------------------------------------ registrazioni chiuse: un account nasce solo per chi è già tra gli iscritti
alter table auth.users enable trigger kuko_signup_guard;
do $$
declare mid uuid; uid uuid; n int; r jsonb;
begin
  -- sconosciuti e email vuote: rifiutati dal database
  begin
    insert into auth.users (email) values ('sconosciuto@example.com');
    raise exception 'ASSERT: la registrazione di uno sconosciuto doveva essere rifiutata';
  exception when others then
    assert sqlerrm = 'signup_closed', 'sconosciuto rifiutato con signup_closed, trovato: ' || sqlerrm;
  end;
  begin
    insert into auth.users (email) values (null);
    raise exception 'ASSERT: senza email doveva essere rifiutata';
  exception when others then
    assert sqlerrm = 'signup_closed', 'email vuota rifiutata con signup_closed, trovato: ' || sqlerrm;
  end;
  assert not exists (select 1 from auth.users where email in ('sconosciuto@example.com')), 'nessun account creato per lo sconosciuto';

  -- iscritto dall'owner (maiuscole e spazi non contano): il primo accesso crea l'account e lo collega alla sua scheda
  insert into public.members (name, email, phone) values ('Chiara Socia', 'chiara@example.com', '333 000') returning id into mid;
  select count(*) into n from public.members;
  r := t.rpc('valerio', 'select public.snapshot()');
  assert exists (select 1 from jsonb_array_elements(r -> 'members') m where m ->> 'name' = 'Chiara Socia' and (m ->> 'has_account')::boolean = false), 'l''owner vede che Chiara non ha ancora un account';
  insert into auth.users (email, encrypted_password) values (' Chiara@Example.com ', 'password-di-un-altro') returning id into uid;
  assert (select user_id from public.members where id = mid) is null, 'prima della conferma non si collega';
  update auth.users set email_confirmed_at = now() where id = uid;
  assert (select user_id from public.members where id = mid) = uid, 'dopo il codice l''account è collegato alla scheda dell''owner';
  assert (select count(*) from public.members) = n, 'nessuna scheda doppia';
  assert (select encrypted_password from auth.users where id = uid) = '', 'la password messa prima della conferma non vale più';
  r := t.rpc('valerio', 'select public.snapshot()');
  assert exists (select 1 from jsonb_array_elements(r -> 'members') m where m ->> 'name' = 'Chiara Socia' and (m ->> 'has_account')::boolean = true), 'ora risulta con account';
  update auth.users set email = lower(trim(email)) where id = uid;   -- Supabase salva l'email già in minuscolo
  assert (t.rpc('chiara', 'select public.snapshot()') -> 'me' ->> 'name') = 'Chiara Socia', 'Chiara entra e vede la propria scheda';
  delete from auth.users where id = uid;
  delete from public.members where id = mid;
  raise notice 'ok  registrazioni chiuse';
end $$;
