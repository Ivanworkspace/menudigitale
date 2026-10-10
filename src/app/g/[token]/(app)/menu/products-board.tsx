"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Toggle } from "@/components/ui/toggle";
import { SortableList } from "@/components/staff/sortable-list";
import { useAction } from "@/components/staff/use-action";
import { cn } from "@/lib/cn";
import { formatEuro } from "@/lib/format";
import { thumbUrl } from "@/lib/assets";
import { PRODUCT_TAGS, type Category, type Product } from "@/domain/menu";
import { deleteProduct, duplicateProduct, reorder, setProductAvailability } from "./actions";

export function ProductsBoard({
  token,
  basePath,
  categories,
  products,
}: {
  token: string;
  basePath: string;
  categories: Category[];
  products: Product[];
}) {
  const router = useRouter();
  const [cat, setCat] = useState<string | null>(categories[0]?.id ?? null);
  const [q, setQ] = useState("");
  const [items, setItems] = useState(products);
  const { pending, msg, run } = useAction();

  // Keep local state in sync after server refreshes.
  const [prev, setPrev] = useState(products);
  if (prev !== products) {
    setPrev(products);
    setItems(products);
  }

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of items) m.set(p.categoryId, (m.get(p.categoryId) ?? 0) + 1);
    return m;
  }, [items]);

  const needle = q.trim().toLowerCase();
  const visible = needle
    ? items.filter((p) => Object.values(p.name).some((n) => n.toLowerCase().includes(needle)))
    : items.filter((p) => p.categoryId === cat);

  const catName = (id: string) => categories.find((c) => c.id === id)?.name.it ?? "—";

  if (categories.length === 0) {
    return (
      <Card className="px-6 py-14 text-center">
        <p className="font-medium text-slate-900">Inizia creando le categorie del menu</p>
        <p className="mt-1 text-sm text-slate-500">Ad esempio Antipasti, Pizze, Bevande. Oppure importa un file CSV.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href={`${basePath}/menu/categorie`} className={buttonClass()}>Crea categorie</Link>
          <Link href={`${basePath}/menu/import`} className={buttonClass("secondary")}>Importa CSV</Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-1">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca prodotto…"
          className="mb-3 h-10 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-slate-300"
        />
        <div className="flex gap-1 overflow-x-auto lg:flex-col">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setQ("");
                setCat(c.id);
              }}
              className={cn(
                "flex items-center justify-between gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm",
                !needle && cat === c.id ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-white",
                !c.active && "opacity-60",
                c.parentId && "lg:pl-7",
              )}
            >
              <span className="truncate">
                {c.icon} {c.name.it}
              </span>
              <span className="text-xs opacity-70">{counts.get(c.id) ?? 0}</span>
            </button>
          ))}
        </div>
      </aside>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">{needle ? `Risultati per "${q}"` : catName(cat ?? "")}</h2>
          <Link
            href={`${basePath}/menu/prodotti/nuovo${cat ? `?categoria=${cat}` : ""}`}
            className={buttonClass("primary", "sm")}
          >
            <Icon name="plus" className="h-4 w-4" /> Nuovo prodotto
          </Link>
        </div>
        {msg && (
          <div className="mb-3">
            <Alert tone={msg.tone}>{msg.text}</Alert>
          </div>
        )}
        <Card className="divide-y divide-slate-100">
          {visible.length === 0 && <p className="px-5 py-10 text-center text-sm text-slate-500">Nessun prodotto.</p>}
          <SortableList
            items={visible}
            onReorder={(ids) => {
              if (needle) return;
              const order = new Map(ids.map((id, i) => [id, i]));
              setItems((all) => all.map((p) => (order.has(p.id) ? { ...p, sort: order.get(p.id)! } : p)).sort((a, b) => a.sort - b.sort));
              run(() => reorder(token, "products", ids));
            }}
            render={(p, handle) => (
              <div className="flex items-center gap-3 bg-white px-3 py-2.5">
                {!needle && handle}
                {p.images[0] ? (
                  <img src={thumbUrl(p.images[0])!} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" loading="lazy" />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded-lg bg-slate-100" />
                )}
                <Link href={`${basePath}/menu/prodotti/${p.id}`} className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-medium", p.available ? "text-slate-900" : "text-slate-400 line-through")}>
                    {p.name.it}
                    {p.isFrozen && " *"}
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <span className="tabular-nums">{formatEuro(p.priceCents)}</span>
                    {needle && <span>· {catName(p.categoryId)}</span>}
                    {p.tags.map((t) => (
                      <span key={t} title={PRODUCT_TAGS[t]?.label.it}>{PRODUCT_TAGS[t]?.icon}</span>
                    ))}
                    {p.hidden && <Badge>Nascosto</Badge>}
                    {p.allergens.length > 0 && <span>· allergeni {p.allergens.join(", ")}</span>}
                  </p>
                </Link>
                <div className="flex items-center gap-2">
                  <span className={cn("hidden text-xs sm:inline", p.available ? "text-emerald-700" : "text-red-600")}>
                    {p.available ? "Disponibile" : "Esaurito"}
                  </span>
                  <Toggle
                    checked={p.available}
                    label="Disponibile"
                    disabled={pending}
                    onChange={(v) => {
                      setItems((all) => all.map((x) => (x.id === p.id ? { ...x, available: v } : x)));
                      run(() => setProductAvailability(token, p.id, v));
                    }}
                  />
                  <details className="relative">
                    <summary className="cursor-pointer list-none rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Altre azioni">
                      ⋯
                    </summary>
                    <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg bg-white py-1 text-sm shadow-lg ring-1 ring-slate-200">
                      <Link href={`${basePath}/menu/prodotti/${p.id}`} className="block px-3 py-2 hover:bg-slate-50">Modifica</Link>
                      <button
                        className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                        onClick={() => run(() => duplicateProduct(token, p.id), { success: "Prodotto duplicato.", onOk: () => router.refresh() })}
                      >
                        Duplica
                      </button>
                      <button
                        className="block w-full px-3 py-2 text-left text-red-600 hover:bg-red-50"
                        onClick={() => {
                          if (!confirm(`Eliminare "${p.name.it}"?`)) return;
                          setItems((all) => all.filter((x) => x.id !== p.id));
                          run(() => deleteProduct(token, p.id), { success: "Prodotto eliminato." });
                        }}
                      >
                        Elimina
                      </button>
                    </div>
                  </details>
                </div>
              </div>
            )}
          />
        </Card>
      </section>
    </div>
  );
}
