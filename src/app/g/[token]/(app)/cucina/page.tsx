import { requireStaffPage } from "@/server/auth/require-staff";
import { refs, allWithId } from "@/server/db";
import type { Department } from "@/domain/menu";
import { KitchenDisplay } from "./kitchen-display";

export const metadata = { title: "Cucina e bar" };

export default async function KitchenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { module: "kds", permission: "kds.view" });
  const departments = (await refs.departments(ctx.tenant.id).get().then(allWithId<Department>)).sort((a, b) => a.sort - b.sort);
  // Suggest the department matching the role (e.g. "Bar" for bar staff).
  const guess = departments.find((d) => d.name.toLowerCase().includes(ctx.staff.role === "bar" ? "bar" : "cucin"));
  return <KitchenDisplay token={token} departments={departments.map((d) => ({ id: d.id, name: d.name }))} defaultDepartment={ctx.staff.role === "kitchen" || ctx.staff.role === "bar" ? (guess?.id ?? null) : null} />;
}
