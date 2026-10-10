"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { useAction } from "@/components/staff/use-action";
import { cn } from "@/lib/cn";
import { parseEuroToCents } from "@/lib/format";
import { saveCharges, saveVenue } from "./actions";

const DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
type Hours = { weekdays: number[]; open: string; close: string }[];
type Closure = { from: string; to: string; note?: string };
type Values = {
  displayName: string; phone: string; email: string; address: string; city: string; postalCode: string; province: string;
  openingHours: Hours; closures: Closure[]; reviewUrl: string;
  socials: { instagram: string; facebook: string; tiktok: string; website: string };
};

export function VenueForm({ token, initial, charges }: { token: string; initial: Values; charges: { coverChargeCents: number; servicePctBp: number } }) {
  const [v, setV] = useState(initial);
  const { pending, msg, run } = useAction();
  const c = useAction();
  const [cover, setCover] = useState((charges.coverChargeCents / 100).toFixed(2).replace(".", ","));
  const [service, setService] = useState(String(charges.servicePctBp / 100));
  const text = (k: keyof Values, label: string, cls?: string) => (
    <Field label={label} className={cls}>
      <Input value={v[k] as string} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
    </Field>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <form
        className="space-y-6 lg:col-span-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveVenue(token, v), { success: "Dati salvati." });
        }}
      >
        <Card>
          <CardHeader title="Dati del locale" description="Mostrati nella copertina del menu" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {text("displayName", "Nome del locale")}
            {text("phone", "Telefono")}
            {text("email", "Email")}
            {text("address", "Indirizzo")}
            {text("city", "Città")}
            <div className="grid grid-cols-2 gap-3">
              {text("postalCode", "CAP")}
              {text("province", "Provincia")}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Orari di apertura" />
          <div className="space-y-3 p-5">
            {v.openingHours.map((h, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3">
                <div className="flex flex-wrap gap-1">
                  {DAYS.map((d, j) => {
                    const day = j + 1;
                    const on = h.weekdays.includes(day);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          const weekdays = on ? h.weekdays.filter((x) => x !== day) : [...h.weekdays, day].sort();
                          setV({ ...v, openingHours: v.openingHours.map((x, k) => (k === i ? { ...x, weekdays } : x)) });
                        }}
                        className={cn("rounded-md px-2 py-1 text-xs font-medium ring-1", on ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-300")}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
                <Input type="time" className="w-28" value={h.open} onChange={(e) => setV({ ...v, openingHours: v.openingHours.map((x, k) => (k === i ? { ...x, open: e.target.value } : x)) })} />
                <span className="text-sm">–</span>
                <Input type="time" className="w-28" value={h.close} onChange={(e) => setV({ ...v, openingHours: v.openingHours.map((x, k) => (k === i ? { ...x, close: e.target.value } : x)) })} />
                <button type="button" className="ml-auto text-slate-400 hover:text-red-600" onClick={() => setV({ ...v, openingHours: v.openingHours.filter((_, k) => k !== i) })} aria-label="Rimuovi">✕</button>
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => setV({ ...v, openingHours: [...v.openingHours, { weekdays: [2, 3, 4, 5, 6, 7], open: "12:00", close: "15:00" }] })}>
              + Aggiungi fascia
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Giorni di chiusura" description="Ferie e chiusure straordinarie" />
          <div className="space-y-3 p-5">
            {v.closures.map((cl, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input type="date" className="w-40" value={cl.from} onChange={(e) => setV({ ...v, closures: v.closures.map((x, k) => (k === i ? { ...x, from: e.target.value } : x)) })} />
                <span className="text-sm">→</span>
                <Input type="date" className="w-40" value={cl.to} onChange={(e) => setV({ ...v, closures: v.closures.map((x, k) => (k === i ? { ...x, to: e.target.value } : x)) })} />
                <Input className="flex-1" placeholder="Nota (es. Ferie estive)" value={cl.note ?? ""} onChange={(e) => setV({ ...v, closures: v.closures.map((x, k) => (k === i ? { ...x, note: e.target.value } : x)) })} />
                <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => setV({ ...v, closures: v.closures.filter((_, k) => k !== i) })} aria-label="Rimuovi">✕</button>
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => { const d = new Date().toISOString().slice(0, 10); setV({ ...v, closures: [...v.closures, { from: d, to: d }] }); }}>
              + Aggiungi chiusura
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Social e recensioni" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Link recensioni Google" hint="Mostrato a fine pasto" className="sm:col-span-2">
              <Input value={v.reviewUrl} placeholder="https://g.page/r/…" onChange={(e) => setV({ ...v, reviewUrl: e.target.value })} />
            </Field>
            {(["instagram", "facebook", "tiktok", "website"] as const).map((k) => (
              <Field key={k} label={{ instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", website: "Sito web" }[k]}>
                <Input value={v.socials[k]} placeholder="https://" onChange={(e) => setV({ ...v, socials: { ...v.socials, [k]: e.target.value } })} />
              </Field>
            ))}
          </div>
        </Card>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button type="submit" disabled={pending}>{pending ? "Salvataggio…" : "Salva"}</Button>
      </form>

      <Card className="h-fit">
        <CardHeader title="Coperto e servizio" description="Applicati automaticamente al conto" />
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const cents = parseEuroToCents(cover || "0");
            const pct = Number(service.replace(",", "."));
            if (cents === null || !Number.isFinite(pct)) return c.setMsg({ tone: "danger", text: "Valori non validi." });
            c.run(() => saveCharges(token, { coverChargeCents: cents, servicePctBp: Math.round(pct * 100) }), { success: "Salvato." });
          }}
        >
          <Field label="Coperto a persona (€)">
            <Input inputMode="decimal" value={cover} onChange={(e) => setCover(e.target.value)} />
          </Field>
          <Field label="Servizio (%)" hint="0 = nessuno">
            <Input inputMode="decimal" value={service} onChange={(e) => setService(e.target.value)} />
          </Field>
          {c.msg && <Alert tone={c.msg.tone}>{c.msg.text}</Alert>}
          <Button type="submit" variant="secondary" disabled={c.pending}>Salva</Button>
        </form>
      </Card>
    </div>
  );
}
