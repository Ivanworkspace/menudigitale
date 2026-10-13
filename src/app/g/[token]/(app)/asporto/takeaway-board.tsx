"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { where } from "firebase/firestore";
import { Button, buttonClass } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/field";
import { useLiveCollection } from "@/components/staff/realtime";
import { useAction } from "@/components/staff/use-action";
import { formatEuro } from "@/lib/format";
import { tr } from "@/domain/menu";
import { orderProgress, orderTotal, type Order, type TableSession } from "@/domain/orders";
import { TAKEAWAY_STATUS_LABELS, type TakeawayInfo, type TakeawayStatus } from "@/domain/takeaway";
import { moveTakeaway } from "./actions";

type Session = TableSession & { takeaway: TakeawayInfo };

const TONE: Record<TakeawayStatus, BadgeTone> = {
  pending: "amber",
  accepted: "sky",
  ready: "green",
  picked_up: "slate",
  rejected: "red",
};

const COLUMNS: { title: string; statuses: TakeawayStatus[] }[] = [
  { title: "Da confermare", statuses: ["pending"] },
  { title: "In preparazione", statuses: ["accepted"] },
  { title: "Pronti da ritirare", statuses: ["ready"] },
];

export function TakeawayBoard({ token, basePath, day, initial, canBill }: { token: string; basePath: string; day: string; initial: Session[]; canBill: boolean }) {
  const { data: sessions } = useLiveCollection<Session>("table_sessions", [where("takeaway.day", "==", day)], day, initial);
  const since = useMemo(() => new Date(Date.now() - 18 * 3600_000).toISOString(), []);
  const { data: orders } = useLiveCollection<Order>("orders", [where("createdAt", ">=", since)], since);
  const { pending, msg, run } = useAction();
  const [rejecting, setRejecting] = useState<Session | null>(null);
  const [reason, setReason] = useState("");
  const [showDone, setShowDone] = useState(false);

  const bySession = useMemo(() => {
    const m = new Map<string, Order[]>();
    for (const o of orders) if (o.source === "takeaway") m.set(o.tableSessionId, [...(m.get(o.tableSessionId) ?? []), o]);
    return m;
  }, [orders]);

  const sorted = [...sessions].sort((a, b) => a.takeaway.pickupTime.localeCompare(b.takeaway.pickupTime) || a.takeaway.number - b.takeaway.number);
  const done = sorted.filter((s) => s.takeaway.status === "picked_up" || s.takeaway.status === "rejected");
  const doneTotal = done.filter((s) => s.takeaway.status === "picked_up").reduce((n, s) => n + s.totalCents, 0);

  const move = (s: Session, to: "accepted" | "ready" | "rejected", why?: string) =>
    run(() => moveTakeaway(token, s.id, to, why), { success: to === "accepted" ? `Asporto n. ${s.takeaway.number} confermato e inviato in cucina.` : undefined });

  const card = (s: Session) => {
    const tk = s.takeaway;
    const os = (bySession.get(s.id) ?? []).filter((o) => o.status !== "rejected");
    const items = os.flatMap((o) => o.items).filter((i) => i.status !== "cancelled");
    // Pickup time and phone are already in the header: show only the customer's notes.
    const notes = os.map((o) => o.notes.replace(/^Ritiro ore \d{2}:\d{2} · Tel\. [^·]+(· )?/, "").trim()).filter(Boolean);
    const progress = os.find((o) => o.status === "sent");
    return (
      <Card key={s.id} className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-lg font-bold">
              n. {tk.number} · {tk.customerName}
            </p>
            <p className="text-sm text-slate-600">
              Ritiro <strong className="text-slate-900">{tk.pickupTime}</strong> ·{" "}
              <a className="underline" href={`tel:${tk.phone}`}>{tk.phone}</a>
            </p>
          </div>
          <Badge tone={TONE[tk.status]}>{TAKEAWAY_STATUS_LABELS[tk.status]}</Badge>
        </div>
        <ul className="mt-3 space-y-0.5 text-sm">
          {items.map((i) => (
            <li key={i.id}>
              <strong>{i.qty}×</strong> {tr(i.name, "it")}
              {i.modifiers.length > 0 && <span className="text-slate-500"> ({i.modifiers.map((m) => tr(m.name, "it")).join(", ")})</span>}
              {i.notes && <span className="italic text-slate-500"> “{i.notes}”</span>}
            </li>
          ))}
          {!items.length && <li className="text-slate-400">Caricamento…</li>}
        </ul>
        {notes.length > 0 && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{notes.join(" · ")}</p>}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-lg font-bold tabular-nums">{formatEuro(orderTotal(items))}</span>
          {progress && tk.status === "accepted" && <span className="text-xs text-slate-500">Cucina: {orderProgress(progress) === "preparing" ? "in preparazione" : orderProgress(progress) === "ready" ? "pronto" : "inviato"}</span>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {tk.status === "pending" && (
            <>
              <Button disabled={pending} onClick={() => move(s, "accepted")}>Conferma</Button>
              <Button variant="secondary" disabled={pending} onClick={() => { setRejecting(s); setReason(""); }}>Rifiuta</Button>
            </>
          )}
          {tk.status === "accepted" && <Button disabled={pending} onClick={() => move(s, "ready")}>Segna pronto</Button>}
          {(tk.status === "accepted" || tk.status === "ready") && canBill && (
            <Link href={`${basePath}/conti?sessione=${s.id}`} className={buttonClass(tk.status === "ready" ? "primary" : "secondary")}>
              Incassa e consegna
            </Link>
          )}
          {(tk.status === "accepted" || tk.status === "ready") && (
            <Button variant="ghost" disabled={pending} onClick={() => { setRejecting(s); setReason("Non ritirato"); }}>Annulla</Button>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((c) => {
          const list = sorted.filter((s) => c.statuses.includes(s.takeaway.status));
          return (
            <section key={c.title} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {c.title} ({list.length})
              </h2>
              {list.map(card)}
              {!list.length && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">Nessun ordine</p>}
            </section>
          );
        })}
      </div>

      <div>
        <button onClick={() => setShowDone(!showDone)} className="text-sm font-medium text-slate-600 underline">
          {showDone ? "Nascondi" : "Mostra"} ritirati e annullati ({done.length}) · incassato {formatEuro(doneTotal)}
        </button>
        {showDone && <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{done.map(card)}</div>}
      </div>

      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title={rejecting?.takeaway.status === "pending" ? "Rifiuta ordine" : "Annulla ordine"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)}>Indietro</Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => {
                if (rejecting) move(rejecting, "rejected", reason);
                setRejecting(null);
              }}
            >
              Conferma
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">Il cliente vedrà il motivo nella pagina del suo ordine. Se l&apos;ordine era già in cucina, la comanda viene annullata.</p>
        <Textarea className="mt-3" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Es. cucina chiusa, prodotto finito, chiamaci per un'alternativa" />
      </Modal>
    </div>
  );
}
