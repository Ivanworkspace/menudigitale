#!/usr/bin/env node
/**
 * MenuSaaS — local print server for ESC/POS network printers.
 *
 * Runs on any always-on device in the restaurant network (mini PC,
 * Raspberry Pi, the cash register PC). It polls the cloud for kitchen
 * tickets and sends them raw to the printers on TCP port 9100.
 *
 *   APP_URL=https://tuodominio.it PRINT_KEY=xxxxx node index.mjs
 *
 * No dependencies: Node.js >= 18.
 */
import net from "node:net";

const APP_URL = (process.env.APP_URL || "").replace(/\/$/, "");
const KEY = process.env.PRINT_KEY || "";
const INTERVAL = Number(process.env.POLL_MS || 2000);

if (!APP_URL || !KEY) {
  console.error("Imposta APP_URL e PRINT_KEY (Impostazioni → Stampanti nel pannello del locale).");
  process.exit(1);
}

function sendRaw(host, port, data) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout: 8000 }, () => {
      socket.write(data, () => socket.end());
    });
    socket.on("close", (hadError) => (hadError ? null : resolve()));
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("timeout"));
    });
    socket.on("error", reject);
  });
}

async function api(path, init = {}) {
  const res = await fetch(`${APP_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const { jobs } = await api("/api/print/jobs");
    for (const job of jobs) {
      try {
        await sendRaw(job.host, job.port, Buffer.from(job.payload, "base64"));
        await api(`/api/print/jobs/${job.id}`, { method: "POST", body: JSON.stringify({ ok: true }) });
        console.log(new Date().toLocaleTimeString(), "stampato", job.id, "→", job.host);
      } catch (e) {
        console.error(new Date().toLocaleTimeString(), "errore stampa", job.id, e.message);
        await api(`/api/print/jobs/${job.id}`, { method: "POST", body: JSON.stringify({ ok: false, error: e.message }) }).catch(() => {});
      }
    }
  } catch (e) {
    console.error(new Date().toLocaleTimeString(), "connessione:", e.message);
  } finally {
    busy = false;
  }
}

console.log(`Print server avviato → ${APP_URL} (ogni ${INTERVAL} ms)`);
setInterval(tick, INTERVAL);
tick();
