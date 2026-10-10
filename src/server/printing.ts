import "server-only";
import { refs, nowIso, withId, allWithId, expireIn } from "@/server/db";
import { decrypt } from "@/server/crypto";
import { kitchenTicket } from "@/domain/escpos";
import { tr } from "@/domain/menu";
import type { Order, OrderItem } from "@/domain/orders";
import type { Department } from "@/domain/menu";
import type { Tenant } from "@/server/db/types";

export type Printer = {
  id: string;
  name: string;
  /** network: raw TCP 9100 through the local print server; printnode: cloud API. */
  transport: "network" | "printnode";
  host: string | null;
  port: number;
  printNodeId: number | null;
  departmentIds: string[];
  width: number; // characters per line (42 for 80 mm, 32 for 58 mm)
  active: boolean;
};

/**
 * Enqueues kitchen tickets for the given items, one per department printer.
 * Never throws: printing problems must not block ordering.
 */
export async function printOrderItems(tenant: Tenant, order: Pick<Order, "id" | "tableLabel" | "createdByName" | "urgent" | "round" | "notes">, items: OrderItem[], opts: { cancelled?: boolean; reprint?: boolean } = {}) {
  try {
    const printers = (await refs.printers(tenant.id).where("active", "==", true).get().then(allWithId<Printer>));
    if (!printers.length || !items.length) return;
    const departments = new Map((await refs.departments(tenant.id).get().then(allWithId<Department>)).map((d) => [d.id, d.name]));
    const time = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: tenant.settings.timezone }).format(new Date());
    for (const printer of printers) {
      const mine = items.filter((i) => i.departmentId && printer.departmentIds.includes(i.departmentId));
      if (!mine.length) continue;
      const bytes = kitchenTicket(
        {
          venue: tenant.displayName,
          department: printer.departmentIds.map((d) => departments.get(d) ?? "").filter(Boolean).join(" / ") || printer.name,
          table: order.tableLabel,
          waiter: order.createdByName,
          time,
          urgent: order.urgent || !!opts.cancelled,
          round: order.round,
          notes: order.notes,
          reprint: opts.reprint,
          items: mine.map((i) => ({
            qty: i.qty,
            name: tr(i.name, "it"),
            modifiers: i.modifiers.map((m) => tr(m.name, "it")),
            notes: i.notes,
            course: i.course,
            cancelled: opts.cancelled,
          })),
        },
        printer.width || 42,
      );
      const job = {
        printerId: printer.id,
        orderId: order.id,
        payload: Buffer.from(bytes).toString("base64"),
        status: "queued",
        attempts: 0,
        error: null,
        createdAt: nowIso(),
        expireAt: expireIn(3 * 86_400_000),
      };
      const ref = await refs.printJobs(tenant.id).add(job);
      if (printer.transport === "printnode") await sendViaPrintNode(tenant, printer, ref.id, job.payload);
    }
  } catch (e) {
    console.error("print enqueue failed", e);
  }
}

async function sendViaPrintNode(tenant: Tenant, printer: Printer, jobId: string, base64: string) {
  const ref = refs.printJobs(tenant.id).doc(jobId);
  try {
    const keyEnc = (await refs.tenant(tenant.id).get()).get("printing.printNodeKeyEnc") as string | undefined;
    if (!keyEnc || !printer.printNodeId) throw new Error("PrintNode non configurato");
    const res = await fetch("https://api.printnode.com/printjobs", {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${decrypt(keyEnc)}:`).toString("base64")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ printerId: printer.printNodeId, title: `Comanda ${jobId}`, contentType: "raw_base64", content: base64, source: "MenuSaaS" }),
    });
    if (!res.ok) throw new Error(`PrintNode ${res.status}`);
    await ref.update({ status: "printed", printedAt: nowIso() });
  } catch (e) {
    await ref.update({ status: "failed", error: (e as Error).message });
  }
}

export async function getPrinter(tenantId: string, id: string) {
  return withId<Printer>(await refs.printers(tenantId).doc(id).get());
}
