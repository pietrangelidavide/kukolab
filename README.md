# KUKO LAB Performance Studio

Sito vetrina + web app per prenotare i corsi (area cliente, owner, Segreteria e Trainer), in italiano.

- **Ingresso** (`public/index.html` + `public/landing.css`, indirizzo `/`): la prima pagina, per i clienti: due ingressi, **Il sito** (conoscere lo studio) e **L'app** (prenotare), da **sfogliare in orizzontale** (due pannelli in un carosello a scroll-snap: si scorre col dito o con la rotella orizzontale, e ci sono frecce, indicatori "Il sito / L'app", tastiera e trascinamento col mouse; senza JavaScript i pannelli scorrono comunque a mano; lo script sta in fondo a `index.html`). **Il gestionale non compare né sull'ingresso né sul sito**: lo staff lo apre dal suo indirizzo, `/gestionale/`. Il telefono d'esempio dentro la porta dell'app è generato da `npm run site` (segnaposto `<!--MOCK-->`). I link vanno a `/sito` e `/app/`; l'indirizzo del sito usato dall'app sta in `src/config.ts` (`siteHref`, di base `/sito`).
- **Vetrina** (`public/sito.html`, indirizzo `/sito`): HTML e CSS statici, senza framework. Parte da Valerio: la sua foto (`public/img/valerio.jpg`) sta nel quadrante del titolo. Ordine delle sezioni: **Corsi** (Pilates, Functional e Personal training con foto, le quattro tappe di una lezione e i dettagli), **Gli spazi** (striscia di foto che scorre, resta tra Corsi e Orari), **Orari**, **Chi siamo**, **Trainer** ("Chi ti segue": Valerio; la scheda della maestra di Pilates compare quando c'è la foto), **Nutrizione** (il Dott. Maurizio Calabrò), **Abbonamenti** (tessere a biglietto e gioco "Trova il tuo abbonamento"), **Prova gratuita** (modulo) e **Contatti**. Sul telefono la barra in basso ha Prova gratuita, Prenota e WhatsApp. Quadrante, anteprima dell'app, orari, tessere e schede dei trainer e del nutrizionista sono generati da `npm run site` (da `src/data/schedule.json`, `packs.json`, `nutritionist.json`, `trainers.json`); lo script riempie i segnaposto `<!--TAG-->…<!--/TAG-->` di `sito.html` e di `index.html` e si ferma se ne manca uno. `public/site.js` fa il resto: "Oggi" e prossima lezione con il conto alla rovescia (ora di Roma), scelta dell'abbonamento, modulo. `public/fx.js` aggiunge gli effetti (vedi sotto).
- **Web app** (`src/` → `public/app/`): React 19 compilato con esbuild, installabile come app dal telefono. **Un solo codice, due ingressi** (`scripts/lib/app.mjs`, `src/config.ts`):
  - `/app/`, **l'app dei clienti** (prenotare, abbonamento, profilo);
  - `/gestionale/`, **il gestionale dello staff** (owner, Segreteria, Trainer), a parte: indirizzo, accesso e icona installabile propri (`manifest` con `start_url` e `scope` `/gestionale/`, nome "Gestionale").

  Le due pagine d'ingresso (`public/app/index.html`, `public/gestionale/index.html`, generate da `npm run build`, non in git) caricano lo stesso `app.js` e dicono quale porta è aperta (`window.KUKO_ASSETS.mode`). Ogni porta ha il suo accesso (il gestionale parla di staff e non propone l'iscrizione). I dati e la sessione sono gli stessi (stessa origine): chi entra dalla porta sbagliata, un cliente nel gestionale o dello staff nell'app, vede una schermata che indica quella giusta (`WrongEntry` in `src/screens/Auth.tsx`). Quale ruolo va dove: `entryOf` in `src/config.ts`. Due modalità:
  - **demo**: i dati stanno nel browser (localStorage), con persone, lezioni e abbonamenti di esempio. È quella che si apre senza configurare nulla;
  - **reale**: i dati stanno su Supabase (database PostgreSQL). **Solo per iscritti**: non ci si registra da soli. L'account esiste per chi lo studio ha iscritto di persona (*Clienti → Iscritti → Nuovo iscritto*, con l'email); si entra con un **codice a 6 cifre mandato per email**, senza password. Dalla scheda l'owner vede se la persona ha già fatto il primo accesso e la invita con un messaggio WhatsApp già scritto.
