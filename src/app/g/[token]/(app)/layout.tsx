import { requireStaffPage } from "@/server/auth/require-staff";
import { visibleNav } from "@/domain/permissions";
import { tenantSubscription } from "@/server/tenancy/resolve";
import { StaffShell } from "@/components/staff/staff-shell";
import { ROLE_LABELS } from "@/domain/permissions";
import { RealtimeProvider } from "@/components/staff/realtime";
import { NotificationCenter } from "@/components/staff/notification-center";

export default async function AppLayout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token);
  const nav = visibleNav(ctx.permissions, ctx.modules).map(({ href, label, icon }) => ({ href, label, icon }));
  const sub = tenantSubscription(ctx.tenant);
  return (
    <RealtimeProvider token={token} tenantId={ctx.tenant.id}>
    <StaffShell
      token={token}
      tenantName={ctx.tenant.displayName}
      staffName={ctx.staff.displayName}
      roleLabel={ROLE_LABELS[ctx.staff.role]}
      impersonating={ctx.kind === "impersonation"}
      nav={nav}
      notice={
        sub.phase === "grace" && (ctx.staff.role === "owner" || ctx.staff.role === "manager")
          ? "L'abbonamento è scaduto: il servizio resterà attivo ancora per pochi giorni. Contatta l'assistenza per rinnovare."
          : null
      }
    >
      {children}
      <NotificationCenter role={ctx.staff.role} />
    </StaffShell>
    </RealtimeProvider>
  );
}
