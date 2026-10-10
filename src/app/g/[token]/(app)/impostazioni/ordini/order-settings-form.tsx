"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { useAction } from "@/components/staff/use-action";
import { parseEuroToCents } from "@/lib/format";
import type { AyceConfig } from "@/domain/ayce";
import type { OrderProtection } from "@/domain/order-guard";
import { saveAyceSettings, saveOrderProtection } from "../actions";

const eur = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export function OrderSettingsForm({ token, protection, ayce, hasLocation, radius }: { token: string; protection: OrderProtection; ayce: AyceConfig; hasLocation: boolean; radius: number }) {
  const [p, setP] = useState(protection);
  const pa = useAction();
  const [a, setA] = useState({
    ...ayce,
    priceStr: Object.fromEntries(Object.entries(ayce.prices).map(([k, v]) => [k, { adult: eur(v.adultCents), child: eur(v.childCents) }])) as Record<string, { adult: string; child: string }>,
    holidaysStr: ayce.holidays.join(", "),
    intervalMin: String(Math.round(ayce.minRoundIntervalSec / 60)),
  });
  const aa = useAction();

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Protezione ordini da casa" description="Da casa o da fuori locale non deve essere possibile inviare ordini in cucina" />
        <form className="space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); pa.run(() => saveOrderProtection(token, p), { success: "Protezione salvata." }); }}>
          <Checkbox label="Ordini solo con tavolo aperto" description="Il tavolo deve essere aperto dal personale; tavolo chiuso = solo consultazione" checked={p.requireOpenTable} onChange={(e) => setP({ ...p, requireOpenTable: e.target.checked })} />
          <Checkbox label="Apertura automatica alla prima scansione" description="Solo per ordini al tavolo (non AYCE, che richiede i coperti)" checked={p.autoOpenOnScan} onChange={(e) => setP({ ...p, autoOpenOnScan: e.target.checked })} />
          <Field label="Verifica posizione GPS" hint={hasLocation ? `Raggio configurato: ${radius} m (modificabile dall'assistenza)` : "Posizione del locale non impostata: chiedi all'assistenza"}>
            <Select value={p.geofence} onChange={(e) => setP({ ...p, geofence: e.target.value as OrderProtection["geofence"] })}>
              <option value="off">Disattivata</option>
              <option value="block">Blocca gli ordini fuori area o senza permesso</option>
              <option value="waiter_confirm">Fuori area: l&apos;ordine attende conferma del cameriere</option>
            </Select>
          </Field>
          <Checkbox label="Codice tavolo a 4 cifre" description="Cambia a ogni apertura; lo vedi nella scheda del tavolo e lo comunichi al cliente" checked={p.tableCode} onChange={(e) => setP({ ...p, tableCode: e.target.checked })} />
          <Checkbox label="Approvazione manuale del primo ordine" description="Il primo ordine di ogni tavolo arriva in cucina solo dopo la conferma del cameriere" checked={p.manualFirstApproval} onChange={(e) => setP({ ...p, manualFirstApproval: e.target.checked })} />
          <Field label="Massimo ordini al minuto per tavolo">
            <Input type="number" min={1} max={20} value={p.maxOrdersPerMinute} onChange={(e) => setP({ ...p, maxOrdersPerMinute: Number(e.target.value) })} />
          </Field>
          <p className="text-xs text-slate-500">
            Inoltre: QR univoco per tavolo (rigenerabile), sessione che scade alla chiusura del conto, prezzi sempre ricalcolati dal server,
            limiti anti-bot per indirizzo IP. Gli ordini bloccati sono registrati e segnalati allo staff.
          </p>
          {pa.msg && <Alert tone={pa.msg.tone}>{pa.msg.text}</Alert>}
          <Button type="submit" disabled={pa.pending}>Salva</Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="All you can eat" description="Prezzi a persona, giri e limiti" />
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const prices: Record<string, { adultCents: number; childCents: number }> = {};
            for (const [k, v] of Object.entries(a.priceStr)) {
              const ad = parseEuroToCents(v.adult || "0");
              const ch = parseEuroToCents(v.child || "0");
              if (ad === null || ch === null) return aa.setMsg({ tone: "danger", text: "Prezzi non validi." });
              prices[k] = { adultCents: ad, childCents: ch };
            }
            aa.run(
              () =>
                saveAyceSettings(token, {
                  prices,
                  lunchUntil: a.lunchUntil,
                  holidays: a.holidaysStr.split(/[,\s]+/).filter(Boolean),
                  weekendAsHoliday: a.weekendAsHoliday,
                  piecesPerPersonPerRound: Number(a.piecesPerPersonPerRound),
                  minRoundIntervalSec: Math.round(Number(a.intervalMin) * 60),
                  maxStayMin: a.maxStayMin ? Number(a.maxStayMin) : null,
                  leftoverPenaltyNote: a.leftoverPenaltyNote?.trim() || null,
                }),
              { success: "Impostazioni AYCE salvate." },
            );
          }}
        >
          <div className="overflow-hidden rounded-lg ring-1 ring-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr><th className="px-3 py-2">Fascia</th><th className="px-3 py-2">Adulto €</th><th className="px-3 py-2">Bambino €</th></tr>
              </thead>
              <tbody>
                {(["lunch", "dinner", "holiday"] as const).map((k) => (
                  <tr key={k} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{{ lunch: "Pranzo", dinner: "Cena", holiday: "Festivi" }[k]}</td>
                    <td className="px-3 py-1.5"><Input inputMode="decimal" value={a.priceStr[k].adult} onChange={(e) => setA({ ...a, priceStr: { ...a.priceStr, [k]: { ...a.priceStr[k], adult: e.target.value } } })} /></td>
                    <td className="px-3 py-1.5"><Input inputMode="decimal" value={a.priceStr[k].child} onChange={(e) => setA({ ...a, priceStr: { ...a.priceStr, [k]: { ...a.priceStr[k], child: e.target.value } } })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Prezzo pranzo fino alle"><Input type="time" value={a.lunchUntil} onChange={(e) => setA({ ...a, lunchUntil: e.target.value })} /></Field>
            <Field label="Pezzi per persona per giro"><Input type="number" min={1} value={a.piecesPerPersonPerRound} onChange={(e) => setA({ ...a, piecesPerPersonPerRound: Number(e.target.value) })} /></Field>
            <Field label="Minuti tra un giro e l'altro"><Input type="number" min={0} value={a.intervalMin} onChange={(e) => setA({ ...a, intervalMin: e.target.value })} /></Field>
            <Field label="Permanenza massima (minuti)" hint="Vuoto = nessun limite"><Input type="number" min={15} value={a.maxStayMin ?? ""} onChange={(e) => setA({ ...a, maxStayMin: e.target.value ? Number(e.target.value) : null })} /></Field>
          </div>
          <Field label="Giorni festivi" hint="Date separate da virgola, es. 2026-12-25, 2026-12-26">
            <Input value={a.holidaysStr} onChange={(e) => setA({ ...a, holidaysStr: e.target.value })} />
          </Field>
          <Checkbox label="Sabato e domenica a prezzo festivo" checked={a.weekendAsHoliday} onChange={(e) => setA({ ...a, weekendAsHoliday: e.target.checked })} />
          <Field label="Nota penale avanzi" hint="Mostrata ai clienti; l'addebito è manuale sul conto">
            <Textarea rows={2} value={a.leftoverPenaltyNote ?? ""} onChange={(e) => setA({ ...a, leftoverPenaltyNote: e.target.value })} />
          </Field>
          <p className="text-xs text-slate-500">Prodotti inclusi o extra e limite per prodotto si impostano nella scheda di ciascun prodotto.</p>
          {aa.msg && <Alert tone={aa.msg.tone}>{aa.msg.text}</Alert>}
          <Button type="submit" disabled={aa.pending}>Salva</Button>
        </form>
      </Card>
    </div>
  );
}
