import { requireStaffPage } from "@/server/auth/require-staff";
import { refs, allWithId } from "@/server/db";
import { listActiveStaff } from "@/server/auth/staff-session";
import { publicEnv } from "@/lib/env";
import type { Room, Table } from "@/domain/orders";
import { FloorPlan } from "./floor-plan";

export const metadata = { title: "Sala e tavoli" };

export default async function SalaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { permission: "tables.manage" });
  const [rooms, tables, staff] = await Promise.all([
    refs.rooms(ctx.tenant.id).get().then(allWithId<Room>),
    refs.tables(ctx.tenant.id).get().then(allWithId<Table>),
    listActiveStaff(ctx.tenant.id),
  ]);
  return (
    <FloorPlan
      token={token}
      basePath={ctx.basePath}
      appUrl={publicEnv.appUrl}
      slug={ctx.tenant.slug}
      initialRooms={rooms.sort((a, b) => a.sort - b.sort)}
      initialTables={tables}
      waiters={staff.filter((s) => ["waiter", "manager", "owner"].includes(s.role)).map((s) => ({ id: s.id, name: s.displayName }))}
      canEditLayout={ctx.permissions.has("settings.manage")}
      canOrder={ctx.modules.orders && ctx.permissions.has("orders.create")}
      canBill={ctx.modules.billing && ctx.permissions.has("bills.manage")}
      me={ctx.staff.id}
    />
  );
}
