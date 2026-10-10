import { NextResponse, type NextRequest } from "next/server";
import { refs, nowIso } from "@/server/db";
import { printServerTenant } from "@/server/print-auth";

/** Acknowledges a job: { ok: true } or { ok: false, error }. Failed jobs retry up to 3 times. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = await printServerTenant(req);
  if (!tenantId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  const ref = refs.printJobs(tenantId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (body.ok) await ref.update({ status: "printed", printedAt: nowIso(), error: null });
  else {
    const attempts = (snap.get("attempts") ?? 0) + 1;
    await ref.update({ status: attempts >= 3 ? "failed" : "queued", attempts, error: String(body.error ?? "errore").slice(0, 200) });
  }
  return NextResponse.json({ ok: true });
}
