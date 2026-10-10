"use client";
import Link from "next/link";
import { where } from "firebase/firestore";
import { buttonClass, Button } from "@/components/ui/button";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLiveCollection } from "@/components/staff/realtime";
import { useAction } from "@/components/staff/use-action";
import { cn } from "@/lib/cn";
import { formatEuro } from "@/lib/format";
import { tr } from "@/domain/menu";
import { orderProgress, type Order, type ServiceRequest, type TableSession } from "@/domain/orders";
import { approve } from "./actions";
import { setStatus } from "../cucina/actions";
import { resolveRequest } from "../sala/actions";

const BLOCK_LABEL: Record<string, string> = {
  outside_area: "fuori area",
  outside_area_join: "accesso da fuori area",
  geo_denied: "posizione negata",
  session_expired: "QR vecchio / sessione chiusa",
  table_closed: "tavolo chiuso",
  bad_code: "codice errato",
  rate_limited: "troppi ordini",
  ordering_disabled: "ordini disattivati",
};

const PROGRESS: Record<string, { label: string; tone: "amber" | "sky" | "violet" | "green" | "slate" | "red" }> = {
  pending: { label: "Da confermare", tone: "amber" },
  sent: { label: "Inviato", tone: "sky" },
  preparing: { label: "In preparazione", tone: "violet" },
  ready: { label: "Pronto", tone: "green" },
  served: { label: "Servito", tone: "slate" },
  cancelled: { label: "Annullato", tone: "red" },
};

