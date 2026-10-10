import { listPlans } from "@/server/superadmin/queries";
import { PageHeader } from "@/components/ui/card";
import { PlansEditor } from "./plans-editor";

export const metadata = { title: "Piani" };

export default async function PlansPage() {
  const plans = await listPlans();
  return (
    <>
      <PageHeader title="Piani di abbonamento" description="Prezzi, limiti e moduli inclusi. I limiti vengono applicati automaticamente." />
      <PlansEditor plans={plans} />
    </>
  );
}
