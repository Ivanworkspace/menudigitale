"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { CopyButton } from "@/components/ui/copy-button";
import { useAction } from "@/components/staff/use-action";
import { cn } from "@/lib/cn";
import type { TakeawayConfig } from "@/domain/takeaway";
import { saveTakeawaySettings } from "./actions";

const DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export function TakeawaySettingsForm({ token, initial, menus, url }: { token: string; initial: TakeawayConfig; menus: { id: string; name: string }[]; url: string }) {
  const [v, setV] = useState(initial);
  const [minEuro, setMinEuro] = useState((initial.minOrderCents / 100).toFixed(2).replace(".", ","));
  const { pending, msg, run } = useAction();
  const setWin = (i: number, patch: Partial<TakeawayConfig["windows"][number]>) => setV({ ...v, windows: v.windows.map((x, k) => (k === i ? { ...x, ...patch } : x)) });

  return (
    <Card className="max-w-3xl">
      <CardHeader title="Ordini d'asporto" description="I clienti ordinano dal sito o dai social, scelgono l'orario di ritiro e pagano in cassa al ritiro" />
      <form
        className="space-y-5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const cents = Math.round(Number(minEuro.replace(",", ".")) * 100) || 0;
          run(() => saveTakeawaySettings(token, { ...v, minOrderCents: cents }), { success: "Impostazioni salvate." });
        }}
      >
        <Checkbox label="Ordini d'asporto online attivi" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} />
        <div className="space-y-1">
          <p className="text-sm font-medium">Link da condividere (sito, Instagram, Google, WhatsApp)</p>
          <div className="flex items-center gap-2 text-sm">
            <code className="flex-1 truncate rounded bg-slate-50 px-2 py-1.5 ring-1 ring-slate-200">{url}</code>
            <CopyButton value={url} />
          </div>
        </div>
        <Checkbox
          label="Conferma manuale di ogni ordine"
          description="Consigliato: l'ordine arriva in cucina solo dopo che lo confermi dalla pagina Asporto. Se disattivo, va subito in cucina."
          checked={v.manualAccept}
          onChange={(e) => setV({ ...v, manualAccept: e.target.checked })}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Intervallo tra gli orari di ritiro (minuti)">
            <Input type="number" min={5} value={v.slotMinutes} onChange={(e) => setV({ ...v, slotMinutes: Number(e.target.value) })} />
          </Field>
          <Field label="Ordini massimi per orario" hint="Evita che arrivino troppi ordini allo stesso orario">
            <Input type="number" min={1} value={v.maxOrdersPerSlot} onChange={(e) => setV({ ...v, maxOrdersPerSlot: Number(e.target.value) })} />
          </Field>
          <Field label="Tempo minimo di preparazione (minuti)" hint="Il primo orario proposto è adesso + questo tempo">
            <Input type="number" min={0} value={v.leadMinutes} onChange={(e) => setV({ ...v, leadMinutes: Number(e.target.value) })} />
          </Field>
          <Field label="Ordine minimo (€)" hint="0 = nessun minimo">
            <Input inputMode="decimal" value={minEuro} onChange={(e) => setMinEuro(e.target.value)} />
          </Field>
          <Field label="Listino prezzi" hint="Puoi creare un listino «Asporto» in Menu → Menu e listini">
            <Select value={v.menuId ?? ""} onChange={(e) => setV({ ...v, menuId: e.target.value || null })}>
              <option value="">Automatico in base all&apos;orario</option>
              {menus.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Fasce orarie di ritiro</p>
          {v.windows.map((w, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3">
              <div className="flex flex-wrap gap-1">
                {DAYS.map((d, j) => {
                  const on = w.weekdays.includes(j + 1);
                  return (
                    <button key={d} type="button" onClick={() => setWin(i, { weekdays: on ? w.weekdays.filter((x) => x !== j + 1) : [...w.weekdays, j + 1].sort() })} className={cn("rounded-md px-2 py-1 text-xs font-medium ring-1", on ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-300")}>
                      {d}
                    </button>
                  );
                })}
              </div>
              <Input type="time" className="w-28" value={w.from} onChange={(e) => setWin(i, { from: e.target.value })} />–
              <Input type="time" className="w-28" value={w.to} onChange={(e) => setWin(i, { to: e.target.value })} />
              <button type="button" className="ml-auto text-slate-400 hover:text-red-600" onClick={() => setV({ ...v, windows: v.windows.filter((_, k) => k !== i) })} aria-label="Rimuovi">✕</button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => setV({ ...v, windows: [...v.windows, { weekdays: [], from: "19:00", to: "22:00" }] })}>+ Fascia</Button>
        </div>
        <Field label="Messaggio per i clienti" hint="Mostrato in cima alla pagina d'ordine">
          <Textarea rows={2} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
        </Field>
        <p className="text-xs text-slate-500">
          Gli ordini d&apos;asporto arrivano in cucina e sulle stampanti come quelli dei tavoli («Asporto 3 · Mario»). Il pagamento si registra in Conti e cassa al ritiro: nessun pagamento online. Le chiusure straordinarie bloccano anche l&apos;asporto.
        </p>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button type="submit" disabled={pending}>Salva</Button>
      </form>
    </Card>
  );
}
