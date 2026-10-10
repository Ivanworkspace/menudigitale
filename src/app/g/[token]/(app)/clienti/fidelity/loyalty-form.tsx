"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { useAction } from "@/components/staff/use-action";
import { parseEuroToCents } from "@/lib/format";
import type { LoyaltyConfig } from "@/domain/loyalty";
import { saveLoyalty } from "../actions";

export function LoyaltyForm({ token, initial }: { token: string; initial: LoyaltyConfig }) {
  const [v, setV] = useState(initial);
  const [stampMin, setStampMin] = useState((initial.stampMinCents / 100).toFixed(2).replace(".", ","));
  const { pending, msg, run } = useAction();
  return (
    <Card className="max-w-3xl">
      <CardHeader title="Programma fedeltà" description="I punti o i timbri si accumulano chiudendo un conto associato al cliente" />
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveLoyalty(token, { ...v, stampMinCents: parseEuroToCents(stampMin || "0") ?? 0 }), { success: "Programma salvato." });
        }}
      >
        <Checkbox label="Programma attivo" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Tipo">
            <Select value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value as LoyaltyConfig["mode"] })}>
              <option value="points">Punti</option>
              <option value="stamps">Timbri (tessera)</option>
            </Select>
          </Field>
          {v.mode === "points" ? (
            <Field label="Punti per ogni euro"><Input type="number" min={0} step="0.5" value={v.pointsPerEuro} onChange={(e) => setV({ ...v, pointsPerEuro: Number(e.target.value) })} /></Field>
          ) : (
            <Field label="Spesa minima per un timbro (€)"><Input inputMode="decimal" value={stampMin} onChange={(e) => setStampMin(e.target.value)} /></Field>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Premi</p>
          {v.rewards.map((r, i) => (
            <div key={r.id} className="grid grid-cols-[1fr_100px_1fr_auto] items-end gap-2">
              <Field label="Nome"><Input value={r.name} onChange={(e) => setV({ ...v, rewards: v.rewards.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} /></Field>
              <Field label={v.mode === "points" ? "Punti" : "Timbri"}><Input type="number" min={1} value={r.cost} onChange={(e) => setV({ ...v, rewards: v.rewards.map((x, k) => (k === i ? { ...x, cost: Number(e.target.value) } : x)) })} /></Field>
              <Field label="Descrizione"><Input value={r.description} onChange={(e) => setV({ ...v, rewards: v.rewards.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)) })} /></Field>
              <button type="button" className="pb-2 text-slate-400 hover:text-red-600" onClick={() => setV({ ...v, rewards: v.rewards.filter((_, k) => k !== i) })} aria-label="Rimuovi">✕</button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => setV({ ...v, rewards: [...v.rewards, { id: Math.random().toString(36).slice(2, 10), name: "", cost: 10, description: "" }] })}>+ Premio</Button>
        </div>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button type="submit" disabled={pending}>Salva</Button>
      </form>
    </Card>
  );
}