export function OrdersBoard({
  token,
  basePath,
  since,
  blocks,
  canApprove,
}: {
  token: string;
  basePath: string;
  since: string;
  blocks: { id: string; tableLabel: string; reason: string; distanceM: number | null; createdAt: string }[];
  canApprove: boolean;
}) {
  const { data: orders } = useLiveCollection<Order>("orders", [where("createdAt", ">=", since)], since);
  const { data: requests } = useLiveCollection<ServiceRequest>("service_requests", [where("status", "==", "open")], "open");
  const { data: sessions } = useLiveCollection<TableSession>("table_sessions", [where("status", "in", ["open", "bill_requested"])], "open");
  const { pending, msg, run } = useAction();

  const pendingOrders = orders.filter((o) => o.status === "pending_approval").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const active = orders
    .filter((o) => o.status === "sent" && orderProgress(o) !== "served" && orderProgress(o) !== "cancelled")
    .sort((a, b) => (a.sentAt ?? a.createdAt).localeCompare(b.sentAt ?? b.createdAt));
  const ready = active.filter((o) => orderProgress(o) === "ready");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ordini</h1>
          <p className="text-sm text-slate-500">Aggiornati in tempo reale.</p>
        </div>
        <div className="flex gap-2">
          <Link href={`${basePath}/ordini/storico`} className={buttonClass("secondary", "lg")}>Storico comande</Link>
          <Link href={`${basePath}/ordini/nuovo`} className={buttonClass("primary", "lg")}>+ Nuovo ordine</Link>
        </div>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      {(pendingOrders.length > 0 || requests.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {pendingOrders.length > 0 && (
            <Card className="ring-2 ring-amber-300">
              <CardHeader title={`Da confermare (${pendingOrders.length})`} description="Ordini dal QR in attesa del cameriere" />
              <ul className="divide-y divide-slate-100">
                {pendingOrders.map((o) => (
                  <li key={o.id} className="space-y-2 px-5 py-3">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">Tavolo {o.tableLabel}</p>
                      <Badge tone="amber">{o.approvalReason === "geo" ? "Posizione non verificata" : "Primo ordine"}</Badge>
                    </div>
                    <p className="text-sm text-slate-600">{o.items.map((i) => `${i.qty}× ${tr(i.name, "it")}`).join(", ")}</p>
                    {canApprove && (
                      <div className="flex gap-2">
                        <Button size="sm" disabled={pending} onClick={() => run(() => approve(token, o.id, true))}>Conferma e invia</Button>
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => approve(token, o.id, false))}>Rifiuta</Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {requests.length > 0 && (
            <Card>
              <CardHeader title={`Richieste dai tavoli (${requests.length})`} />
              <ul className="divide-y divide-slate-100">
                {requests.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span>
                      {r.type === "call_waiter" ? "🙋 Chiama cameriere" : "🧾 Richiede il conto"} · <strong>Tavolo {r.tableLabel}</strong> ·{" "}
                      {new Date(r.createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <Button size="sm" variant="secondary" onClick={() => run(() => resolveRequest(token, r.id))}>Fatto</Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {ready.length > 0 && (
        <Alert tone="success" title={`Pronti da servire: ${ready.length}`}>
          {ready.map((o) => `Tavolo ${o.tableLabel}`).join(" · ")}
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {active.length === 0 && <p className="text-sm text-slate-500">Nessun ordine in corso.</p>}
        {active.map((o) => {
          const pr = orderProgress(o);
          const mins = Math.floor((Date.now() - new Date(o.sentAt ?? o.createdAt).getTime()) / 60_000);
          return (
            <Card key={o.id} className={cn("p-4", pr === "ready" && "ring-2 ring-emerald-400")}>
              <div className="flex items-center justify-between">
                <p className="text-lg font-bold">Tavolo {o.tableLabel}</p>
                <Badge tone={PROGRESS[pr].tone}>{PROGRESS[pr].label}</Badge>
              </div>
              <p className="text-xs text-slate-500">
                {o.source === "qr" ? "📱 QR" : `👤 ${o.createdByName}`} · {mins} min fa {o.urgent && "· 🔥 urgente"}
              </p>
              <ul className="mt-2 space-y-0.5 text-sm">
                {o.items.map((i) => (
                  <li key={i.id} className={cn("flex justify-between", i.status === "cancelled" && "text-slate-400 line-through")}>
                    <span>
                      {i.qty}× {tr(i.name, "it")}
                    </span>
                    <span className="text-xs text-slate-500">{i.status === "ready" ? "✅" : i.status === "in_progress" ? "🔥" : i.status === "held" ? "⏸" : i.status === "served" ? "🍽" : ""}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center justify-between">
                {pr === "ready" ? (
                  <Button size="sm" disabled={pending} onClick={() => run(() => setStatus(token, o.id, "all", "served"))}>
                    🍽 Servito
                  </Button>
                ) : (
                  <span />
                )}
                <span className="text-sm font-semibold tabular-nums">{formatEuro(o.totalCents)}</span>
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader title="Tavoli aperti" description={`${sessions.length} sessioni attive`} />
        <div className="flex flex-wrap gap-2 p-5">
          {sessions
            .sort((a, b) => a.tableLabel.localeCompare(b.tableLabel, "it", { numeric: true }))
            .map((s) => (
              <Link key={s.id} href={`${basePath}/ordini/nuovo?sessione=${s.id}`} className="rounded-xl bg-slate-50 px-4 py-2 text-sm ring-1 ring-slate-200 hover:bg-white">
                <strong>{s.tableLabel}</strong> · {s.covers + s.coversChildren} cop. · {formatEuro(s.totalCents)}
              </Link>
            ))}
        </div>
      </Card>

      {blocks.length > 0 && (
        <Card>
          <CardHeader title="Ordini bloccati (ultime 12 ore)" description="Tentativi respinti dalla protezione ordini da casa" />
          <ul className="divide-y divide-slate-100 text-sm">
            {blocks.map((b) => (
              <li key={b.id} className="flex justify-between px-5 py-2">
                <span>
                  Tavolo {b.tableLabel} · {BLOCK_LABEL[b.reason] ?? b.reason}
                  {b.distanceM ? ` · ${b.distanceM} m` : ""}
                </span>
                <span className="text-slate-500">{new Date(b.createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
