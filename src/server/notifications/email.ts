import "server-only";
import type { SubscriptionState } from "@/domain/subscription";
import { formatDate } from "@/lib/format";
import { publicEnv } from "@/lib/env";

/**
 * Transactional email. Uses Resend's HTTP API when RESEND_API_KEY is set,
 * otherwise logs to the console (development). Swappable provider.
 */
export async function sendEmail(msg: { to: string; subject: string; text: string }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? `${publicEnv.brandName} <noreply@example.com>`;
  if (!key) {
    console.info("[email:dev]", msg.to, msg.subject, "\n" + msg.text);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text }),
  });
  if (!res.ok) console.error("email send failed", res.status, await res.text());
}

export async function sendExpiryWarning(opts: { to: string | null; tenantName: string; state: SubscriptionState }) {
  const { state } = opts;
  const text =
    state.phase === "grace"
      ? `Gentile ${opts.tenantName},\n\nl'abbonamento a ${publicEnv.brandName} è scaduto il ${formatDate(state.endsAt)}. ` +
        `Il servizio resterà attivo fino al ${formatDate(state.graceEndsAt)}, poi verrà sospeso.\nContattaci per il rinnovo.`
      : `Gentile ${opts.tenantName},\n\nl'abbonamento a ${publicEnv.brandName} scadrà il ${formatDate(state.endsAt)} ` +
        `(tra ${state.daysLeft} giorni). Contattaci per il rinnovo e continuare a usare il servizio senza interruzioni.`;
  const subject = state.phase === "grace" ? "Abbonamento scaduto: rinnova per non perdere il servizio" : "Il tuo abbonamento è in scadenza";
  if (opts.to) await sendEmail({ to: opts.to, subject, text });
  // Always notify the platform owner too.
  if (process.env.ADMIN_NOTIFY_EMAIL) await sendEmail({ to: process.env.ADMIN_NOTIFY_EMAIL, subject: `[${opts.tenantName}] ${subject}`, text });
}
