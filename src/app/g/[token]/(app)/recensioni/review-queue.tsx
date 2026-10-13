"use client";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { useAction } from "@/components/staff/use-action";
import { REVIEW_STATUS_LABELS, type ReviewStatus } from "@/domain/reviews";
import { markReviewSent, skipReview } from "./actions";

const TONE: Record<ReviewStatus, BadgeTone> = { queued: "sky", to_send: "amber", sent: "slate", clicked: "green", skipped: "red" };
const SOURCE = { reservation: "Prenotazione", takeaway: "Asporto" } as const;
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short" });

export function ReviewQueue({
  token,
  toSend,
  history,
}: {
  token: string;
  toSend: { id: string; name: string; phone: string; visitDay: string; source: "reservation" | "takeaway"; wa: string }[];
  history: { id: string; name: string; status: ReviewStatus; channel: string | null; visitDay: string; source: "reservation" | "takeaway"; skipReason: string | null }[];
}) {
  const { pending, msg, run } = useAction();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Da inviare su WhatsApp" description="Clienti senza email: tocca «Invia» e il messaggio è già scritto, basta premere invio su WhatsApp" />
        <ul className="divide-y divide-slate-100">
          {toSend.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
              <span className="flex-1">
                <strong>{r.name}</strong> · {r.phone}
                <span className="block text-xs text-slate-500">{SOURCE[r.source]} del {day(r.visitDay)}</span>
              </span>
              <a href={r.wa} target="_blank" rel="noopener noreferrer" onClick={() => run(() => markReviewSent(token, r.id))} className="rounded-lg bg-emerald-600 px-3 py-2 font-semibold text-white">
                Invia su WhatsApp
              </a>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => skipReview(token, r.id))}>Salta</Button>
            </li>
          ))}
          {!toSend.length && <li className="px-5 py-8 text-center text-sm text-slate-500">Nessun invito da inviare.</li>}
        </ul>
        {msg && <div className="p-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      </Card>
      <Card>
        <CardHeader title="Ultimi inviti" description="Ultimi 30 giorni" />
        <ul className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
          {history.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
              <span>
                {r.name} <span className="text-xs text-slate-500">· {SOURCE[r.source]} {day(r.visitDay)}{r.channel ? ` · ${r.channel === "email" ? "email" : "WhatsApp"}` : ""}</span>
                {r.skipReason && <span className="block text-xs text-slate-500">{r.skipReason}</span>}
              </span>
              <Badge tone={TONE[r.status]}>{REVIEW_STATUS_LABELS[r.status]}</Badge>
            </li>
          ))}
          {!history.length && <li className="px-5 py-8 text-center text-sm text-slate-500">Ancora nessun invito.</li>}
        </ul>
      </Card>
    </div>
  );
}