- **Richieste dal sito** (prova gratuita di una lezione e consulenza con il nutrizionista): il modulo della vetrina chiama la funzione `submit_lead` (l'unica aperta anche a chi non ha un account); l'owner le trova nell'app in **Clienti → Richieste** (e nel riquadro "Richieste dal sito" di *Oggi*), cambia stato (da contattare → contattata → prova fissata → fatta → iscritta / non interessata), scrive una nota, chiama o scrive su WhatsApp, e con un tocco crea l'iscritto. I soci già iscritti possono chiedere la consulenza dalla schermata *Abbonamento*. Le richieste si cancellano da sole dopo 12 mesi.
- **Chi usa l'app, e cosa vede** (quattro ruoli, applicati dal database e non solo nascosti nelle schermate: `supabase/schema.sql`, `src/lib/access.ts`):

  | | Cliente | Segreteria | Trainer | Owner |
  |---|---|---|---|---|
  | Prenota e annulla per sé | sì | – | – | – |
  | Prenota e annulla per conto degli iscritti, anche a prenotazioni chiuse (l'annullo non ha penale) | – | sì | – | sì |
  | Iscritti: elenco, nuovo iscritto, dati di contatto | – | sì, senza note private | solo il nome di chi è iscritto alle sue lezioni | tutto |
  | Vende pacchetti e registra incassi | – | sì (l'incasso si registra sempre) | – | sì (può assegnare un pacchetto già pagato prima, senza incasso) |
  | Cassa | – | solo la giornata di oggi | – | tutti i giorni, periodi, grafico dei 12 mesi, CSV, storno |
  | Presenze | – | tutte le lezioni | solo le sue lezioni | tutte |
  | Orario, pacchetti e prezzi, impostazioni, correzione lezioni di un abbonamento, note private, richieste dal sito, messaggi WhatsApp, report, Team | – | – | – | sì |

  Dal menu: la **Segreteria** ha *Oggi, Orari, Iscritti, Cassa* (orari in sola lettura: vede le lezioni e le prenotazioni, non le modifica); il **Trainer** ha una sola pagina, *Le mie lezioni* (oggi, prossimi 7 giorni e ultimi 3, con chi viene e le presenze, attive da 30 minuti prima dell'inizio); l'**owner** ha *Oggi* e le cinque aree del gestionale (sotto).
- **Gestionale dell'owner: cinque aree** (si apre da `/gestionale/`; `src/lib/areas.ts`, schermate `src/screens/hub-*.tsx`, `owner-report.tsx`). Menu: *Oggi*, **Prenotazioni**, **Report**, **Clienti**, **Fatturazione**, **Dipendenti**, più *Impostazioni* (solo account e demo). Ogni area si apre su una **panoramica** fatta così: in alto i numeri che contano; **"Fai prima"**, le cose che fanno risparmiare tempo (con il conteggio di quante ce ne sono adesso) e che portano dritte all'azione; **"Funzioni"**, punti che si **espandono** con un tocco (se ne apre uno alla volta, `<details name=…>`) e dentro hanno l'elenco e le azioni. Sulle sottopagine una barra di schede riporta all'area. Il calcolo di cosa è urgente sta in `src/lib/insights.ts` (con prove in `tests/insights.test.ts`).

  | Area | "Fai prima" | Sottopagine |
  |---|---|---|
  | **Prenotazioni** | presenze da segnare, liste d'attesa, lezioni da riempire, nuova lezione | Calendario (`/orari`), Orario settimanale (`/orari/modelli`), Regole (`/prenotazioni/regole`) |
  | **Report e statistiche** | orari da rivedere, orari che funzionano, chi viene di più, per trainer | Report completo con la sezione *Soldi* |
  | **Clienti** | in scadenza, fermi da un mese, richieste da richiamare, messaggi da mandare | Iscritti, Richieste, Messaggi WhatsApp |
  | **Fatturazione** | registra un incasso, vendi un pacchetto, rinnovi in arrivo, file per il commercialista | Incassi, Listino pacchetti |
  | **Dipendenti** | istruttori senza accesso, trainer senza lezioni, lezioni svolte | Team (Segreteria e Trainer), permessi, lezioni e presenze per trainer |

  I vecchi indirizzi (`/orari`, `/iscritti`, `/richieste`, `/messaggi`, `/incassi`, `/pacchetti`, `/impostazioni`) continuano a funzionare e accendono l'area giusta. L'icona WhatsApp in alto, col numero dei messaggi da mandare, resta sempre visibile. **Fatturazione** vuol dire incassi, listino e rinnovi dell'app: non emette fatture o scontrini elettronici (vedi *Cose da fare*).
- **Team** (*Dipendenti*, solo owner). La **Segreteria** è un solo account, quello del banco in palestra: non è una persona, quindi conviene una casella dello studio (es. `segreteria@dominio.it`) che resta anche se cambia chi sta al banco. Per entrare si scrive quell'email e si riceve il codice come tutti. I **Trainer** sono tanti: si aggiunge nome ed email, e le lezioni sono sue quando nel campo *Istruttore* dell'orario c'è il suo nome, **o solo il suo nome di battesimo** (maiuscole e spazi non contano: "Elena Bianchi" tiene "Elena" e "Elena Bianchi"). Due trainer con lo stesso nome di battesimo vedrebbero le lezioni l'uno dell'altro se nell'orario c'è solo il nome: in quel caso scrivere il cognome. Chi è già tra gli iscritti passa al team senza perdere la storia; chi viene tolto con una storia nello studio torna iscritto, gli altri vengono cancellati. Gli incassi registrati restano sempre, col nome di chi li ha incassati.
- **Incassi.** Si registrano alla vendita del pacchetto (importo preimpostato col prezzo di listino, modificabile; 0 € = omaggio, senza incasso) o a parte (quota d'iscrizione, lezione singola…). Metodi: contanti, carta/POS, bonifico, altro. Uno storno non cancella: la riga resta, segnata *Stornato*, e non conta nei totali; lo può fare solo l'owner, quindi se alla Segreteria scappa un errore lo chiede al titolare. Dal CSV (*Fatturazione → File per il commercialista*, o *Incassi*) si apre in Excel italiano. Il **Report** dell'owner ha una sezione *Soldi* (le stesse cifre, in sintesi, stanno nella panoramica di *Fatturazione*) che segue il periodo scelto (4, 8 o 12 settimane): incassato con confronto sul periodo precedente della stessa durata, incasso medio, questo mese e il mese scorso, rinnovi in vista (abbonamenti che scadono entro 14 giorni e che l'iscritto non ha già rinnovato, a prezzo di listino), incassi per settimana, ripartizione per metodo e per pacchetto, incassi stornati. I numeri sono calcolati da `src/lib/revenue.ts`. **Nota**: sono incassi interni all'app, non scontrini né fatture.
- Le regole di prenotazione sono scritte due volte, di proposito: in `src/lib/rules.ts` (demo e anteprime) e in `supabase/schema.sql` (database vero). Se si cambia una, si cambia anche l'altra; le prove lo controllano.

## Comandi

```bash
npm install
npm run dev            # ingresso su http://localhost:8800, sito su /sito, app dei clienti su /app/, gestionale su /gestionale/ (si ricompila da sola)
npm run build          # compila la web app: codice in public/app/, pagine d'ingresso in public/app/ e public/gestionale/ (è quello che gira su Cloudflare)
npm run site           # rigenera in sito.html orari, tessere, nutrizionista, anteprima app e quadrante, e in index.html il telefono d'esempio (da src/data/*.json)
npm test               # prove delle regole (non serve nulla di installato oltre a Node)
npm run db:test        # prove dello schema SQL su un PostgreSQL locale
npm run db:e2e         # prova dell'app in modalità reale contro lo schema vero (finto Supabase locale)
npm run preview:build  # pagine a file unico in .tmp/preview/ (ingresso.html, sito.html, app.html, gestionale.html) e, in multi/, index (ingresso) + sito + app + gestionale + privacy da pubblicare insieme
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
2. **SQL Editor** → incollare tutto `supabase/schema.sql` → *Run*. Si può rieseguire senza perdere dati (anche su un progetto già attivo: aggiunge il blocco delle registrazioni).
3. **Authentication → Providers → Email**: lasciare **Enable Email provider** e **Confirm email** attivi. Il codice per email è il solo modo di entrare, quindi la mail deve funzionare (punto 5).
4. **Authentication → Sign In / Providers → "Allow new users to sign up"**: lasciarlo **attivo**. Sembra strano ma serve: il primo accesso con il codice crea l'account. A chiudere le registrazioni ci pensa il database (`kuko_signup_guard` in `schema.sql`): un account nasce solo se quell'email è già tra gli iscritti dello studio. Chi non lo è riceve da Supabase un errore interno, che l'app mostra come se il codice fosse partito (così da fuori non si scopre chi è iscritto).
5. **Mail con il codice**. Authentication → Emails → Templates: in **Confirm signup** (la usa il primo accesso) e in **Magic Link** (gli accessi successivi) il testo deve contenere `{{ .Token }}`, il codice. Modelli già pronti in `supabase/email-templates/` (incollare l'HTML e l'oggetto indicato). Authentication → Providers → Email: *Email OTP Expiration* 600 secondi (10 minuti) e *OTP length* 6. **SMTP**: il servizio predefinito di Supabase manda poche mail all'ora e solo agli indirizzi della squadra del progetto: per i clienti serve un SMTP proprio (Project Settings → Authentication → SMTP Settings), con un mittente del dominio dello studio (es. `prenotazioni@dominio.it`).
6. **Authentication → URL Configuration**: *Site URL* = `https://DOMINIO/app/`; *Redirect URLs* = `https://DOMINIO/app/**` e `https://DOMINIO/gestionale/**` (le due porte).
7. **Project Settings → API**: copiare *Project URL* e la chiave `anon` nelle due variabili di build su Cloudflare e rifare il deploy. La chiave `anon` è pubblica per natura: le tabelle sono chiuse (RLS attiva, nessuna policy) e l'app può solo chiamare le funzioni di `schema.sql`, che controllano chi sei.
8. **Il primo owner** si inserisce a mano, nello SQL Editor (non può iscriversi da solo: le registrazioni sono chiuse):
   ```sql
   insert into public.members (name, email, phone, role) values ('Valerio Cuscianna', 'EMAIL_DI_VALERIO', 'TELEFONO', 'owner');
   ```
   Poi Valerio apre il gestionale, `https://DOMINIO/gestionale/`, scrive la sua email e il codice che riceve: la scheda si collega al suo account. Altri owner: stessa cosa, oppure `update public.members set role = 'owner' where lower(email) = lower('EMAIL');` dopo il loro primo accesso.
9. Da owner: *Fatturazione → Listino* (crea i pacchetti in vendita), *Prenotazioni → Orario* (le lezioni si generano da sole per i giorni di prenotazione previsti) e *Prenotazioni → Regole*, poi *Dipendenti* per creare la Segreteria e i Trainer (non serve nessun SQL). Se il progetto era già attivo basta rieseguire `schema.sql`: aggiunge ruoli, incassi e Team senza toccare i dati.

**Pagina per il secondo QR** (`public/installa.html`, indirizzo `/installa`): spiega in tre passi come mettere l'app sulla Home (il gestionale si installa allo stesso modo dal suo indirizzo, `/gestionale/`, che non è linkato da nessuna pagina pubblica), su iPhone e su Android (riconosce il telefono). Il QR da stampare punta qui; il QR di accesso punta a `/app/`.

**Come si iscrive un cliente.** In studio, quando fa l'abbonamento: *Iscritti → Nuovo iscritto* con nome, telefono ed **email giusta** (se è sbagliata, il codice non arriva alla persona e non entra). Poi dalla scheda *Invita nell'app su WhatsApp* manda il link dell'app con due righe di istruzioni. Alla scheda compare "Account attivo" dopo il primo accesso. Chi ha l'email scritta male si corregge da *Modifica*. Chi non ha email può comunque essere prenotato dall'owner.

**Sicurezza, in breve.** Senza il codice ricevuto per email non si entra: nessuna password da dimenticare o rubare. Chi conosce l'email di un iscritto non può lasciarci sopra una sua password: alla prima conferma l'app la azzera (`handle_confirmed`, provato con la prova end-to-end contro un finto GoTrue; su Supabase vero conviene rifare la prova una volta, vedi sotto). Il codice dura 10 minuti e vale una volta sola.

**Prova da fare una volta sul progetto vero** (le prove automatiche usano un finto Supabase): 1) con l'email di un iscritto inserito dall'owner arriva il codice e si entra; 2) con un'email qualsiasi non arriva niente e l'app dice comunque "Se è tra le email degli iscritti…"; 3) in *Authentication → Users* non compare nessun utente nuovo per quella email; 4) se non arriva niente per un iscritto, guardare *Logs → Auth* e i modelli email (punto 5).

