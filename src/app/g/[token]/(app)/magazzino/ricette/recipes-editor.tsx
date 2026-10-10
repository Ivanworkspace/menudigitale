"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { useAction } from "@/components/staff/use-action";
import { cn } from "@/lib/cn";
import { saveRecipe } from "../actions";

type P = { id: string; name: string; category: string; recipe: { ingredientId: string; qty: number }[] };

export function RecipesEditor({ token, products, ingredients }: { token: string; products: P[]; ingredients: { id: string; name: string; unit: string }[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<string | null>(products[0]?.id ?? null);
  const [q, setQ] = useState("");
  const current = products.find((p) => p.id === sel) ?? null;
  const [lines, setLines] = useState<{ ingredientId: string; qty: string }[]>(current?.recipe.map((r) => ({ ingredientId: r.ingredientId, qty: String(r.qty) })) ?? []);
  const { pending, msg, run } = useAction();
  const pick = (p: P) => {
    setSel(p.id);
    setLines(p.recipe.map((r) => ({ ingredientId: r.ingredientId, qty: String(r.qty) })));
  };
  const unit = (id: string) => ingredients.find((i) => i.id === id)?.unit ?? "";

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <Card className="max-h-[70vh] overflow-y-auto">
        <div className="p-3"><Input placeholder="Cerca prodotto…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <ul className="divide-y divide-slate-100">
          {products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).map((p) => (
            <li key={p.id}>
              <button onClick={() => pick(p)} className={cn("flex w-full justify-between px-4 py-2 text-left text-sm", sel === p.id ? "bg-slate-900 text-white" : "hover:bg-slate-50")}>
                <span>{p.name}<span className="block text-xs opacity-60">{p.category}</span></span>
                <span className="text-xs opacity-70">{p.recipe.length ? `${p.recipe.length} ingr.` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {current && (
        <Card>
          <CardHeader title={`Ricetta: ${current.name}`} description="Quantità consumate per una porzione venduta" />
          <div className="space-y-3 p-5">
            {ingredients.length === 0 && <Alert tone="info">Aggiungi prima gli ingredienti nella scheda Scorte.</Alert>}
            {lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={l.ingredientId} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, ingredientId: e.target.value } : x)))}>
                  <option value="">— Ingrediente —</option>
                  {ingredients.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </Select>
                <Input className="w-28" inputMode="decimal" value={l.qty} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, qty: e.target.value } : x)))} />
                <span className="w-8 text-sm text-slate-500">{unit(l.ingredientId)}</span>
                <button className="text-slate-400 hover:text-red-600" onClick={() => setLines(lines.filter((_, k) => k !== i))} aria-label="Rimuovi">✕</button>
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => setLines([...lines, { ingredientId: "", qty: "" }])}>+ Ingrediente</Button>
            {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
            <div>
              <Button disabled={pending} onClick={() => run(() => saveRecipe(token, current.id, lines.map((l) => ({ ingredientId: l.ingredientId, qty: Number(l.qty.replace(",", ".")) }))), { success: "Ricetta salvata.", onOk: () => router.refresh() })}>
                Salva ricetta
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
