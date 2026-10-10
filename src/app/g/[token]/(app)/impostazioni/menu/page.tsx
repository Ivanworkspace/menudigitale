import { requireStaffPage } from "@/server/auth/require-staff";
import { MenuSettingsForm } from "./menu-settings-form";

export const metadata = { title: "Menu e lingue" };

export default async function MenuSettingsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { tenant, modules } = await requireStaffPage(token, { permission: "settings.manage" });
  return (
    <MenuSettingsForm
      token={token}
      multilang={modules.multilang}
      orders={modules.orders}
      initial={{
        languages: tenant.settings.languages,
        soldOutBehavior: tenant.settings.soldOutBehavior,
        frozenNote: tenant.settings.frozenNote ?? {},
        defaultMenuMode: tenant.defaultMenuMode,
        modeSchedules: tenant.settings.modeSchedules ?? [],
      }}
    />
  );
}