## Messaggi WhatsApp (*Clienti → Messaggi*, solo owner)

L'app **non manda niente da sola**: ogni giorno prepara chi va avvisato e con quale testo, l'owner tocca *Invia*, si apre WhatsApp con il messaggio già scritto e preme invio (nessun costo, nessuna approvazione di Meta). Si trova in *Clienti* (con il numero di messaggi da mandare), dall'icona WhatsApp in alto e dal riquadro "Messaggi WhatsApp" di *Oggi*.

- **Posto liberato**: chi è entrato dalla lista d'attesa nelle ultime 36 ore.
- **Lezione annullata**: chi era prenotato o in lista (tolte le persone che avevano già annullato da sole).
- **Promemoria lezione**: dalle 20:00 della sera prima, per le lezioni del giorno dopo; ricorda fino a che ora si può annullare senza perdere la lezione (`cancelWindowHours`), se non è già passata.
- **Abbonamento in scadenza**: entro 7 giorni o con 2 lezioni o meno, tranne chi ha già un altro abbonamento.
- **Benvenuto nell'app**: iscritti degli ultimi 14 giorni con email che non hanno ancora fatto il primo accesso.
- **Posti da riempire**: per ogni lezione delle prossime 36 ore con posti liberi propone 3 persone da invitare. Solo chi può prenotare davvero (abbonamento valido per quel corso, nessuna lezione sovrapposta, telefono). Punteggio: ha fatto quel tipo di allenamento negli ultimi 3 mesi (3 punti a volta, massimo 6), di solito viene lo stesso giorno e alla stessa ora (2 a volta, massimo 3), il pacchetto scade entro 14 giorni con lezioni da usare (4), nessuna lezione nei prossimi 7 giorni (2); meno punti per chi ha saltato 2 lezioni senza avvisare (−3) o annullato tardi (−1), ha già una lezione quel giorno (−2) o è stato invitato da poco (−5).

