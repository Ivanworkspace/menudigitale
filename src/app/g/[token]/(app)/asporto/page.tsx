import Link from "next/link";
import { requireStaffPage } from "@/server/auth/require-staff";
import { takeawayConfig, takeawayOn } from "@/server/takeaway";
import { venueNow } from "@/server/reservations";
import { publicEnv } from "@/lib/env";
import { buttonClass } from "@/components/ui/button";
import { Alert, PageHeader } from "@/components/ui/card";
import { TakeawayBoard } from "./takeaway-board";

export const metadata = { title: "Asporto" };

export default async function TakeawayStaffPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { module: "takeaway", permission: "orders.approve" });
  const cfg = takeawayConfig(ctx.tenant);
  const day = venueNow(ctx.tenant).date;
  const initial = await takeawayOn(ctx.tenant.id, day);
  const link = `${publicEnv.appUrl}/m/${ctx.tenant.slug}/asporto`;
  return (
    <>
      <PageHeader
        title="Asporto"
        description={<>Ordini da ritirare di oggi, aggiornati in tempo reale. Link per i clienti: <a className="underline" href={link} target="_blank">{link}</a></>}
        action={ctx.permissions.has("settings.manage") ? <Link href={`${ctx.basePath}/impostazioni/asporto`} className={buttonClass("secondary")}>Impostazioni asporto</Link> : null}
      />
      {!cfg.enabled && (
        <div className="mb-4">
          <Alert tone="warning">Gli ordini d&apos;asporto online sono disattivati: i clienti non possono ordinare. Attivali in Impostazioni → Asporto.</Alert>
        </div>
      )}
      <TakeawayBoard
        token={token}
        basePath={ctx.basePath}
        day={day}
        initial={initial}
        canBill={ctx.modules.billing && ctx.permissions.has("bills.manage")}
      />
    </>
  );
}
