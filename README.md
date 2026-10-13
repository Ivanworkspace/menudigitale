# MenuSaaS — Menu digitale e gestione ristorante

Piattaforma SaaS multi-locale per ristoranti, pizzerie, bar, sushi all you can eat e pub.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Firebase (Firestore, Authentication, Storage) ·
deploy su Vercel.

| Livello | Rotta | Accesso |
|---|---|---|
| Super admin (proprietario del software) | `/superadmin` | email + password + **2FA obbligatoria** (app di autenticazione) |
| Menu pubblico | `/m/[slug]` · tavolo: `/m/[slug]/t/[qr]` · prenotazioni: `/m/[slug]/prenota` | nessun login |
| Gestione del locale | `/g/[tokenSegreto]` | PIN titolare · personale: `/g/[token]/staff` (nome + PIN) |

Documenti: [architettura](docs/ARCHITECTURE.md) · [stato delle fasi](docs/ROADMAP.md) ·
[guida per il ristoratore](docs/GUIDA-RISTORATORE.md) · [print server](print-server/README.md).

---

## 1. Avvio in locale (senza toccare il progetto Firebase reale)

Requisiti: Node.js ≥ 20 e Java ≥ 11 (per gli emulatori Firebase; su Mac `brew install openjdk@21`).

```bash
npm install
cp .env.example .env.local    # compila i valori Firebase e decommenta la sezione emulatori
npm run emulators              # Auth, Firestore, Storage in locale (UI su http://localhost:4000)
```

In un secondo terminale:

```bash
npm run create-superadmin -- tu@email.it 'UnaPasswordLunga!' "Il tuo nome"
npm run seed                   # piani + locale demo "Pizzeria Da Mario" (menu, sala, clienti, magazzino…)
npm run dev
```

- Super admin: `http://localhost:3000/superadmin/login` → al primo accesso inquadri il QR del 2FA.
- Il seed stampa link di gestione, PIN di tutto il personale e il link QR di un tavolo.

## 2. Messa in produzione

### Firebase
1. Console Firebase → progetto → **Authentication** → abilita *Email/Password*.
2. **Firestore** → crea il database (modalità produzione, regione `eur3` o `europe-west`).
3. **Storage** → crea il bucket (richiede il piano *Blaze*, a consumo: per un locale i costi sono minimi).
4. **Account di servizio** → genera la chiave privata → `FIREBASE_SERVICE_ACCOUNT_BASE64`.
5. Pubblica regole e indici (include le regole TTL che cancellano sessioni e tentativi scaduti):

```bash
npx firebase login
npx firebase deploy --only firestore:rules,firestore:indexes,storage --project <id-progetto>
```

6. Crea il primo super admin puntando al progetto reale (senza variabili emulatore in `.env.local`):
   `npm run create-superadmin -- …`

### Vercel
1. Importa il repository, framework Next.js.
2. Imposta tutte le variabili di `.env.example` (senza quelle degli emulatori), con `NEXT_PUBLIC_APP_URL` = dominio.
3. I cron in `vercel.json` girano da soli: scadenze abbonamenti (ogni mattina), backup Firestore (ogni notte) e
   riepilogo push del giorno prima per i titolari e inviti a recensire (ogni mattina, `/api/cron/morning`).
4. Notifiche push dell'app titolare: genera le chiavi una volta con `npx web-push generate-vapid-keys` e imposta
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` tuo). Non cambiarle più: i
   dispositivi già iscritti smetterebbero di ricevere notifiche.

### Backup
- **Automatico:** `/api/cron/backup` esporta ogni notte l'intero Firestore in `BACKUP_BUCKET`
  (dai all'account di servizio il ruolo *Cloud Datastore Import Export Admin* e scrittura sul bucket).
  Ripristino: `gcloud firestore import gs://<bucket>/<data>`.
- **Per locale:** il titolare scarica tutti i suoi dati da *Impostazioni → Testi legali → Esporta*; il super admin
  dalla scheda cliente.

## 3. Test

```bash
npm test             # logica di dominio + validazione ordini lato server (Vitest)
npm run test:rules   # regole di sicurezza Firestore sull'emulatore (isolamento tra locali)
npm run smoke        # con dev server ed emulatori attivi: apre tutte le pagine e verifica che non diano errori
npm run typecheck && npm run lint
```

## 4. Sicurezza

- **Isolamento tra locali:** i dati di ogni locale stanno sotto `tenants/{id}`. Il browser **non scrive mai** su
  Firestore: tutte le scritture passano dal server dopo i controlli. Le regole consentono solo letture realtime allo
  staff del proprio locale e al cliente del proprio tavolo (testate in `tests/rules`).
- **Link segreto:** 256 bit casuali, nel database solo l'hash SHA-256 (+ copia cifrata AES-GCM per il super admin).
- **PIN:** argon2id, blocco dopo 5 errori per dispositivo e 25 per locale; sessioni server revocabili, cookie
  `httpOnly`, `SameSite=Strict`, limitato al percorso del locale.
- **Super admin:** password Firebase + TOTP (RFC 6238) con protezione anti-replay.
- **Ordini da casa:** tavolo aperto, QR legato alla sessione, GPS con raggio, codice tavolo, approvazione manuale,
  limiti per minuto e anti-bot. **Prezzi sempre ricalcolati dal server.**
- Header di sicurezza (CSP, HSTS, X-Frame-Options, COOP), `noindex` e `no-referrer` sulle aree private,
  registro attività di ogni operazione e di ogni accesso in assistenza.

## 5. Nota fiscale

Il software **non sostituisce il registratore telematico (RT)**: i conti sono **preconti**. È predisposto il
modulo di integrazione con gli RT (Epson FP-RT via XML, Custom) in `src/server/fiscal`, da completare.
