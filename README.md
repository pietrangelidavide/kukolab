# KUKO LAB Performance Studio

Sito vetrina + web app per prenotare i corsi (area cliente e area owner), in italiano.

- **Vetrina** (`public/`): HTML e CSS statici, senza framework. Parte da Valerio: la sua foto (`public/img/valerio.jpg`) sta nel quadrante del titolo. Sezioni: Chi siamo, **Corsi** (Pilates, Functional e Personal training con foto, le quattro tappe di una lezione e i dettagli, più "Gli spazi", una striscia di foto che scorre), **Trainer** (Valerio e la maestra di Pilates), **Nutrizione** (il Dott. Maurizio Calabrò), **Abbonamenti** (tessere a biglietto e gioco "Trova il tuo abbonamento"), **Prova gratuita** (modulo), Orari, Contatti. Quadrante, anteprima dell'app, orari, tessere e schede dei trainer e del nutrizionista sono generati da `npm run site` (da `src/data/schedule.json`, `packs.json`, `nutritionist.json`, `trainers.json`). `public/site.js` fa il resto: "Oggi" e prossima lezione con il conto alla rovescia (ora di Roma), scelta dell'abbonamento, modulo. `public/fx.js` aggiunge gli effetti (vedi sotto).
- **Web app** (`src/` → `public/app/`): React 19 compilato con esbuild, installabile come app dal telefono. Due modalità:
  - **demo**: i dati stanno nel browser (localStorage), con persone, lezioni e abbonamenti di esempio. È quella che si apre senza configurare nulla;
  - **reale**: i dati stanno su Supabase (accesso con email e password, database PostgreSQL).
