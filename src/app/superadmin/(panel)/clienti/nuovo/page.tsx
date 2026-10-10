import { getPlatformSettings, listPlans } from "@/server/superadmin/queries";
import { PageHeader } from "@/components/ui/card";
import { NewTenantWizard } from "./wizard";

export const metadata = { title: "Nuovo cliente" };

export default async function NewTenantPage() {
  const [plans, settings] = await Promise.all([listPlans(), getPlatformSettings()]);
  return (
    <>
      <PageHeader title="Nuovo cliente" description="Procedura guidata di attivazione di un nuovo locale" />
      <NewTenantWizard plans={plans} defaultGraceDays={settings.defaultGraceDays} />
    </>
  );
}