La logica sta in `src/lib/messages.ts` (funzioni pure, testi e pesi in un posto solo, test in `tests/messages.test.ts`). Cosa è già stato mandato o scartato lo ricorda il dispositivo (`src/sentlog.ts`, localStorage): su un altro telefono l'elenco riparte da zero. Gli stessi testi si possono usare come modelli quando si passerà all'API ufficiale di WhatsApp (invio automatico, a pagamento per messaggio).

## Regole di prenotazione (valori modificabili in *Prenotazioni → Regole*)

- Si prenota fino a N giorni prima (14) e fino a M minuti prima dell'inizio (15).
- Serve un abbonamento valido per quel corso; se ce ne sono più di uno, si usa quello che scade prima. I mensili possono avere un limite settimanale.
- Niente doppie prenotazioni e niente lezioni sovrapposte.
- Lezione piena: si entra in lista d'attesa (se attiva). Quando si libera un posto sale il primo che ha ancora un abbonamento valido e nessuna sovrapposizione.
- Annullo gratuito fino a N ore prima (12): la lezione torna nell'abbonamento. Dopo, la lezione è persa. L'owner può sempre rimborsare.
- Se l'owner annulla una lezione, tutti i prenotati e la lista d'attesa vengono avvisati e la lezione torna nei loro abbonamenti.

