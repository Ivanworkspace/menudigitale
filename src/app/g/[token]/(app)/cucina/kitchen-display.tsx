"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { where } from "firebase/firestore";
import { useLiveCollection, useRealtime } from "@/components/staff/realtime";
import { useAction } from "@/components/staff/use-action";
import { beep } from "@/components/staff/notification-center";
import { Alert } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { tr } from "@/domain/menu";
import { buildTickets, nextItemStatus, waitLevel, type Ticket } from "@/domain/kds";
import type { Order, OrderItem } from "@/domain/orders";
import { reprint, sendKitchenMessage, setStatus } from "./actions";

const DEPT_KEY = "kds.department";
const QUICK = ["Manca un ingrediente", "Pronto da ritirare", "Ritardo di 10 minuti", "Serve aiuto in cucina"];

const LEVEL: Record<string, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  late: "bg-red-600",
};

export function KitchenDisplay({ token, departments, defaultDepartment }: { token: string; departments: { id: string; name: string }[]; defaultDepartment: string | null }) {
  const { online } = useRealtime();
  const [dept, setDept] = useState<string | null>(defaultDepartment);
  const [now, setNow] = useState(() => new Date());
  const [showReady, setShowReady] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [since] = useState(() => new Date(Date.now() - 16 * 3600_000).toISOString());
  const { data: orders } = useLiveCollection<Order>("orders", [where("status", "==", "sent"), where("sentAt", ">=", since)], since);
  const { msg, run } = useAction();
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DEPT_KEY);
      if (saved !== null) setDept(saved === "all" ? null : saved);
    } catch {}
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  const tickets = useMemo(() => buildTickets(orders, dept), [orders, dept]);
  const active = tickets.filter((t) => t.status !== "ready");
  const ready = tickets.filter((t) => t.status === "ready");

  // Beep on new tickets for this department (after the first load).
  useEffect(() => {
    const keys = new Set(tickets.map((t) => t.key));
    if (seen.current) {
      const fresh = tickets.filter((t) => !seen.current!.has(t.key));
      if (fresh.length) beep(fresh.some((t) => t.urgent || t.hasCancellations));
    }
    seen.current = keys;
  }, [tickets]);

  const chooseDept = (d: string | null) => {
    setDept(d);
    try {
      localStorage.setItem(DEPT_KEY, d ?? "all");
    } catch {}
  };

  const fullscreen = () => document.documentElement.requestFullscreen?.().catch(() => {});

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100dvh-3.5rem)] bg-slate-900 px-4 py-4 text-white sm:-mx-6 sm:px-6 lg:min-h-dvh">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => chooseDept(null)} className={cn("rounded-full px-4 py-2 text-sm font-semibold", dept === null ? "bg-white text-slate-900" : "bg-slate-800")}>
          Tutti
        </button>
        {departments.map((d) => (
          <button key={d.id} onClick={() => chooseDept(d.id)} className={cn("rounded-full px-4 py-2 text-sm font-semibold", dept === d.id ? "bg-white text-slate-900" : "bg-slate-800")}>
            {d.name}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-sm">
          {!online && <span className="rounded bg-red-600 px-2 py-1 font-semibold">OFFLINE</span>}
          <span className="tabular-nums text-slate-300">{now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span>
          <button onClick={() => setShowReady(!showReady)} className="rounded-lg bg-slate-800 px-3 py-2">
            {showReady ? "Nascondi pronti" : `Pronti (${ready.length})`}
          </button>
          <button onClick={() => setMsgOpen(!msgOpen)} className="rounded-lg bg-slate-800 px-3 py-2">💬 Sala</button>
          <button onClick={fullscreen} className="rounded-lg bg-slate-800 px-3 py-2" aria-label="Schermo intero">⛶</button>
        </div>
      </div>

      {msgOpen && (
        <div className="mb-4 flex flex-wrap gap-2 rounded-xl bg-slate-800 p-3">
          {QUICK.map((q) => (
            <button key={q} onClick={() => run(() => sendKitchenMessage(token, q), { success: "Messaggio inviato alla sala.", onOk: () => setMsgOpen(false) })} className="rounded-lg bg-slate-700 px-3 py-2 text-sm">
              {q}
            </button>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const text = String(new FormData(e.currentTarget).get("m") ?? "");
              run(() => sendKitchenMessage(token, text), { success: "Messaggio inviato.", onOk: () => setMsgOpen(false) });
            }}
          >
            <input name="m" placeholder="Messaggio…" className="h-10 rounded-lg bg-slate-700 px-3 text-sm text-white placeholder:text-slate-400" />
            <button className="rounded-lg bg-white px-3 text-sm font-semibold text-slate-900">Invia</button>
          </form>
        </div>
      )}
      {msg && <div className="mb-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}

      {active.length === 0 && !showReady && <p className="py-24 text-center text-xl text-slate-400">Nessuna comanda in attesa 👌</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {(showReady ? [...active, ...ready] : active).map((t) => (
          <TicketCard key={t.key} t={t} now={now} token={token} dept={dept} />
        ))}
      </div>
    </div>
  );
}

function TicketCard({ t, now, token, dept }: { t: Ticket; now: Date; token: string; dept: string | null }) {
  const { pending, run } = useAction();
  const level = waitLevel(t.sentAt, now);
  const minutes = Math.floor((now.getTime() - new Date(t.sentAt).getTime()) / 60_000);
  const tap = (i: OrderItem) => {
    const next = nextItemStatus(i.status);
    if (next) run(() => setStatus(token, t.orderId, [i.id], next));
  };
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-2xl bg-white text-slate-900 shadow-lg", t.urgent && "ring-4 ring-red-500", t.status === "ready" && "opacity-70")}>
      <div className={cn("flex items-center justify-between px-4 py-2.5 text-white", t.status === "ready" ? "bg-emerald-700" : LEVEL[level])}>
        <span className="text-2xl font-black">Tav. {t.tableLabel}</span>
        <span className="text-right text-sm font-semibold leading-tight">
          {minutes}′
          <br />
          <span className="font-normal opacity-90">{new Date(t.sentAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 pt-2 text-xs text-slate-500">
        <span>{t.source === "qr" ? "📱 QR" : `👤 ${t.createdByName ?? ""}`}</span>
        {t.round && <span>· giro {t.round}</span>}
        {t.urgent && <span className="font-bold text-red-600">· 🔥 URGENTE</span>}
      </div>
      <ul className="flex-1 divide-y divide-slate-100 px-2 py-1">
        {t.items.map((i) => (
          <li key={i.id}>
            <button
              disabled={pending || i.status === "cancelled"}
              onClick={() => tap(i)}
              className={cn(
                "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left",
                i.status === "in_progress" && "bg-amber-50",
                i.status === "ready" && "bg-emerald-50",
                i.status === "cancelled" && "bg-red-50",
              )}
            >
              <span className={cn("w-8 shrink-0 text-xl font-black tabular-nums", i.status === "cancelled" && "line-through")}>{i.qty}</span>
              <span className="flex-1">
                <span className={cn("block text-lg font-semibold leading-tight", i.status === "cancelled" && "text-red-700 line-through")}>{tr(i.name, "it")}</span>
                {i.modifiers.length > 0 && <span className="block text-sm text-slate-600">+ {i.modifiers.map((m) => tr(m.name, "it")).join(", ")}</span>}
                {i.notes && <span className="block text-sm font-semibold text-orange-700">» {i.notes}</span>}
                {i.status === "cancelled" && <span className="block text-sm font-bold text-red-700">ANNULLATO{i.cancelReason ? `: ${i.cancelReason}` : ""}</span>}
              </span>
              <span className="text-lg">{i.status === "in_progress" ? "🔥" : i.status === "ready" ? "✅" : ""}</span>
            </button>
          </li>
        ))}
      </ul>
      {t.notes && <p className="mx-4 mb-2 rounded-lg bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-800">Note: {t.notes}</p>}
      <div className="grid grid-cols-3 gap-1 border-t border-slate-100 p-2">
        <button disabled={pending} onClick={() => run(() => setStatus(token, t.orderId, "all", "in_progress", dept))} className="rounded-lg bg-amber-100 py-2.5 text-sm font-semibold text-amber-900">
          In prep.
        </button>
        <button disabled={pending} onClick={() => run(() => setStatus(token, t.orderId, "all", "ready", dept))} className="rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white">
          Pronto
        </button>
        <button disabled={pending} onClick={() => run(() => reprint(token, t.orderId, dept))} className="rounded-lg bg-slate-100 py-2.5 text-sm font-semibold">
          🖨️
        </button>
      </div>
    </div>
  );
}
