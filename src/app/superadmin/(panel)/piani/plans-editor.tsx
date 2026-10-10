"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { MODULE_KEYS, MODULE_LABELS, type ModuleKey } from "@/domain/modules";
import { formatEuro, parseEuroToCents } from "@/lib/format";
import type { Plan } from "@/server/superadmin/queries";
import { savePlan } from "../actions";

type Draft = {
  id?: string;
  code: string;
  name: string;
  description: string;
  price: string;
  maxTables: string;
  maxProducts: string;
  maxStaff: string;
  includedModules: ModuleKey[];
  active: boolean;
  sort: number;
};

const toDraft = (p?: Plan): Draft => ({
  id: p?.id,
  code: p?.code ?? "",
  name: p?.name ?? "",
  description: p?.description ?? "",
  price: p ? (p.priceMonthCents / 100).toFixed(2).replace(".", ",") : "",
  maxTables: p?.maxTables?.toString() ?? "",
  maxProducts: p?.maxProducts?.toString() ?? "",
  maxStaff: p?.maxStaff?.toString() ?? "",
  includedModules: (p?.includedModules as ModuleKey[]) ?? [],
  active: p?.active ?? true,
  sort: p?.sort ?? 0,
});

export function PlansEditor({ plans }: { plans: Plan[] }) {
  const [editing, setEditing] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const limit = (v: string) => (v.trim() === "" ? null : Number(v));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-semibold text-slate-900">{p.name}</p>
                <p className="text-sm text-slate-500">{formatEuro(p.priceMonthCents)}/mese · {p.code}</p>
              </div>
              {!p.active && <Badge>Non attivo</Badge>}
            </div>
            {p.description && <p className="mt-2 text-sm text-slate-600">{p.description}</p>}
            <p className="mt-3 text-xs text-slate-500">
              {p.maxTables ?? "∞"} tavoli · {p.maxProducts ?? "∞"} prodotti · {p.maxStaff ?? "∞"} utenti
            </p>
            <div className="mt-3 flex flex-wrap gap-1">
              {p.includedModules.map((m) => (
                <Badge key={m} tone="sky">{MODULE_LABELS[m as ModuleKey]?.label ?? m}</Badge>
              ))}
            </div>
            <Button variant="secondary" size="sm" className="mt-4" onClick={() => setEditing(toDraft(p))}>
              Modifica
            </Button>
          </Card>
        ))}
        <button
          onClick={() => setEditing(toDraft())}
          className="flex min-h-40 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-sm font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700"
        >
          + Nuovo piano
        </button>
      </div>

      {editing && (
        <Card className="h-fit p-5">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const cents = parseEuroToCents(editing.price || "0");
              if (cents === null) return setError("Prezzo non valido.");
              start(async () => {
                const r = await savePlan({
                  id: editing.id,
                  code: editing.code,
                  name: editing.name,
                  description: editing.description,
                  priceMonthCents: cents,
                  maxTables: limit(editing.maxTables),
                  maxProducts: limit(editing.maxProducts),
                  maxStaff: limit(editing.maxStaff),
                  includedModules: editing.includedModules,
                  active: editing.active,
                  sort: editing.sort,
                });
                if (!r.ok) setError(r.error);
                else {
                  setError(null);
                  setEditing(null);
                }
              });
            }}
          >
            <h2 className="font-semibold">{editing.id ? "Modifica piano" : "Nuovo piano"}</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nome">
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
              </Field>
              <Field label="Codice">
                <Input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} required />
              </Field>
            </div>
            <Field label="Descrizione">
              <Input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prezzo mensile (€)">
                <Input inputMode="decimal" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} />
              </Field>
              <Field label="Ordine">
                <Input type="number" value={editing.sort} onChange={(e) => setEditing({ ...editing, sort: Number(e.target.value) })} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {(["maxTables", "maxProducts", "maxStaff"] as const).map((k) => (
                <Field key={k} label={{ maxTables: "Tavoli", maxProducts: "Prodotti", maxStaff: "Utenti" }[k]} hint="Vuoto = ∞">
                  <Input type="number" min={0} value={editing[k]} onChange={(e) => setEditing({ ...editing, [k]: e.target.value })} />
                </Field>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Moduli inclusi</p>
              {MODULE_KEYS.map((m) => (
                <Checkbox
                  key={m}
                  label={MODULE_LABELS[m].label}
                  checked={editing.includedModules.includes(m)}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      includedModules: e.target.checked
                        ? [...editing.includedModules, m]
                        : editing.includedModules.filter((x) => x !== m),
                    })
                  }
                />
              ))}
            </div>
            <Checkbox label="Piano attivo (selezionabile)" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
            <p className="text-xs text-slate-500">
              I moduli del piano vengono applicati ai nuovi clienti; per quelli esistenti si modificano dalla scheda cliente.
            </p>
            {error && <Alert tone="danger">{error}</Alert>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Annulla
              </Button>
              <Button type="submit" disabled={pending}>
                Salva
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
