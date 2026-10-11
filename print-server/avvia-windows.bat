@echo off
REM ============================================================
REM  MenuSaaS - Print server per Windows
REM  1. Installa Node.js LTS da https://nodejs.org
REM  2. Modifica le due righe qui sotto (indirizzo del sito e chiave)
REM  3. Doppio clic su questo file. Lascia la finestra aperta.
REM  Per l'avvio automatico: copia un collegamento a questo file in
REM  Win+R -> shell:startup
REM ============================================================
set APP_URL=https://IL-TUO-SITO.it
set PRINT_KEY=INCOLLA-QUI-LA-CHIAVE
cd /d "%~dp0"
:loop
node index.mjs
echo Il print server si e' fermato, riavvio tra 5 secondi...
timeout /t 5 >nul
goto loop
