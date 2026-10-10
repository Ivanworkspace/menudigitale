"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { CopyButton } from "@/components/ui/copy-button";
import { useAction } from "@/components/staff/use-action";
import { cn } from "@/lib/cn";
import type { ReservationConfig } from "@/domain/reservations";
import { saveReservationSettings } from "../actions";

const DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export function ReservationSettingsForm({ token, initial, url }: { token: string; initial: ReservationConfig; url: string }) {
  const [v, setV] = useState(initial);
  const { pending, msg, run } = useAction();
  const num = (k: keyof ReservationConfig, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <Input type="number" min={0} value={v[k] as number} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} />
    </Field>
  );
  return (
    <Card className="max-w-3xl">
      <CardHeader title="Prenotazione online" description="Pagina pubblica dove i clienti prenotano da soli" />
      <form className="space-y-5 p-5" onSubmit={(e) => { e.preventDefault(); run(() => saveReservationSettings(token, v), { success: "Impostazioni salvate." }); }}>
        <Checkbox label="Prenotazione online attiva" checked={v.onlineEnabled} onChange={(e) => setV({ ...v, onlineEnabled: e.target.checked })} />
        <div className="flex items-center gap-2 text-sm">
          <code className="flex-1 truncate rounded bg-slate-50 px-2 py-1.5 ring-1 ring-slate-200">{url}</code>
          <CopyButton value={url} />
        </div>
        <Checkbox label="Conferma automatica" description="Se disattivo, le prenotazioni online restano «in attesa» finché non le confermi" checked={v.autoConfirm} onChange={(e) => setV({ ...v, autoConfirm: e.target.checked })} />
        <div className="grid gap-3 sm:grid-cols-3">
          {num("maxCoversPerSlot", "Coperti massimi per fascia")}
          {num("maxPartySize", "Persone massime per prenotazione")}
          {num("durationMin", "Durata media (minuti)")}
          {num("leadTimeMin", "Preavviso minimo (minuti)")}
          {num("maxDaysAhead", "Prenotabile fino a (giorni)")}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Fasce prenotabili</p>
          {v.slots.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3">
              <div className="flex flex-wrap gap-1">
                {DAYS.map((d, j) => {
                  const on = s.weekdays.includes(j + 1);
                  return (
                    <button key={d} type="button" onClick={() => setV({ ...v, slots: v.slots.map((x, k) => (k === i ? { ...x, weekdays: on ? x.weekdays.filter((w) => w !== j + 1) : [...x.weekdays, j + 1].sort() } : x)) })} className={cn("rounded-md px-2 py-1 text-xs font-medium ring-1", on ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-300")}>
                      {d}
                    </button>
                  );
                })}
              </div>
              <Input type="time" className="w-28" value={s.from} onChange={(e) => setV({ ...v, slots: v.slots.map((x, k) => (k === i ? { ...x, from: e.target.value } : x)) })} />–
              <Input type="time" className="w-28" value={s.to} onChange={(e) => setV({ ...v, slots: v.slots.map((x, k) => (k === i ? { ...x, to: e.target.value } : x)) })} />
              ogni <Input type="number" className="w-20" min={5} value={s.intervalMin} onChange={(e) => setV({ ...v, slots: v.slots.map((x, k) => (k === i ? { ...x, intervalMin: Number(e.target.value) } : x)) })} /> min
              <button type="button" className="ml-auto text-slate-400 hover:text-red-600" onClick={() => setV({ ...v, slots: v.slots.filter((_, k) => k !== i) })} aria-label="Rimuovi">✕</button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => setV({ ...v, slots: [...v.slots, { weekdays: [], from: "19:00", to: "22:00", intervalMin: 30 }] })}>+ Fascia</Button>
        </div>
        <p className="text-xs text-slate-500">Le chiusure straordinarie impostate in Impostazioni → Locale bloccano le prenotazioni in quei giorni. Conferma via email automatica; WhatsApp tramite il pulsante 💬 nel calendario.</p>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button type="submit" disabled={pending}>Salva</Button>
      </form>
    </Card>
  );
}
