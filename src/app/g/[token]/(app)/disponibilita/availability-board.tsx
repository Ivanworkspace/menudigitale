"use client";
import { useState } from "react";
import { Alert, Card } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import { useAction } from "@/components/staff/use-action";
import { cn } from "@/lib/cn";
import { setProductAvailability } from "../menu/actions";

type P = { id: string; categoryId: string; name: string; available: boolean };

export function AvailabilityBoard({ token, categories, products }: { token: string; categories: { id: string; name: string }[]; products: P[] }) {
  const [items, setItems] = useState(products);
  const [q, setQ] = useState("");
  const [onlySoldOut, setOnlySoldOut] = useState(false);
  const { msg, run } = useAction();
  const needle = q.trim().toLowerCase();
  const filtered = items.filter((p) => (!needle || p.name.toLowerCase().includes(needle)) && (!onlySoldOut || !p.available));
  const soldOut = items.filter((p) => !p.available).length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca…" className="h-11 flex-1 rounded-lg bg-white px-3 ring-1 ring-slate-300" />
        <button
          onClick={() => setOnlySoldOut(!onlySoldOut)}
          className={cn("h-11 rounded-lg px-4 text-sm font-medium ring-1", onlySoldOut ? "bg-red-600 text-white ring-red-600" : "bg-white ring-slate-300")}
        >
          Esauriti ({soldOut})
        </button>
      </div>
      {msg && <div className="mb-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {categories.map((c) => {
          const list = filtered.filter((p) => p.categoryId === c.id);
          if (!list.length) return null;
          return (
            <Card key={c.id}>
              <p className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700">{c.name}</p>
              <ul className="divide-y divide-slate-100">
                {list.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className={cn("text-sm", !p.available && "text-red-600 line-through")}>{p.name}</span>
                    <Toggle
                      checked={p.available}
                      label={`Disponibile: ${p.name}`}
                      onChange={(v) => {
                        setItems((all) => all.map((x) => (x.id === p.id ? { ...x, available: v } : x)));
                        run(() => setProductAvailability(token, p.id, v));
                      }}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}
