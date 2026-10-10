"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, Card, Stat } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useAction } from "@/components/staff/use-action";
import { formatEuro, parseEuroToCents } from "@/lib/format";
import { stockLevel, UNIT_LABELS, type Ingredient, type Unit } from "@/domain/inventory";
import { moveStock, saveIngredient } from "./actions";

type Move = { ing: Ingredient; kind: "load" | "waste" | "inventory"; qty: string; note: string };

export function StockBoard({ token, items }: { token: string; items: Ingredient[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<null | { id?: string; name: string; unit: Unit; minStock: string; cost: string; active: boolean }>(null);
  const [move, setMove] = useState<Move | null>(null);
  const [q, setQ] = useState("");
  const { pending, msg, run } = useAction();
  const low = items.filter((i) => i.active && stockLevel(i) !== "ok");
  const value = items.reduce((s, i) => s + (i.costPerUnitCents ? Math.max(0, i.stock) * i.costPerUnitCents : 0), 0);
  const list = items.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Ingredienti" value={items.length} />
        <Stat label="Sotto soglia" value={low.length} hint={low.slice(0, 3).map((i) => i.name).join(", ")} />
        <Stat label="Valore stimato" value={formatEuro(Math.round(value))} />
      </div>
      <div className="flex gap-2">
        <Input placeholder="Cerca ingrediente…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Button onClick={() => setEdit({ name: "", unit: "kg", minStock: "0", cost: "", active: true })}>+ Ingrediente</Button>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Card className="divide-y divide-slate-100">
        {list.map((i) => {
          const level = stockLevel(i);
          return (
            <div key={i.id} className={`flex flex-wrap items-center gap-3 px-5 py-3 ${i.active ? "" : "opacity-50"}`}>
              <div className="min-w-40 flex-1">
                <p className="font-medium">{i.name}</p>
                <p className="text-xs text-slate-500">Soglia minima {i.minStock} {UNIT_LABELS[i.unit]}{i.costPerUnitCents ? ` · ${formatEuro(i.costPerUnitCents)}/${i.unit}` : ""}</p>
              </div>
              <span className="text-lg font-semibold tabular-nums">{i.stock} {UNIT_LABELS[i.unit]}</span>
              {level === "out" ? <Badge tone="red">Esaurito</Badge> : level === "low" ? <Badge tone="amber">Sotto soglia</Badge> : <Badge tone="green">OK</Badge>}
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" onClick={() => setMove({ ing: i, kind: "load", qty: "", note: "" })}>Carico</Button>
                <Button size="sm" variant="ghost" onClick={() => setMove({ ing: i, kind: "waste", qty: "", note: "" })}>Scarico</Button>
                <Button size="sm" variant="ghost" onClick={() => setMove({ ing: i, kind: "inventory", qty: String(i.stock), note: "" })}>Inventario</Button>
                <Button size="sm" variant="ghost" onClick={() => setEdit({ id: i.id, name: i.name, unit: i.unit, minStock: String(i.minStock), cost: i.costPerUnitCents ? (i.costPerUnitCents / 100).toFixed(2).replace(".", ",") : "", active: i.active })}>✎</Button>
              </div>
            </div>
          );
        })}
        {!list.length && <p className="px-5 py-10 text-center text-sm text-slate-500">Nessun ingrediente. Aggiungi gli ingredienti e poi collega le ricette ai prodotti.</p>}
      </Card>

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Modifica ingrediente" : "Nuovo ingrediente"}
        footer={edit && (
          <>
            <Button variant="ghost" onClick={() => setEdit(null)}>Annulla</Button>
            <Button disabled={pending} onClick={() => run(() => saveIngredient(token, { id: edit.id, name: edit.name, unit: edit.unit, minStock: Number(edit.minStock.replace(",", ".")) || 0, costPerUnitCents: edit.cost ? parseEuroToCents(edit.cost) : null, active: edit.active }), { onOk: () => { setEdit(null); router.refresh(); } })}>Salva</Button>
          </>
        )}
      >
        {edit && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome" className="sm:col-span-2"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></Field>
            <Field label="Unità di misura">
              <Select value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value as Unit })}>
                {Object.keys(UNIT_LABELS).map((u) => <option key={u}>{u}</option>)}
              </Select>
            </Field>
            <Field label="Soglia minima"><Input inputMode="decimal" value={edit.minStock} onChange={(e) => setEdit({ ...edit, minStock: e.target.value })} /></Field>
            <Field label="Costo per unità (€)" hint="Facoltativo, per il valore di magazzino"><Input inputMode="decimal" value={edit.cost} onChange={(e) => setEdit({ ...edit, cost: e.target.value })} /></Field>
            <div className="flex items-end pb-2"><Checkbox label="Attivo" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /></div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!move}
        onClose={() => setMove(null)}
        title={move ? `${move.kind === "load" ? "Carico" : move.kind === "waste" ? "Scarico / scarto" : "Inventario"} · ${move.ing.name}` : ""}
        footer={move && (
          <>
            <Button variant="ghost" onClick={() => setMove(null)}>Annulla</Button>
            <Button disabled={pending} onClick={() => run(() => moveStock(token, move.ing.id, move.kind, Number(move.qty.replace(",", ".")), move.note), { onOk: () => { setMove(null); router.refresh(); } })}>Registra</Button>
          </>
        )}
      >
        {move && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={move.kind === "inventory" ? `Quantità contata (${move.ing.unit})` : `Quantità (${move.ing.unit})`}>
              <Input inputMode="decimal" value={move.qty} onChange={(e) => setMove({ ...move, qty: e.target.value })} autoFocus />
            </Field>
            <Field label="Nota"><Input value={move.note} onChange={(e) => setMove({ ...move, note: e.target.value })} placeholder={move.kind === "load" ? "Fornitore, DDT…" : "Motivo"} /></Field>
            <p className="text-xs text-slate-500 sm:col-span-2">Giacenza attuale: {move.ing.stock} {move.ing.unit}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
