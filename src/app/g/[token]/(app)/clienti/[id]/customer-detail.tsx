"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonClass } from "@/components/ui/button";
import { Alert, Card, CardHeader, Stat } from "@/components/ui/card";
import { useAction } from "@/components/staff/use-action";
import { formatDate, formatDateTime, formatEuro } from "@/lib/format";
import type { LoyaltyConfig } from "@/domain/loyalty";
import type { Customer } from "@/server/customers";
import { anonymize, redeem } from "../actions";
import { CustomerModal } from "../customer-form";
import { shortPlaceLabel } from "@/domain/takeaway";

export function CustomerDetail({
  token,
  basePath,
  customer: c,
  loyalty,
  bills,
  transactions,
}: {
  token: string;
  basePath: string;
  customer: Customer;
  loyalty: LoyaltyConfig;
  bills: { id: string; date: string; table: string; total: number }[];
  transactions: { id: string; at: string; points: number; stamps: number; note: string | null; kind: string }[];
}) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const { pending, msg, run } = useAction();
  const balance = loyalty.mode === "points" ? c.points : c.stamps;
  const unit = loyalty.mode === "points" ? "punti" : "timbri";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{c.name}</h2>
          <p className="text-sm text-slate-500">{[c.phone, c.email, c.birthday ? `🎂 ${formatDate(c.birthday)}` : null].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEdit(true)}>Modifica</Button>
          <a className={buttonClass("secondary")} href={`${basePath}/clienti/${c.id}/export`}>Esporta dati (GDPR)</a>
          <Button variant="danger" disabled={pending} onClick={() => confirm("Cancellare i dati personali del cliente? L'operazione non è reversibile.") && run(() => anonymize(token, c.id), { onOk: () => router.push(`${basePath}/clienti`) })}>
            Cancella dati
          </Button>
        </div>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Saldo fedeltà" value={`${balance} ${unit}`} />
        <Stat label="Visite" value={c.visits} />
        <Stat label="Speso in totale" value={formatEuro(c.totalSpentCents)} />
        <Stat label="Consensi" value={c.marketingConsent ? "Privacy + Marketing" : "Solo privacy"} hint={c.privacyConsentAt ? `Privacy dal ${formatDate(c.privacyConsentAt)}` : undefined} />
      </div>
      {c.notes && <Alert tone="info" title="Note">{c.notes}</Alert>}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Premi" />
          <ul className="divide-y divide-slate-100">
            {loyalty.rewards.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  <strong>{r.name}</strong>
                  <span className="block text-xs text-slate-500">{r.cost} {unit} · {r.description}</span>
                </span>
                <Button size="sm" disabled={pending || balance < r.cost} onClick={() => run(() => redeem(token, c.id, r.id), { success: `Premio «${r.name}» riscattato.`, onOk: () => router.refresh() })}>
                  Riscatta
                </Button>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Storico visite" />
          <ul className="divide-y divide-slate-100 text-sm">
            {bills.map((b) => (
              <li key={b.id} className="flex justify-between px-5 py-2">
                <span>{formatDateTime(b.date)} · {shortPlaceLabel(b.table)}</span>
                <span className="tabular-nums">{formatEuro(b.total)}</span>
              </li>
            ))}
            {!bills.length && <li className="px-5 py-6 text-center text-slate-500">Nessuna visita registrata.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Movimenti fedeltà" />
          <ul className="divide-y divide-slate-100 text-sm">
            {transactions.map((t) => (
              <li key={t.id} className="flex justify-between px-5 py-2">
                <span>{formatDateTime(t.at)}{t.note ? ` · ${t.note}` : ""}</span>
                <span className={`tabular-nums ${t.points + t.stamps < 0 ? "text-red-600" : "text-emerald-700"}`}>
                  {t.points + t.stamps > 0 ? "+" : ""}{t.points || t.stamps}
                </span>
              </li>
            ))}
            {!transactions.length && <li className="px-5 py-6 text-center text-slate-500">Nessun movimento.</li>}
          </ul>
        </Card>
      </div>
      {edit && (
        <CustomerModal
          token={token}
          initial={{ id: c.id, name: c.name, phone: c.phone ?? "", email: c.email ?? "", birthday: c.birthday ?? "", notes: c.notes, privacyConsent: true, marketingConsent: c.marketingConsent }}
          onClose={() => setEdit(false)}
          onSaved={() => { setEdit(false); router.refresh(); }}
        />
      )}
    </div>
  );
}
