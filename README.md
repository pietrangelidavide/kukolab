# KUKO LAB Performance Studio

Sito vetrina + web app per prenotare i corsi (area cliente e area owner), in italiano.

- **Vetrina** (`public/`): HTML e CSS statici, senza framework. Orari generati da `src/data/schedule.json`.
- **Web app** (`src/` → `public/app/`): React 19 compilato con esbuild, installabile come app dal telefono. Due modalità:
  - **demo**: i dati stanno nel browser (localStorage), con persone, lezioni e abbonamenti di esempio. È quella che si apre senza configurare nulla;
  - **reale**: i dati stanno su Supabase (accesso con email e password, database PostgreSQL).
- Le regole di prenotazione sono scritte due volte, di proposito: in `src/lib/rules.ts` (demo e anteprime) e in `supabase/schema.sql` (database vero). Se si cambia una, si cambia anche l'altra; le prove lo controllano.

## Comandi

```bash
npm install
npm run dev            # sito su http://localhost:8800, app su /app/ (si ricompila da sola)
npm run build          # compila la web app in public/app/ (è quello che gira su Cloudflare)
npm run site           # rigenera la tabella degli orari nella vetrina da src/data/schedule.json
npm test               # prove delle regole (non serve nulla di installato oltre a Node)
npm run db:test        # prove dello schema SQL su un PostgreSQL locale
npm run db:e2e         # prova dell'app in modalità reale contro lo schema vero (finto Supabase locale)
npm run preview:build  # pagine a file unico in .tmp/preview/ (sito.html, app.html)
```

`db:test` e `db:e2e` usano un PostgreSQL installato sul computer (cercano `/usr/lib/postgresql/*/bin`); non toccano nessun database vero.

## Pubblicazione su Cloudflare

Il progetto è un sito statico (`wrangler.jsonc`, cartella `public/`). Su Cloudflare (Workers & Pages, collegato al repository GitHub):

- **Build command**: `npm run build`
- **Deploy command**: quello predefinito (`npx wrangler deploy`)
- **Variabili di build** (solo per la modalità reale, vedi sotto): `KUKO_SUPABASE_URL`, `KUKO_SUPABASE_ANON_KEY`

Senza le due variabili l'app resta in **demo**: va bene per mostrarla al cliente, non per usarla davvero.

## Attivare la modalità reale (Supabase)

1. Creare un progetto su supabase.com (regione UE, ad esempio Francoforte).
2. **SQL Editor** → incollare tutto `supabase/schema.sql` → *Run*. Si può rieseguire senza perdere dati (anche dopo un aggiornamento dello schema).
3. **Authentication → Providers → Email**: lasciare **Confirm email attivo** (è una protezione: senza conferma, chiunque potrebbe registrarsi con l'email di un iscritto e vederne l'abbonamento). Lunghezza minima password: 8.
4. **Authentication → URL Configuration**: *Site URL* = `https://DOMINIO/app/`; *Redirect URLs* = `https://DOMINIO/app/**`. Opzionale ma consigliato: configurare un mittente email proprio (SMTP), perché il servizio predefinito di Supabase ha limiti molto bassi.
5. **Project Settings → API**: copiare *Project URL* e la chiave `anon` nelle due variabili di build su Cloudflare e rifare il deploy. La chiave `anon` è pubblica per natura: le tabelle sono chiuse (RLS attiva, nessuna policy) e l'app può solo chiamare le funzioni di `schema.sql`, che controllano chi sei.
6. Il primo owner si crea a mano: Valerio si iscrive dall'app, conferma l'email, poi nello SQL Editor:
   ```sql
   update public.members set role = 'owner' where lower(email) = lower('EMAIL_DI_VALERIO');
   ```
   Gli altri owner (se servono) si fanno allo stesso modo.
7. Da owner: *Pacchetti* (crea i pacchetti in vendita), *Orari → Orario settimanale* (le lezioni si generano da sole per i giorni di prenotazione previsti), *Impostazioni*.

Gli iscritti già conosciuti si possono inserire prima da *Iscritti → Nuovo iscritto*: quando la persona si iscrive con la stessa email e conferma, trova abbonamento e storico già pronti.

## Regole di prenotazione (valori modificabili in Impostazioni)

- Si prenota fino a N giorni prima (14) e fino a M minuti prima dell'inizio (15).
- Serve un abbonamento valido per quel corso; se ce ne sono più di uno, si usa quello che scade prima. I mensili possono avere un limite settimanale.
- Niente doppie prenotazioni e niente lezioni sovrapposte.
- Lezione piena: si entra in lista d'attesa (se attiva). Quando si libera un posto sale il primo che ha ancora un abbonamento valido e nessuna sovrapposizione.
- Annullo gratuito fino a N ore prima (12): la lezione torna nell'abbonamento. Dopo, la lezione è persa. L'owner può sempre rimborsare.
- Se l'owner annulla una lezione, tutti i prenotati e la lista d'attesa vengono avvisati e la lezione torna nei loro abbonamenti.

## Cose da fare prima del go-live

- [ ] **Orari reali**, capienze, istruttori: `src/data/schedule.json` (oggi sono esempi) e poi `npm run site`.
- [ ] **Pacchetti e prezzi reali** (nella demo sono inventati: `src/lib/seed.ts`).
- [ ] **Foto originali** dello studio e di Valerio (oggi sono ritagli dalle storie Instagram, a bassa risoluzione): sostituire i file in `public/img/` mantenendo i nomi.
- [ ] **Numero WhatsApp**: in `src/config.ts` è `393920948122` (interpretato da "13920948122"); da confermare.
- [ ] **Dati societari** (ragione sociale, P. IVA, sede legale) e **informativa privacy/cookie** nel footer: i segnaposto sono in `public/index.html`.
- [ ] **Dominio**: collegarlo a Cloudflare, poi togliere `noindex` da `public/index.html`, cancellare `public/robots.txt` (blocca Google), aggiungere canonical/og:url/JSON-LD con l'indirizzo definitivo e i `routes` con `custom_domain` in `wrangler.jsonc`.
- [ ] Attivare la modalità reale (sopra) e provare un giro completo: iscrizione, prenotazione, annullo, lista d'attesa.

## Dove sta cosa

```
public/            vetrina (index.html, style.css, img/, fonts/)
public/app/        generata da npm run build (non in git)
src/lib/rules.ts   regole di prenotazione (pure funzioni)
src/lib/local.ts   demo nel browser          src/lib/remote.ts   Supabase (fetch)
src/lib/api.ts     contratto comune tra le due
src/screens/       schermate cliente e owner
supabase/          schema.sql, prove SQL e prova end-to-end
tests/             prove delle regole e dei dati demo
```

Font Montserrat (SIL Open Font License) incluso in `public/fonts/`.
