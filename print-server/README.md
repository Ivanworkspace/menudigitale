# Print server locale (stampanti termiche ESC/POS di rete)

1. Nel pannello del locale: **Impostazioni → Stampanti** → aggiungi la stampante (IP, porta 9100, reparti) e
   genera la **chiave del print server**.
2. Su un computer sempre acceso nella rete del locale (anche un Raspberry Pi) con Node.js ≥ 18:

```bash
APP_URL=https://tuodominio.it PRINT_KEY=la-chiave node index.mjs
```

Per avviarlo automaticamente usa `pm2` (`pm2 start index.mjs --name stampa`) o un servizio di sistema.

In alternativa, senza computer locale, usa **PrintNode** (servizio a pagamento): inserisci la API key nelle
impostazioni e scegli il trasporto «PrintNode» per la stampante.

## Sul PC della cassa (Windows)

1. Installa Node.js LTS da https://nodejs.org.
2. Copia la cartella `print-server` sul PC (es. `C:\MenuSaaS\print-server`).
3. Apri `avvia-windows.bat` con il Blocco note, inserisci indirizzo del sito e chiave, salva.
4. Doppio clic su `avvia-windows.bat`: la finestra deve restare aperta (si riavvia da sola se si ferma).
5. Avvio automatico: Win+R → `shell:startup` → incolla lì un collegamento a `avvia-windows.bat`.

Le stampanti di rete possono ricevere comande sia dal gestionale di cassa sia da MenuSaaS: non serve
scollegarle dal gestionale.
