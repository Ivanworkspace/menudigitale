"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { publicBook, publicSlots } from "./actions";

export function BookingForm({ slug, today, maxParty, accent, phone, askReview = false }: { slug: string; today: string; maxParty: number; accent: string; phone: string | null; askReview?: boolean }) {
  const [date, setDate] = useState(today);
  const [covers, setCovers] = useState(2);
  const [slots, setSlots] = useState<{ time: string }[] | null>(null);
  const [time, setTime] = useState("");
  const [f, setF] = useState({ name: "", phone: "", email: "", notes: "", privacy: false, website: "", reviewConsent: false });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    setSlots(null);
    setTime("");
    publicSlots(slug, date, covers).then((r) => (r.ok ? setSlots(r.data) : setError(r.error)));
  }, [slug, date, covers]);

  if (done) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
        <p className="text-4xl">{done === "confirmed" ? "✅" : "📨"}</p>
        <h2 className="mt-3 text-xl font-bold">{done === "confirmed" ? "Prenotazione confermata!" : "Richiesta inviata!"}</h2>
        <p className="mt-2 text-slate-600">
          {done === "confirmed" ? "Ti aspettiamo." : "Il locale confermerà a breve la tua prenotazione."}
          {f.email && " Riceverai un'email di riepilogo."}
        </p>
      </div>
    );
  }

  const input = "h-12 w-full rounded-xl bg-white px-3 text-base ring-1 ring-slate-300 focus:outline-none focus:ring-2";
  return (
    <form
      className="space-y-4 rounded-2xl bg-white p-5 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (!time) return setError("Scegli un orario.");
        start(async () => {
          setError(null);
          const r = await publicBook(slug, { ...f, covers, date, time });
          if (r.ok) setDone(r.data.status);
          else setError(r.error);
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium">
          Giorno
          <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className={`${input} mt-1`} required />
        </label>
        <label className="text-sm font-medium">
          Persone
          <select value={covers} onChange={(e) => setCovers(Number(e.target.value))} className={`${input} mt-1`}>
            {Array.from({ length: maxParty }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <div>
        <p className="text-sm font-medium">Orario</p>
        {slots === null ? (
          <p className="mt-2 text-sm text-slate-500">Verifico la disponibilità…</p>
        ) : slots.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Nessun orario disponibile in questo giorno.{phone && <> Prova a chiamarci: <a className="underline" href={`tel:${phone}`}>{phone}</a></>}</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {slots.map((s) => (
              <button key={s.time} type="button" onClick={() => setTime(s.time)} className="rounded-xl px-3 py-2 text-sm font-semibold ring-1 ring-slate-300" style={time === s.time ? { background: accent, color: "#fff", boxShadow: "none" } : undefined}>
                {s.time}
              </button>
            ))}
          </div>
        )}
      </div>
      <input className={input} placeholder="Nome e cognome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required autoComplete="name" />
      <input className={input} placeholder="Telefono" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required autoComplete="tel" />
      <input className={input} placeholder="Email (facoltativa, per la conferma)" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
      <textarea className="w-full rounded-xl p-3 text-base ring-1 ring-slate-300" rows={2} placeholder="Note (allergie, seggiolone, occasione speciale…)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      {/* honeypot */}
      <input tabIndex={-1} autoComplete="off" className="hidden" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} aria-hidden="true" />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={f.privacy} onChange={(e) => setF({ ...f, privacy: e.target.checked })} className="mt-1" style={{ accentColor: accent }} />
        <span>
          Ho letto l&apos;<Link href={`/m/${slug}/privacy`} className="underline" target="_blank">informativa privacy</Link> e acconsento al trattamento dei dati per gestire la prenotazione.
        </span>
      </label>
      {askReview && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={f.reviewConsent} onChange={(e) => setF({ ...f, reviewConsent: e.target.checked })} className="mt-1" style={{ accentColor: accent }} />
          <span>Dopo la visita mandatemi un messaggio per lasciare una recensione (facoltativo)</span>
        </label>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={pending} className="h-12 w-full rounded-xl text-base font-bold text-white disabled:opacity-50" style={{ background: accent }}>
        {pending ? "Invio…" : "Prenota"}
      </button>
    </form>
  );
}