## Cose da fare prima del go-live

- [ ] **Orari reali**, capienze, istruttori: `src/data/schedule.json` (oggi sono esempi) e poi `npm run site`.
- [ ] **Pacchetti e prezzi reali**: `src/data/packs.json` (sono esempi) e poi `npm run site`; nel database vero si creano da *Fatturazione → Listino* nell'app. Se il cliente preferisce non mostrare i prezzi sul sito, `"showPrices": false` nello stesso file.
- [ ] **Nutrizionista**: foto, telefono, email e Instagram sono presi dalla locandina; da far confermare al Dott. Calabrò (`src/data/nutritionist.json`, la foto è un ritaglio del volantino: meglio una foto originale in `public/img/nutrizionista.jpg`). Va chiarito con lui come passarsi le richieste.
- [ ] **Foto delle lezioni e degli spazi**: le foto dei corsi e la striscia animata "Gli spazi" (`public/img/studio-*.jpg` e `studio-*-wide.jpg`) sono state ritagliate dalle immagini mandate dal cliente (`scripts/photos.py`). Prima di pubblicare servono il consenso delle persone riprese e, per le foto del sito, la conferma di Valerio. Le "quattro tappe" delle lezioni, "piccoli gruppi" e "gruppi da 6/8 persone" sono testi da confermare con lui.
- [ ] **Notifica delle nuove richieste**: oggi l'owner le vede nell'app; email o notifica push richiedono un'integrazione in più (ad esempio una funzione di Supabase che manda una mail).
- [ ] **Trainer**: la sezione "I trainer" della vetrina si genera da `src/data/trainers.json`. Per la maestra di Pilates: salvare la foto come `public/img/trainer-pilates.jpg` (verticale 4:5, almeno 600 px di larghezza), scrivere il nome in `"name"` e lanciare `npm run site`; finché il file non esiste la scheda non compare nella vetrina. Il ritratto di Valerio (`trainer-valerio.jpg`) è un ingrandimento della foto piccola e scura (`public/img/valerio.jpg`) fatto da `scripts/photos.py`: con uno scatto nuovo e nitido si sostituisce quel file. Titoli e credenziali di Valerio sono quelli già presenti nella vetrina; da far confermare. Nel calendario demo il Pilates è ancora assegnato a "Team KUKO" (`src/data/schedule.json`).
- [ ] **Numero WhatsApp**: in `src/config.ts` è `393920948122` (interpretato da "13920948122"); da confermare.
- [ ] **Dati societari** (ragione sociale, P. IVA, sede legale) nel footer: il segnaposto è in `public/sito.html` e `public/index.html` (footer). **Informativa privacy**: `public/privacy.html` è una bozza (parti tra parentesi quadre da completare: titolare, email, fornitori e paese dei server) da far rivedere da un consulente prima della pubblicazione.
- [ ] **Dominio**: collegarlo a Cloudflare, poi togliere `noindex` da `public/index.html` e `public/sito.html`, cancellare `public/robots.txt` (blocca Google), aggiungere canonical/og:url/JSON-LD con l'indirizzo definitivo e i `routes` con `custom_domain` in `wrangler.jsonc`.
- [ ] Attivare la modalità reale (sopra) e provare un giro completo: iscrizione in studio, invito WhatsApp, primo accesso con il codice, prenotazione, annullo, lista d'attesa. Poi, con l'account della Segreteria: vendita di un pacchetto con incasso, nuovo iscritto, cassa di oggi; con un Trainer: le sue lezioni e le presenze.
- [ ] **Segreteria e Trainer**: scegliere l'email della Segreteria (casella dello studio) e creare gli account da *Dipendenti*; per ogni Trainer controllare che il nome nel campo *Istruttore* dell'orario coincida (la pagina Team segna "Da abbinare" chi non ha ancora lezioni).
- [ ] **Mittente email del dominio** (SMTP) per i codici: va configurato prima del lancio, con SPF/DKIM del dominio (punto 5 sopra). Senza, i clienti non ricevono il codice e non entrano.
- [ ] **Fatture e scontrini elettronici** (non ancora fatti): *Fatturazione* è la cassa interna (incassi, listino, rinnovi, CSV). L'emissione fiscale resta al gestionale/commercialista dello studio; si può collegare in un secondo momento.
- [ ] **Acquisti online** (non ancora fatti): vendita di pacchetti dal sito/app con pagamento online. Richiede un provider di pagamento, le condizioni di vendita (recesso), lo scontrino/fattura e l'informativa privacy aggiornata; oggi i pacchetti si vendono in studio e l'owner li assegna dalla scheda.