- **Richieste dal sito** (prova gratuita di una lezione e consulenza con il nutrizionista): il modulo della vetrina chiama la funzione `submit_lead` (l'unica aperta anche a chi non ha un account); l'owner le trova nell'app alla voce **Richieste** (e nel riquadro "Richieste dal sito" di *Oggi*), cambia stato (da contattare → contattata → prova fissata → fatta → iscritta / non interessata), scrive una nota, chiama o scrive su WhatsApp, e con un tocco crea l'iscritto. I soci già iscritti possono chiedere la consulenza dalla schermata *Abbonamento*. Le richieste si cancellano da sole dopo 12 mesi.
- Le regole di prenotazione sono scritte due volte, di proposito: in `src/lib/rules.ts` (demo e anteprime) e in `supabase/schema.sql` (database vero). Se si cambia una, si cambia anche l'altra; le prove lo controllano.

## Comandi

```bash
npm install
npm run dev            # sito su http://localhost:8800, app su /app/ (si ricompila da sola)
npm run build          # compila la web app in public/app/ (è quello che gira su Cloudflare)
npm run site           # rigenera nella vetrina orari, tessere, nutrizionista, anteprima app e quadrante (da src/data/*.json)
npm test               # prove delle regole (non serve nulla di installato oltre a Node)
npm run db:test        # prove dello schema SQL su un PostgreSQL locale
npm run db:e2e         # prova dell'app in modalità reale contro lo schema vero (finto Supabase locale)
npm run preview:build  # pagine a file unico in .tmp/preview/ (sito.html, app.html) e, in multi/, index + app + privacy da pubblicare insieme
```

`db:test` e `db:e2e` usano un PostgreSQL installato sul computer (cercano `/usr/lib/postgresql/*/bin`); non toccano nessun database vero.

## Pubblicazione su Cloudflare

Il progetto è un sito statico (`wrangler.jsonc`, cartella `public/`). Su Cloudflare (Workers & Pages, collegato al repository GitHub):

- **Build command**: `npm run build`
- **Deploy command**: quello predefinito (`npx wrangler deploy`)
- **Variabili di build** (solo per la modalità reale, vedi sotto): `KUKO_SUPABASE_URL`, `KUKO_SUPABASE_ANON_KEY`

Senza le due variabili l'app resta in **demo**: va bene per mostrarla al cliente, non per usarla davvero. Con le due variabili la build scrive anche `public/site-config.js` (non in git): è con quella chiave pubblica che il modulo del sito manda le richieste al database. Senza, il modulo è in **anteprima**: la richiesta resta nel browser (stessa origine dell'app) e compare nell'area owner della demo, ma non parte davvero.

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
- [ ] **Pacchetti e prezzi reali**: `src/data/packs.json` (sono esempi) e poi `npm run site`; nel database vero si creano da *Pacchetti* nell'app. Se il cliente preferisce non mostrare i prezzi sul sito, `"showPrices": false` nello stesso file.
- [ ] **Nutrizionista**: foto, telefono, email e Instagram sono presi dalla locandina; da far confermare al Dott. Calabrò (`src/data/nutritionist.json`, la foto è un ritaglio del volantino: meglio una foto originale in `public/img/nutrizionista.jpg`). Va chiarito con lui come passarsi le richieste.
- [ ] **Foto delle lezioni e degli spazi**: le foto dei corsi e la striscia animata "Gli spazi" (`public/img/studio-*.jpg` e `studio-*-wide.jpg`) sono state ritagliate dalle immagini mandate dal cliente (`scripts/photos.py`). Prima di pubblicare servono il consenso delle persone riprese e, per le foto del sito, la conferma di Valerio. Le "quattro tappe" delle lezioni, "piccoli gruppi" e "gruppi da 6/8 persone" sono testi da confermare con lui.
- [ ] **Notifica delle nuove richieste**: oggi l'owner le vede nell'app; email o notifica push richiedono un'integrazione in più (ad esempio una funzione di Supabase che manda una mail).
- [ ] **Trainer**: la sezione "I trainer" della vetrina si genera da `src/data/trainers.json`. Per la maestra di Pilates: salvare la foto come `public/img/trainer-pilates.jpg` (verticale 4:5, almeno 600 px di larghezza), scrivere il nome in `"name"` e lanciare `npm run site`; finché il file non esiste compare il riquadro "Foto in arrivo". Il ritratto di Valerio (`trainer-valerio.jpg`) è un ingrandimento della foto piccola e scura (`public/img/valerio.jpg`) fatto da `scripts/photos.py`: con uno scatto nuovo e nitido si sostituisce quel file. Titoli e credenziali di Valerio sono quelli già presenti nella vetrina; da far confermare. Nel calendario demo il Pilates è ancora assegnato a "Team KUKO" (`src/data/schedule.json`).
- [ ] **Numero WhatsApp**: in `src/config.ts` è `393920948122` (interpretato da "13920948122"); da confermare.
- [ ] **Dati societari** (ragione sociale, P. IVA, sede legale) nel footer: il segnaposto è in `public/index.html`. **Informativa privacy**: `public/privacy.html` è una bozza (parti tra parentesi quadre da completare: titolare, email, fornitori e paese dei server) da far rivedere da un consulente prima della pubblicazione.
- [ ] **Dominio**: collegarlo a Cloudflare, poi togliere `noindex` da `public/index.html`, cancellare `public/robots.txt` (blocca Google), aggiungere canonical/og:url/JSON-LD con l'indirizzo definitivo e i `routes` con `custom_domain` in `wrangler.jsonc`.
- [ ] Attivare la modalità reale (sopra) e provare un giro completo: iscrizione, prenotazione, annullo, lista d'attesa.

## Dove sta cosa

```
public/            vetrina (index.html, privacy.html, style.css, site.js, fx.js, img/, fonts/)
public/app/        generata da npm run build (non in git)
src/lib/rules.ts   regole di prenotazione (pure funzioni)
src/lib/leads.ts   richieste dal sito (modulo, stati, scadenza a 12 mesi)
src/data/          schedule.json (orari), packs.json (pacchetti), nutritionist.json, trainers.json
src/lib/local.ts   demo nel browser          src/lib/remote.ts   Supabase (fetch)
src/lib/api.ts     contratto comune tra le due
src/screens/       schermate cliente e owner
supabase/          schema.sql, prove SQL e prova end-to-end
tests/             prove delle regole e dei dati demo
```

