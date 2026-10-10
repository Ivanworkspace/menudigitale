import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { AdminShell } from "@/components/superadmin/admin-shell";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformAdmin();
  return <AdminShell adminName={admin.displayName}>{children}</AdminShell>;
}
