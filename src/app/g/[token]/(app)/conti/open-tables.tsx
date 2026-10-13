"use client";
import Link from "next/link";
import { where } from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { useLiveCollection } from "@/components/staff/realtime";
import { cn } from "@/lib/cn";
import { formatEuro } from "@/lib/format";
import type { TableSession } from "@/domain/orders";
import { placeLabel } from "@/domain/takeaway";

export function OpenTables({ basePath, initial }: { basePath: string; initial: TableSession[] }) {
  const { data } = useLiveCollection<TableSession>("table_sessions", [where("status", "in", ["open", "bill_requested"])], "open", initial);
  const list = [...data].sort((a, b) => Number(b.status === "bill_requested") - Number(a.status === "bill_requested") || a.tableLabel.localeCompare(b.tableLabel, "it", { numeric: true }));
  if (!list.length) return <Card className="px-5 py-10 text-center text-sm text-slate-500">Nessun tavolo aperto.</Card>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {list.map((s) => (
        <Link
          key={s.id}
          href={`${basePath}/conti?sessione=${s.id}`}
          className={cn("rounded-2xl bg-white p-4 shadow-sm ring-1 transition hover:shadow-md", s.status === "bill_requested" ? "ring-2 ring-violet-400" : "ring-slate-200")}
        >
          <p className="text-xl font-bold">{placeLabel(s.tableLabel)}</p>
          <p className="text-sm text-slate-500">{s.covers + s.coversChildren} coperti{s.mode === "ayce" ? " · AYCE" : ""}</p>
          <p className="mt-2 text-lg font-semibold tabular-nums">{formatEuro(s.totalCents)}</p>
          {s.status === "bill_requested" && <p className="text-xs font-semibold text-violet-700">🧾 Conto richiesto</p>}
        </Link>
      ))}
    </div>
  );
}
