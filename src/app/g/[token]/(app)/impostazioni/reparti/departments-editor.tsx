"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { useAction } from "@/components/staff/use-action";
import type { Department } from "@/domain/menu";
import { deleteDepartment, saveDepartment } from "../../menu/actions";

export function DepartmentsEditor({ token, departments, counts }: { token: string; departments: Department[]; counts: Record<string, number> }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const { pending, msg, run } = useAction();
  return (
    <Card className="max-w-2xl">
      <CardHeader title="Reparti di produzione" description="Ogni prodotto invia la comanda al proprio reparto (cucina, bar, pizzeria…). Le stampanti si collegano ai reparti." />
      <ul className="divide-y divide-slate-100">
        {departments.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-5 py-3">
            <span className="flex-1 text-sm font-medium">{d.name}</span>
            <span className="text-xs text-slate-500">{counts[d.id] ?? 0} prodotti</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const n = prompt("Nuovo nome", d.name);
                if (n) run(() => saveDepartment(token, { id: d.id, name: n }), { onOk: () => router.refresh() });
              }}
            >
              Rinomina
            </Button>
            <Button variant="ghost" size="sm" onClick={() => confirm(`Eliminare ${d.name}?`) && run(() => deleteDepartment(token, d.id), { onOk: () => router.refresh() })}>
              Elimina
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2 border-t border-slate-100 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveDepartment(token, { name }), { onOk: () => { setName(""); router.refresh(); } });
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Griglia" required />
        <Button type="submit" disabled={pending}>Aggiungi</Button>
      </form>
      {msg && <div className="px-5 pb-5"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
    </Card>
  );
}