**Tema chiaro e scuro (app)**: segue le impostazioni del telefono o del computer (`prefers-color-scheme`), senza interruttore manuale. I colori sono variabili CSS in cima a `src/styles.css` (scuro di base, chiaro nel blocco `@media`); le tessere dell'abbonamento restano scure di proposito. Le schede del manifest PWA (`theme_color`) restano scure.

**Effetti della vetrina** (`public/fx.js` + la parte "effetti" di `public/style.css`). Filo conduttore: il quadrante del logo come strumento della pagina.
- *Apertura*: il titolo sale riga per riga, il quadrante si accende in senso orario, il ritratto di Valerio si apre a iride (solo CSS, parte anche senza `fx.js`). Poi le tacche del quadrante si alzano dove punti mouse o dito, il ritratto galleggia, una luce arancione segue il mouse, e scorrendo il quadrante gira.
- *Orientamento*: attorno al logo in alto un anello si riempie scorrendo (un giro completo = fondo pagina); la barretta del menu scivola sulla sezione in cui sei; su telefono la testata si nasconde scendendo e torna risalendo, e compare una barra fissa "Prova gratuita / Prenota" (sparisce nella sezione del modulo).
- *Sezioni*: il taglio diagonale è un cuneo che si apre mentre la sezione sale; la fascia bianca sul taglio dopo l'apertura va da sola e la velocità dello scroll la spinge e la inclina; il titolo di "Chi siamo" si accende parola per parola; le foto di corsi, trainer e nutrizionista si scoprono con un taglio inclinato e quelle dei corsi scorrono dentro la cornice; le quattro tappe di ogni lezione si accendono una dopo l'altra insieme a un anello che fa un quarto di giro a tappa.
- *Dettagli d'uso*: le tessere si inclinano verso il mouse con un riflesso; la legenda degli orari filtra il calendario; "Prossima lezione" mostra quanto manca (si aggiorna ogni mezzo minuto) e il calendario segna lezioni passate e prossima; il corso scelto da un pulsante "Prova gratis" lampeggia nel modulo; gettone "Trascina" sulla fascia delle foto; pulsanti che si riempiono con un taglio.
- *Regole*: ogni cosa che nasconde o sposta contenuti sta dietro la classe `html.fx`, che si attiva solo se il browser supporta `IntersectionObserver` e **non** è attivo "riduci animazioni"; se `fx.js` non parte entro 3,5 secondi la classe viene tolta e la pagina resta completa e ferma. Senza JavaScript tutto il contenuto è visibile.

**Parti espandibili sul telefono** (`site.js`, in fondo + blocco "parti espandibili" di `style.css`). Solo fino a 760 px le parti più lunghe si chiudono dietro un tocco: le tappe/parole chiave di ogni corso (la riga "Una lezione, in quattro tappe"), le 8 tessere ("Vedi tutte le tessere e i prezzi", con "Richiudi" in fondo), un giorno per volta negli orari (aperto quello di oggi; toccare un tipo di lezione nella legenda li apre tutti), i punti della consulenza di nutrizione e i "Come funziona" di prova e prenotazione. I contenitori `.fold` vengono creati e tolti da JS al cambio di larghezza: sul desktop la pagina è identica a prima e senza JS resta tutta aperta. I link che puntano dentro una parte chiusa (per esempio "Guarda la tessera" del gioco) la aprono da soli prima di scorrere. Accessibilità: bottoni con `aria-expanded`/`aria-controls`, contenuto chiuso `inert`. Per escludere una parte basta togliere la sua chiamata `Fold({...})` in `site.js`; l'HTML generato da `npm run site` non cambia.

**Striscia "Gli spazi" (vetrina)**: `[data-reel]` in `public/index.html`, animata da `public/site.js` (scorrimento continuo, trascinabile, rallenta al passaggio del mouse). Con `prefers-reduced-motion` o senza JavaScript diventa una normale fila scorrevole a mano.

Font Big Shoulders e Instrument Sans (vetrina) e Montserrat (app), tutti con licenza SIL Open Font License, inclusi in `public/fonts/`.
