import { NextResponse, type NextRequest } from "next/server";
import { refs, db, nowIso, allWithId } from "@/server/db";
import { printServerTenant } from "@/server/print-auth";
import type { Printer } from "@/server/printing";

export const dynamic = "force-dynamic";

/** The local print server polls this endpoint and claims queued jobs. */
export async function GET(req: NextRequest) {
  const tenantId = await printServerTenant(req);
  if (!tenantId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const printers = new Map((await refs.printers(tenantId).get().then(allWithId<Printer>)).map((p) => [p.id, p]));
  await refs.tenant(tenantId).update({ "printing.lastSeenAt": nowIso() });

  // Requeue jobs stuck in "sending" for more than 2 minutes.
  const stale = new Date(Date.now() - 120_000).toISOString();
  const stuck = await refs.printJobs(tenantId).where("status", "==", "sending").where("claimedAt", "<", stale).limit(20).get();
  await Promise.all(stuck.docs.map((d) => d.ref.update({ status: "queued" })));

  const queued = await refs.printJobs(tenantId).where("status", "==", "queued").orderBy("createdAt").limit(20).get();
  const jobs: { id: string; host: string; port: number; payload: string }[] = [];
  for (const d of queued.docs) {
    const p = printers.get(d.get("printerId"));
    if (!p || p.transport !== "network" || !p.host) continue;
    const claimed = await db().runTransaction(async (tx) => {
      const s = await tx.get(d.ref);
      if (s.get("status") !== "queued") return false;
      tx.update(d.ref, { status: "sending", claimedAt: nowIso() });
      return true;
    });
    if (claimed) jobs.push({ id: d.id, host: p.host, port: p.port || 9100, payload: d.get("payload") });
  }
  return NextResponse.json({ jobs });
}
