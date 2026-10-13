/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveTenantBySlug } from "@/server/tenancy/resolve";
import { takeawayByToken } from "@/server/takeaway";
import { assetUrl } from "@/lib/assets";
import { formatEuro } from "@/lib/format";
import { tr } from "@/domain/menu";
import { orderTotal } from "@/domain/orders";
import type { TakeawayStatus } from "@/domain/takeaway";
import { AutoRefresh } from "@/components/public/auto-refresh";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Il tuo ordine", robots: { index: false, follow: false } };

const STEPS: { key: TakeawayStatus; label: string; icon: string }[] = [
  { key: "pending", label: "Ricevuto", icon: "📨" },
  { key: "accepted", label: "Confermato, in preparazione", icon: "👨‍🍳" },
  { key: "ready", label: "Pronto per il ritiro", icon: "✅" },
  { key: "picked_up", label: "Ritirato", icon: "🛍️" },
];

export default async function TakeawayStatusPage({ params }: { params: Promise<{ slug: string; orderToken: string }> }) {
  const { slug, orderToken } = await params;
  const [tenant, found] = await Promise.all([resolveTenantBySlug(slug), takeawayByToken(orderToken)]);
  if (!tenant || !found || found.tenantId !== tenant.id) notFound();
  const { session, orders } = found;
  const tk = session.takeaway;
  const items = orders.filter((o) => o.status !== "rejected" && o.status !== "cancelled").flatMap((o) => o.items).filter((i) => i.status !== "cancelled");
  const total = orderTotal(items);
  const current = STEPS.findIndex((s) => s.key === tk.status);
  const logo = assetUrl(tenant.branding.logoPath);
  const accent = tenant.branding.primaryColor;
  const addr = [tenant.address, tenant.city].filter(Boolean).join(", ");
  const done = tk.status === "picked_up" || tk.status === "rejected";

  return (
    <main className="min-h-dvh px-4 py-8" style={{ background: tenant.branding.backgroundColor, fontFamily: `'${tenant.branding.fontFamily}', ui-sans-serif, system-ui` }}>
      {!done && <AutoRefresh seconds={15} />}
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-3">
          {logo && <img src={logo} alt="" className="h-14 w-14 rounded-2xl bg-white object-contain p-1 shadow" />}
          <div>
            <h1 className="text-2xl font-bold" style={{ color: accent }}>{tenant.displayName}</h1>
            <p className="text-sm text-slate-600">Ordine d&apos;asporto</p>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 text-center shadow-sm">
          <p className="text-sm text-slate-500">Numero ordine</p>
          <p className="text-5xl font-black tabular-nums" style={{ color: accent }}>{tk.number}</p>
          <p className="mt-2 text-lg font-semibold">Ritiro alle {tk.pickupTime}</p>
          <p className="text-sm text-slate-500">a nome di {tk.customerName}</p>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          {tk.status === "rejected" ? (
            <div className="text-center">
              <p className="text-3xl">😔</p>
              <p className="mt-2 font-semibold">Purtroppo non possiamo preparare questo ordine.</p>
              {tk.rejectReason && <p className="mt-1 text-sm text-slate-600">{tk.rejectReason}</p>}
              {tenant.phone && <a className="mt-3 inline-block font-semibold underline" href={`tel:${tenant.phone}`}>Chiamaci: {tenant.phone}</a>}
            </div>
          ) : (
            <ol className="space-y-3">
              {STEPS.map((s, i) => (
                <li key={s.key} className={i <= current ? "flex items-center gap-3 font-semibold" : "flex items-center gap-3 text-slate-400"}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full text-lg" style={i <= current ? { background: `${accent}22` } : { background: "#f1f5f9" }}>
                    {s.icon}
                  </span>
                  {s.label}
                </li>
              ))}
            </ol>
          )}
          {tk.status === "pending" && <p className="mt-4 text-sm text-slate-500">Il locale sta controllando il tuo ordine: questa pagina si aggiorna da sola.</p>}
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <ul className="divide-y divide-slate-100 text-sm">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between py-2">
                <span>
                  {i.qty}× {tr(i.name, "it")}
                  {i.modifiers.length > 0 && <span className="block text-xs text-slate-500">{i.modifiers.map((m) => tr(m.name, "it")).join(", ")}</span>}
                </span>
                <span className="tabular-nums">{formatEuro(i.qty * i.unitPriceCents)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between border-t border-slate-100 pt-3 text-lg font-bold">
            <span>Totale</span>
            <span className="tabular-nums">{formatEuro(total)}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Pagamento al ritiro, in cassa.</p>
        </div>

        <div className="flex flex-wrap justify-center gap-3 text-sm">
          {tenant.phone && <a className="rounded-full bg-white px-4 py-2 font-semibold shadow-sm" href={`tel:${tenant.phone}`}>📞 Chiama</a>}
          {addr && (
            <a className="rounded-full bg-white px-4 py-2 font-semibold shadow-sm" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${tenant.displayName} ${addr}`)}`}>
              📍 Indicazioni
            </a>
          )}
          <Link className="rounded-full bg-white px-4 py-2 font-semibold shadow-sm" href={`/m/${slug}/asporto`}>Nuovo ordine</Link>
        </div>
      </div>
    </main>
  );
}
