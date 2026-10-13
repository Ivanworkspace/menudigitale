import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveTenantBySlug, tenantSubscription } from "@/server/tenancy/resolve";
import { loadPublicMenuData } from "@/server/menu/repo";
import { buildPublicMenu, negotiateLanguage } from "@/server/menu/public";
import { getPlatformSettings } from "@/server/superadmin/queries";
import { takeawayConfig, takeawayMenuId, takeawayOpen } from "@/server/takeaway";
import { MenuUnavailable } from "@/components/public/menu-unavailable";
import { TakeawayMenu } from "@/components/public/takeaway-menu";
import { reviewConfig, reviewsActive } from "@/server/reviews";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await resolveTenantBySlug((await params).slug);
  return t ? { title: { absolute: `Asporto · ${t.displayName}` } } : {};
}

export default async function TakeawayPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { lang } = await searchParams;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant || !tenant.modules.takeaway) notFound();
  if (!tenantSubscription(tenant).accessAllowed) return <MenuUnavailable name={tenant.displayName} />;

  const cfg = takeawayConfig(tenant);
  const [data, platform] = await Promise.all([loadPublicMenuData(tenant.id), getPlatformSettings()]);
  const languages = tenant.modules.multilang ? tenant.settings.languages : ["it"];
  const chosen = lang && languages.includes(lang) ? lang : negotiateLanguage((await headers()).get("accept-language"), languages);
  const menuId = takeawayMenuId(tenant, data.menus);
  // One price list only: the one the order will be priced with.
  const view = { ...buildPublicMenu(tenant, data, { lang: chosen, menuId, brandName: platform.brandName }), menus: [] };

  return (
    <TakeawayMenu
      menu={view}
      slug={slug}
      open={takeawayOpen(tenant)}
      note={cfg.note}
      minOrderCents={cfg.minOrderCents}
      phone={tenant.phone}
      askReview={reviewsActive(tenant) && reviewConfig(tenant).fromTakeaway}
    />
  );
}
