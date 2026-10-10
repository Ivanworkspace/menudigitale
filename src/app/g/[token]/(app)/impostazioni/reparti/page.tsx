import { requireStaffPage } from "@/server/auth/require-staff";
import { loadMenuData } from "@/server/menu/repo";
import { DepartmentsEditor } from "./departments-editor";

export const metadata = { title: "Reparti" };

export default async function DepartmentsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { permission: "settings.manage" });
  const { departments, products } = await loadMenuData(ctx.tenant.id);
  const counts: Record<string, number> = {};
  for (const p of products) if (p.departmentId) counts[p.departmentId] = (counts[p.departmentId] ?? 0) + 1;
  return <DepartmentsEditor token={token} departments={departments} counts={counts} />;
}
