import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveTenantBySlug, tenantSubscription } from "@/server/tenancy/resolve";
import { loadPublicMenuData } from "@/server/menu/repo";
import { buildPublicMenu, negotiateLanguage } from "@/server/menu/public";
import { getPlatformSettings } from "@/server/superadmin/queries";
import { PublicMenuView } from "@/components/public/public-menu";
import { MenuUnavailable } from "@/components/public/menu-unavailable";
import { assetUrl } from "@/lib/assets";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string; menu?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await resolveTenantBySlug((await params).slug);
  if (!tenant) return {};
  const logo = assetUrl(tenant.branding.logoPath);
  return {
    title: { absolute: `${tenant.displayName} · Menu` },
    description: `Menu digitale di ${tenant.displayName}${tenant.city ? `, ${tenant.city}` : ""}`,
    openGraph: { title: tenant.displayName, images: logo ? [logo] : undefined },
    icons: logo ? { icon: logo, apple: logo } : undefined,
  };
}

export default async function PublicMenuPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { lang, menu } = await searchParams;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();
  if (!tenantSubscription(tenant).accessAllowed) return <MenuUnavailable name={tenant.displayName} />;

  const [data, platform] = await Promise.all([loadPublicMenuData(tenant.id), getPlatformSettings()]);
  const languages = tenant.modules.multilang ? tenant.settings.languages : ["it"];
  const chosen = lang && languages.includes(lang) ? lang : negotiateLanguage((await headers()).get("accept-language"), languages);
  const view = buildPublicMenu(tenant, data, { lang: chosen, menuId: menu, brandName: platform.brandName });

  return <PublicMenuView menu={view} />;
}
