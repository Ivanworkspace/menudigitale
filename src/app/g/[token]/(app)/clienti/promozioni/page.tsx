import { requireStaffPage } from "@/server/auth/require-staff";
import { refs, allWithId } from "@/server/db";
import type { Promotion } from "@/domain/loyalty";
import { PromotionsEditor } from "./promotions-editor";

export const metadata = { title: "Promozioni" };

export default async function PromotionsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { module: "loyalty", permission: "customers.manage" });
  const promos = await refs.promotions(ctx.tenant.id).get().then(allWithId<Promotion>);
  return <PromotionsEditor token={token} promotions={promos} canEdit={ctx.permissions.has("discounts.apply")} />;
}
