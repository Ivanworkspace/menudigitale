# Architettura

## Panoramica

```
Browser (cliente · staff · super admin)
   │  letture realtime (solo lettura, regole Firestore)
   │◄────────────────────────────────────────────── Firestore
   ▼
Next.js 15 su Vercel ── Admin SDK (scritture) ──► Firestore · Storage · Auth
  • Server Components (pagine)
  • Server Actions (tutte le scritture, con autorizzazione e validazione zod)
  • Route Handlers (export CSV/JSON/PDF, API stampa, analytics, cron)
```

Principi:

1. **Il browser non scrive mai su Firestore.** Ogni modifica passa da una Server Action che verifica sessione,
   modulo attivo e permesso (`staffAction` in `src/server/action.ts`), valida l'input e scrive con l'Admin SDK.
2. **Letture realtime protette dalle regole.** Il server conia token Firebase personalizzati con i claim
   `kind` (`staff`/`guest`), `tenantId`, `role` o `tableSessionId`; `firestore.rules` permette di leggere solo i
   dati del proprio locale (staff) o della propria sessione al tavolo (cliente).
3. **Logica pura e testata** in `src/domain`: abbonamenti, lockout, permessi, menu e prezzi, protezione ordini,
   AYCE, KDS, conti e IVA, statistiche, prenotazioni, fidelity, magazzino, CSV, ESC/POS.
4. **Importi in centesimi**, aliquote in punti base; prezzi IVA inclusa con scorporo per aliquota.
5. **Prezzi mai dal browser:** il server ricalcola ogni riga dal listino (`buildItems` + `priceLine`).

## Identità

| Attore | Accesso | Sessione | Realtime |
|---|---|---|---|
| Super admin | Firebase Auth email/password → TOTP (RFC 6238, anti-replay) | cookie `sa` (path `/superadmin`), documento `admin_sessions` | — |
| Titolare / staff | link segreto + PIN (argon2id) | cookie `gs` limitato a `/g/<token>`, documento `staff_sessions` (12 h, revocabile) | custom token `kind=staff` |
| Cliente al tavolo | QR del tavolo → `joinTable` (con GPS/codice se richiesti) | cookie firmato `gt` legato alla sessione del tavolo | custom token `kind=guest` |
| Visitatore menu | nessuno | — | polling della versione del menu |

Il link segreto (`access_tokens/{sha256}`) contiene anche una copia cifrata del token (AES-256-GCM) per
consentire al super admin di reinviarlo e di entrare in assistenza.

## Modello dati (Firestore)

```
platform_admins/{uid}          admin_sessions/{hash}          platform/settings
plans/{id}                     platform_audit_log/{id}        impersonation_sessions/{id}
slugs/{slug}                   access_tokens/{hash}           table_tokens/{qrToken}
staff_credentials/{staffId}    staff_sessions/{hash}          auth_attempts/{id}   print_keys/{hash}

tenants/{tenantId}             (moduli, branding, impostazioni, contatori)
  staff · role_permissions · audit_log · subscription_events
  menus · categories · products · modifier_groups · departments
  rooms · tables · table_sessions · orders · service_requests · notifications · order_blocks
  bills · counters · printers · print_jobs · analytics
  reservations · customers · loyalty_transactions · promotions
  ingredients · stock_movements
```

Le collezioni di primo livello sono **solo server** (regola di default: nega tutto). TTL di Firestore su
`expireAt` cancella sessioni, tentativi di accesso, notifiche e job di stampa scaduti.

## Flussi principali

**Ordine dal tavolo:** scansione QR → `joinTable` (verifica tavolo aperto, GPS se in modalità blocco, codice
tavolo) → cookie `gt` → `placeOrder` → `guardOrder` (sessione, codice, limiti, GPS) → `createOrder` in
transazione (AYCE: pezzi per giro, intervallo, limiti per prodotto) → notifica e stampa → KDS e cliente si
aggiornano in realtime. Gli ordini bloccati finiscono in `order_blocks` e vengono notificati.

**Cucina (KDS):** comande = righe dell'ordine raggruppate per reparto; stati per riga (`new → in_progress →
ready → served`, `held` per le uscite successive fino al «Segue»); tempi registrati per le statistiche.

**Conto:** righe aggregate dagli ordini, coperto o prezzo AYCE, servizio, sconti/maggiorazioni ripartiti per
aliquota, divisione alla romana o per prodotti, pagamenti misti con resto; alla chiusura numerazione
giornaliera, accredito punti fedeltà e liberazione del tavolo. Solo incasso in cassa (nessun pagamento dal
telefono del cliente).

**Magazzino:** a ogni ordine inviato si scaricano gli ingredienti delle ricette; sotto soglia → avviso; a zero →
prodotti esauriti in automatico e menu aggiornato.

## Moduli (feature flag)

`orders, kds, billing, payments, reservations, loyalty, inventory, advanced_stats, multilang`, controllati in
navigazione (`visibleNav`), nelle pagine (`requireStaffPage`) e nelle azioni (`staffAction`).

## Struttura del codice

```
src/
  app/           superadmin · g/[token] (pannello) · m/[slug] (pubblico) · api
  components/    ui · staff · public · superadmin · maps · charts
  domain/        logica pura + test
  i18n/          testi dell'interfaccia cliente (it, en, de, fr, es)
  lib/           env, firebase (admin/client/paths), crypto, totp, format
  server/        auth, db, tenancy, menu, sala, orders, billing, printing, inventory,
                 customers, reservations, stats, fiscal, notifications, export
scripts/         create-superadmin · seed (locale demo) · smoke test
tests/           rules (emulatore) · server
print-server/    stampa ESC/POS in rete locale
```
