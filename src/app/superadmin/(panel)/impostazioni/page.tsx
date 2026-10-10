import { getPlatformSettings } from "@/server/superadmin/queries";
import { PageHeader } from "@/components/ui/card";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Impostazioni" };

export default async function SettingsPage() {
  const s = await getPlatformSettings();
  return (
    <>
      <PageHeader title="Impostazioni piattaforma" />
      <SettingsForm
        initial={{
          brandName: s.brandName,
          brandUrl: s.brandUrl ?? "",
          defaultGraceDays: s.defaultGraceDays,
          expiryWarningDays: s.expiryWarningDays.join(", "),
        }}
      />
    </>
  );
}
