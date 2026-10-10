import { notFound } from "next/navigation";
import { requireStaffPage } from "@/server/auth/require-staff";
import { getBill } from "@/server/billing/service";
import { formatEuro } from "@/lib/format";
import { FISCAL_WARNING, PAYMENT_LABELS } from "@/domain/billing";
import { PrintButton } from "./print-button";

export const metadata = { title: "Preconto" };

/** Printable pre-receipt (80 mm or A4 via the browser print dialog). */
export default async function PrintBillPage({ params }: { params: Promise<{ token: string; billId: string }> }) {
  const { token, billId } = await params;
  const ctx = await requireStaffPage(token, { module: "billing", permission: "bills.manage" });
  const b = await getBill(ctx.tenant.id, billId);
  if (!b) notFound();
  const t = b.totals;
  const tn = ctx.tenant;
  return (
    <div className="fixed inset-0 z-[60] overflow-auto bg-white">
      <style>{`@media print { @page { size: 80mm auto; margin: 4mm } body * { visibility: hidden } #preconto, #preconto * { visibility: visible } #preconto { position: absolute; left: 0; top: 0 } }`}</style>
      <div className="no-print flex justify-center gap-2 p-4">
        <PrintButton />
      </div>
      <div id="preconto" className="mx-auto w-[76mm] font-mono text-[12px] leading-snug text-black">
        <p className="text-center text-base font-bold">{tn.displayName}</p>
        <p className="text-center">{tn.legalName}</p>
        {tn.address && <p className="text-center">{[tn.address, tn.city].filter(Boolean).join(" ")}</p>}
        {tn.vatNumber && <p className="text-center">P.IVA {tn.vatNumber}</p>}
        <p className="my-2 text-center font-bold">PRECONTO {b.number ? `#${b.number}` : ""}</p>
        <p>Tavolo {b.tableLabel} · Coperti {b.covers + b.coversChildren}</p>
        <p>{new Date(b.closedAt ?? b.updatedAt).toLocaleString("it-IT", { timeZone: tn.settings.timezone })}</p>
        <hr className="my-2 border-dashed border-black" />
        {b.lines.map((l) => (
          <div key={l.id} className="flex justify-between gap-2">
            <span>
              {l.qty} x {l.name}
            </span>
            <span>{formatEuro(l.qty * l.unitPriceCents)}</span>
          </div>
        ))}
        {b.ayce && (
          <div className="flex justify-between">
            <span>{b.ayce.adults + b.ayce.children} x All you can eat</span>
            <span>{formatEuro(t.ayceCents)}</span>
          </div>
        )}
        {t.coverCents > 0 && (
          <div className="flex justify-between">
            <span>{b.covers + b.coversChildren} x Coperto</span>
            <span>{formatEuro(t.coverCents)}</span>
          </div>
        )}
        {t.serviceCents > 0 && (
          <div className="flex justify-between">
            <span>Servizio {b.servicePctBp / 100}%</span>
            <span>{formatEuro(t.serviceCents)}</span>
          </div>
        )}
        {t.adjustmentsCents !== 0 && (
          <div className="flex justify-between">
            <span>{t.adjustmentsCents < 0 ? "Sconto" : "Maggiorazione"}</span>
            <span>{formatEuro(t.adjustmentsCents)}</span>
          </div>
        )}
        <hr className="my-2 border-dashed border-black" />
        <div className="flex justify-between text-base font-bold">
          <span>TOTALE</span>
          <span>{formatEuro(t.totalCents)}</span>
        </div>
        {t.vat.filter((v) => v.grossCents).map((v) => (
          <div key={v.rateBp} className="flex justify-between text-[11px]">
            <span>IVA {v.rateBp / 100}% su {formatEuro(v.netCents)}</span>
            <span>{formatEuro(v.vatCents)}</span>
          </div>
        ))}
        {b.parts.length > 0 && (
          <>
            <hr className="my-2 border-dashed border-black" />
            {b.parts.map((p) => (
              <div key={p.id} className="flex justify-between">
                <span>{p.label}</span>
                <span>{formatEuro(p.amountCents)}</span>
              </div>
            ))}
          </>
        )}
        {b.payments.length > 0 && (
          <>
            <hr className="my-2 border-dashed border-black" />
            {b.payments.map((p) => (
              <div key={p.id} className="flex justify-between">
                <span>{PAYMENT_LABELS[p.method]}</span>
                <span>{formatEuro(p.amountCents)}</span>
              </div>
            ))}
          </>
        )}
        <hr className="my-2 border-dashed border-black" />
        <p className="text-center text-[11px] font-bold">DOCUMENTO NON FISCALE</p>
        <p className="text-center text-[10px]">{FISCAL_WARNING}</p>
        <p className="mt-2 text-center">Grazie e arrivederci!</p>
      </div>
    </div>
  );
}
