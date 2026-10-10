import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { refs, withId } from "@/server/db";
import { getTenant, tenantSubscription } from "@/server/tenancy/resolve";
import { getTable, nowMode, resolveTableToken } from "@/server/sala/service";
import { loadPublicMenuData } from "@/server/menu/repo";
import { buildPublicMenu, negotiateLanguage } from "@/server/menu/public";
import { readGuestCookie } from "@/server/guest";
import { getPlatformSettings } from "@/server/superadmin/queries";
import { MenuUnavailable } from "@/components/public/menu-unavailable";
import { TableMenu } from "@/components/public/table-menu";
import { DEFAULT_AYCE, secondsToNextRound } from "@/domain/ayce";
import type { TableSession } from "@/domain/orders";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: { absolute: `Menu · ${slug.replace(/-/g, " ")}` }, robots: { index: false } };
}

type Props = { params: Promise<{ slug: string; tableToken: string }>; searchParams: Promise<{ lang?: string }> };

export default async function TablePage({ params, searchParams }: Props) {
  const { slug, tableToken } = await params;
  const { lang } = await searchParams;
  const ref = await resolveTableToken(tableToken);
  if (!ref) notFound();
  const tenant = await getTenant(ref.tenantId);
  if (!tenant || tenant.slug !== slug) notFound();
  if (!tenantSubscription(tenant).accessAllowed) return <MenuUnavailable name={tenant.displayName} />;

  const table = await getTable(tenant.id, ref.tableId).catch(() => null);
  if (!table || !table.active) notFound();
  const session = table.currentSessionId ? withId<TableSession>(await refs.tableSessions(tenant.id).doc(table.currentSessionId).get()) : null;
  const mode = nowMode(tenant);
  const [data, platform] = await Promise.all([loadPublicMenuData(tenant.id), getPlatformSettings()]);
  const languages = tenant.modules.multilang ? tenant.settings.languages : ["it"];
  const chosen = lang && languages.includes(lang) ? lang : negotiateLanguage((await headers()).get("accept-language"), languages);
  const view = buildPublicMenu(tenant, data, {
    lang: chosen,
    menuId: session?.menuId ?? undefined,
    brandName: platform.brandName,
  });
  // At the table the price list is fixed by the session: no menu switching.
  if (session && session.status !== "closed") view.menus = [];
  const guest = await readGuestCookie();
  const ayceCfg = tenant.settings.ayce ?? DEFAULT_AYCE;
  const open = !!session && session.status !== "closed";

  return (
    <TableMenu
      menu={view}
      slug={slug}
      tableToken={tableToken}
      tableLabel={session?.tableLabel ?? table.label}
      mode={mode}
      session={
        open
          ? {
              id: session!.id,
              status: session!.status,
              joined: guest?.sessionId === session!.id,
              covers: session!.covers + session!.coversChildren,
              ayce: session!.ayce
                ? {
                    adultCents: session!.ayce.adultCents,
                    childCents: session!.ayce.childCents,
                    piecesPerPerson: ayceCfg.piecesPerPersonPerRound,
                    minIntervalSec: ayceCfg.minRoundIntervalSec,
                    nextRoundInSec: secondsToNextRound(ayceCfg, session!.ayce.lastRoundAt, new Date()),
                    rounds: session!.ayce.rounds,
                    penaltyNote: ayceCfg.leftoverPenaltyNote,
                  }
                : null,
            }
          : null
      }
      protection={{
        geofence: tenant.settings.orderProtection.geofence !== "off" && tenant.lat != null,
        tableCode: tenant.settings.orderProtection.tableCode,
      }}
      reviewUrl={tenant.settings.reviewUrl}
    />
  );
}
