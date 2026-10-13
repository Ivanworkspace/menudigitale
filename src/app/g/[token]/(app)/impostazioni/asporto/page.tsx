import { requireStaffPage } from "@/server/auth/require-staff";
import { takeawayConfig } from "@/server/takeaway";
import { refs, allWithId } from "@/server/db";
import { publicEnv } from "@/lib/env";
import { tr, type Menu } from "@/domain/menu";
import { TakeawaySettingsForm } from "./settings-form";

export const metadata = { title: "Asporto" };

export default async function TakeawaySettingsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { module: "takeaway", permission: "settings.manage" });
  const menus = allWithId<Menu>(await refs.menus(ctx.tenant.id).get());
  return (
    <TakeawaySettingsForm
      token={token}
      initial={takeawayConfig(ctx.tenant)}
      menus={menus.map((m) => ({ id: m.id, name: tr(m.name, "it") }))}
      url={`${publicEnv.appUrl}/m/${ctx.tenant.slug}/asporto`}
    />
  );
}
