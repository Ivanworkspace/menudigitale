import { requireStaffPage } from "@/server/auth/require-staff";
import { refs, allWithId } from "@/server/db";
import type { Printer } from "@/server/printing";
import type { Department } from "@/domain/menu";
import { PrintersEditor } from "./printers-editor";

export const metadata = { title: "Stampanti" };

export default async function PrintersPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { permission: "settings.manage" });
  const t = ctx.tenant.id;
  const [printers, departments, tenantSnap, keys, failed] = await Promise.all([
    refs.printers(t).get().then(allWithId<Printer>),
    refs.departments(t).get().then(allWithId<Department>),
    refs.tenant(t).get(),
    refs.printKeys().where("tenantId", "==", t).limit(1).get(),
    refs.printJobs(t).where("status", "==", "failed").limit(10).get(),
  ]);
  return (
    <PrintersEditor
      token={token}
      printers={printers}
      departments={departments.sort((a, b) => a.sort - b.sort)}
      hasKey={!keys.empty}
      lastSeenAt={(tenantSnap.get("printing.lastSeenAt") as string | undefined) ?? null}
      hasPrintNode={!!tenantSnap.get("printing.printNodeKeyEnc")}
      failedJobs={failed.docs.map((d) => ({ id: d.id, error: d.get("error") as string, createdAt: d.get("createdAt") as string }))}
    />
  );
}
