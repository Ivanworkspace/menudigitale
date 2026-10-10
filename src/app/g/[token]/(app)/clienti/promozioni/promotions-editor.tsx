"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { VisibilityEditor } from "@/components/staff/visibility-editor";
import { useAction } from "@/components/staff/use-action";
import { formatEuro, parseEuroToCents } from "@/lib/format";
import type { Promotion } from "@/domain/loyalty";
import { deletePromotion, savePromotion } from "../actions";

type Draft = Omit<Promotion, "id" | "uses" | "value" | "minSpendCents" | "maxUses"> & { id?: string; valueStr: string; minSpend: string; maxUses: string };

const empty = (): Draft => ({ name: "", kind: "code", code: "", mode: "percent", valueStr: "10", schedule: null, validFrom: null, validTo: null, maxUses: "", minSpend: "", active: true });

export function PromotionsEditor({ token, promotions, canEdit }: { token: string; promotions: Promotion[]; canEdit: boolean }) {
  const router = useRouter();
  const [d, setD] = useState<Draft | null>(null);
  const { pending, msg, run } = useAction();
  const save = () => {
    if (!d) return;
    const value = d.mode === "percent" ? Math.round(Number(d.valueStr.replace(",", ".")) * 100) : (parseEuroToCents(d.valueStr) ?? 0);
    run(
      () =>
        savePromotion(token, {
          id: d.id, name: d.name, kind: d.kind, code: d.kind === "code" ? d.code : null, mode: d.mode, value, schedule: d.schedule,
          validFrom: d.validFrom || null, validTo: d.validTo || null, maxUses: d.maxUses ? Number(d.maxUses) : null,
          minSpendCents: parseEuroToCents(d.minSpend || "0") ?? 0, active: d.active,
        }),
      { onOk: () => { setD(null); router.refresh(); } },
    );
  };
  return (
    <div className="space-y-4">
      {canEdit && <Button onClick={() => setD(empty())}>+ Nuova promozione</Button>}
      <div className="grid gap-3 md:grid-cols-2">
        {promotions.map((p) => (
          <Card key={p.id} className="flex items-start justify-between gap-3 p-4">
            <div>
              <p className="font-medium">
                {p.name} {!p.active && <Badge tone="red">Disattiva</Badge>}
              </p>
              <p className="text-sm text-slate-600">
                {p.kind === "code" ? <code className="rounded bg-slate-100 px-1.5">{p.code}</code> : "Happy hour"} · −{p.mode === "percent" ? `${p.value / 100}%` : formatEuro(p.value)}
              </p>
              <p className="text-xs text-slate-500">
                Usi {p.uses}{p.maxUses ? `/${p.maxUses}` : ""}
                {p.schedule ? ` · ${p.schedule.from}–${p.schedule.to}` : ""}
                {p.validTo ? ` · fino al ${p.validTo}` : ""}
                {p.minSpendCents ? ` · min ${formatEuro(p.minSpendCents)}` : ""}
              </p>
            </div>
            {canEdit && (
              <Button size="sm" variant="ghost" onClick={() => setD({ ...p, code: p.code ?? "", valueStr: p.mode === "percent" ? String(p.value / 100) : (p.value / 100).toFixed(2).replace(".", ","), minSpend: p.minSpendCents ? (p.minSpendCents / 100).toFixed(2).replace(".", ",") : "", maxUses: p.maxUses?.toString() ?? "" })}>
                Modifica
              </Button>
            )}
          </Card>
        ))}
        {!promotions.length && <Card className="px-5 py-10 text-center text-sm text-slate-500 md:col-span-2">Nessuna promozione. Crea un codice sconto o un happy hour.</Card>}
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Modal
        open={!!d}
        onClose={() => setD(null)}
        title={d?.id ? "Modifica promozione" : "Nuova promozione"}
        footer={
          d && (
            <>
              {d.id && <Button variant="danger" size="sm" className="mr-auto" onClick={() => confirm("Eliminare?") && run(() => deletePromotion(token, d.id!), { onOk: () => { setD(null); router.refresh(); } })}>Elimina</Button>}
              <Button variant="ghost" onClick={() => setD(null)}>Annulla</Button>
              <Button disabled={pending} onClick={save}>Salva</Button>
            </>
          )
        }
      >
        {d && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
              <Field label="Tipo">
                <Select value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as Draft["kind"] })}>
                  <option value="code">Codice sconto</option>
                  <option value="happy_hour">Happy hour / fascia oraria</option>
                </Select>
              </Field>
              {d.kind === "code" && <Field label="Codice"><Input value={d.code ?? ""} onChange={(e) => setD({ ...d, code: e.target.value.toUpperCase() })} className="font-mono" /></Field>}
              <Field label="Sconto">
                <div className="flex gap-2">
                  <Select className="w-24" value={d.mode} onChange={(e) => setD({ ...d, mode: e.target.value as Draft["mode"] })}>
                    <option value="percent">%</option>
                    <option value="amount">€</option>
                  </Select>
                  <Input inputMode="decimal" value={d.valueStr} onChange={(e) => setD({ ...d, valueStr: e.target.value })} />
                </div>
              </Field>
              <Field label="Valido dal"><Input type="date" value={d.validFrom ?? ""} onChange={(e) => setD({ ...d, validFrom: e.target.value || null })} /></Field>
              <Field label="Valido fino al"><Input type="date" value={d.validTo ?? ""} onChange={(e) => setD({ ...d, validTo: e.target.value || null })} /></Field>
              <Field label="Utilizzi massimi" hint="Vuoto = illimitati"><Input type="number" min={1} value={d.maxUses} onChange={(e) => setD({ ...d, maxUses: e.target.value })} /></Field>
              <Field label="Spesa minima (€)"><Input inputMode="decimal" value={d.minSpend} onChange={(e) => setD({ ...d, minSpend: e.target.value })} /></Field>
            </div>
            <VisibilityEditor label="Valido solo in alcuni giorni/orari" value={d.schedule} onChange={(schedule) => setD({ ...d, schedule })} />
            <Checkbox label="Attiva" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} />
          </div>
        )}
      </Modal>
    </div>
  );
}
