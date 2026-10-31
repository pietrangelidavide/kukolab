-- Utenze di prova: owner (Valerio), segreteria, trainer, cliente (email e password finte). Il proprio owner (con l'email vera) è un'altra cosa, vedi il README. Solo per le prove: PRIMA DEL LANCIO cancellare i tre account
-- (Authentication → Users) e le quattro schede (Iscritti / Dipendenti), e togliere KUKO_PASSWORD_LOGIN dalle variabili di build.
-- Si incolla nello SQL Editor di Supabase. Passi: 1) questo blocco di schede, 2) Authentication → Users → Add user → Create new user per
-- ognuna delle quattro email (Auto Confirm User acceso), 3) il blocco "password" qui sotto.

-- 1) schede (il database rifiuta account di email che non sono già tra gli iscritti)
insert into public.members (name, email, role)
select v.name, v.email, v.role from (values
  ('Valerio Prova',    'dedde99+valerio@gmail.com',    'owner'),
  ('Segreteria Prova', 'dedde99+segreteria@gmail.com', 'staff'),
  ('Trainer Prova',    'dedde99+trainer@gmail.com',    'trainer'),
  ('Cliente Prova',    'dedde99+cliente@gmail.com',    'client')
) as v(name, email, role)
where not exists (select 1 from public.members m where lower(m.email) = v.email);

-- 3) password. Serve perché la conferma automatica del pannello azzera la password (private.handle_confirmed): così si rimette
-- dopo. Cambiare la password non rifà scattare quel controllo.
update auth.users set encrypted_password = extensions.crypt('Valerio-Prova!26',    extensions.gen_salt('bf', 10)) where lower(email) = 'dedde99+valerio@gmail.com';
update auth.users set encrypted_password = extensions.crypt('Segreteria-Prova!26', extensions.gen_salt('bf', 10)) where lower(email) = 'dedde99+segreteria@gmail.com';
update auth.users set encrypted_password = extensions.crypt('Trainer-Prova!26',    extensions.gen_salt('bf', 10)) where lower(email) = 'dedde99+trainer@gmail.com';
update auth.users set encrypted_password = extensions.crypt('Cliente-Prova!26',    extensions.gen_salt('bf', 10)) where lower(email) = 'dedde99+cliente@gmail.com';

-- controllo: tutte e quattro devono avere password e email confermata
select email, encrypted_password <> '' as ha_password, email_confirmed_at is not null as confermata
from auth.users where lower(email) like 'dedde99+%';
