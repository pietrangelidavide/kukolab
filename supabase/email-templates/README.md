# Modelli email per l'accesso con codice

Supabase → **Authentication → Emails → Templates**. Il codice è `{{ .Token }}`: se manca, la persona riceve un link invece del codice e l'app non funziona.

| Modello in Supabase | File | Oggetto |
|---|---|---|
| **Confirm signup** (primo accesso) | `codice.html` | `Il tuo codice KUKO LAB: {{ .Token }}` |
| **Magic Link** (accessi successivi) | `codice.html` | `Il tuo codice KUKO LAB: {{ .Token }}` |

Il testo è lo stesso per i due: la persona non deve accorgersi della differenza.

Il pulsante «Apri l'app» usa `{{ .SiteURL }}`: è l'indirizzo impostato in **Authentication → URL Configuration → Site URL** (deve essere `https://DOMINIO/app/`). Serve a chi ha chiuso la pagina dell'app prima che arrivasse il codice.