## Dove sta cosa

```
public/            ingresso (index.html, landing.css), vetrina (sito.html, style.css, site.js, fx.js), privacy.html, img/, fonts/
public/app/        codice della web app (app.js, app.css) e ingresso dei clienti: generata da npm run build (non in git)
public/gestionale/ ingresso del gestionale (stesso codice di /app/): generata da npm run build (non in git)
src/lib/rules.ts   regole di prenotazione (pure funzioni)
src/lib/leads.ts   richieste dal sito (modulo, stati, scadenza a 12 mesi)
src/lib/access.ts  chi può fare cosa (specchio dei permessi del database) e quali lezioni sono di un Trainer
src/lib/payments.ts  incassi: totali, periodi, mesi, importi, CSV     src/lib/team.ts  Segreteria e Trainer
src/lib/revenue.ts  soldi del Report: confronto, settimane, metodi, pacchetti, rinnovi
src/lib/areas.ts   le cinque aree del gestionale (menu, schede, vecchi indirizzi)   src/lib/insights.ts  cosa è urgente: presenze da segnare, lezioni da riempire, clienti fermi, statistiche per trainer
src/data/          schedule.json (orari), packs.json (pacchetti), nutritionist.json, trainers.json
src/lib/local.ts   demo nel browser          src/lib/remote.ts   Supabase (fetch)
src/lib/api.ts     contratto comune tra le due
src/screens/       schermate cliente, owner, Segreteria (Oggi/Cassa) e Trainer (lessons.tsx); hub-bookings/clients/billing/staff.tsx = panoramiche delle aree, area-ui.tsx = pezzi in comune (Fai prima, punti espandibili)
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

**Striscia "Gli spazi" (vetrina)**: `[data-reel]` in `public/sito.html`, animata da `public/site.js` (scorrimento continuo, trascinabile, rallenta al passaggio del mouse). Con `prefers-reduced-motion` o senza JavaScript diventa una normale fila scorrevole a mano.

Font Big Shoulders e Instrument Sans (vetrina) e Montserrat (app), tutti con licenza SIL Open Font License, inclusi in `public/fonts/`.
