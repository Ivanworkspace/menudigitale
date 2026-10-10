# Stato delle fasi

| Fase | Contenuto | Stato |
|---|---|---|
| 1 | Architettura, dati e sicurezza, autenticazione dei tre livelli, pannello super admin | ✅ |
| 2 | Gestione menu + menu pubblico (allergeni, multilingua, branding, QR) | ✅ |
| 3 | Sala e tavoli, ordini da cameriere e QR, protezione ordini da casa, AYCE | ✅ |
| 4 | KDS cucina/bar, comande, notifiche realtime, stampa ESC/POS | ✅ |
| 5 | Conti e incassi in cassa | ✅ (senza pagamenti dal telefono del cliente, per scelta) |
| 6 | Personale e permessi, registro attività, statistiche | ✅ |
| 7 | Prenotazioni, clienti e fidelity, magazzino | ✅ |
| 8 | PWA e offline, backup, sicurezza, documentazione | ✅ |

## Da completare / estensioni previste

- **Registratori telematici (RT):** adattatori Epson FP-RT (XML già generato in `src/server/fiscal`) e Custom,
  inviati tramite il print server locale.
- **Prenotazioni:** invio WhatsApp/SMS via API (oggi: email automatica + link WhatsApp precompilato).
- **Super admin:** pagamento degli abbonamenti online (oggi i rinnovi si registrano a mano).
- **Satispay / SumUp in cassa:** oggi registrabili come metodo di pagamento; integrazione diretta POS da valutare.
