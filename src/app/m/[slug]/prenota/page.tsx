/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveTenantBySlug, tenantSubscription } from "@/server/tenancy/resolve";
import { reservationConfig, venueNow } from "@/server/reservations";
import { assetUrl } from "@/lib/assets";
import { BookingForm } from "./booking-form";
import { reviewConfig, reviewsActive } from "@/server/reviews";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = await resolveTenantBySlug((await params).slug);
  return t ? { title: { absolute: `Prenota · ${t.displayName}` } } : {};
}

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await resolveTenantBySlug(slug);
  if (!t || !tenantSubscription(t).accessAllowed || !t.modules.reservations) notFound();
  const cfg = reservationConfig(t);
  const logo = assetUrl(t.branding.logoPath);
  return (
    <main className="min-h-dvh px-4 py-8" style={{ background: t.branding.backgroundColor, fontFamily: `'${t.branding.fontFamily}', ui-sans-serif, system-ui` }}>
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center gap-3">
          {logo && <img src={logo} alt="" className="h-14 w-14 rounded-2xl bg-white object-contain p-1 shadow" />}
          <div>
            <h1 className="text-2xl font-bold" style={{ color: t.branding.primaryColor }}>{t.displayName}</h1>
            <p className="text-sm text-slate-600">Prenota un tavolo</p>
          </div>
        </div>
        {cfg.onlineEnabled ? (
          <BookingForm slug={slug} today={venueNow(t).date} maxParty={cfg.maxPartySize} accent={t.branding.primaryColor} phone={t.phone} askReview={reviewsActive(t) && reviewConfig(t).fromReservations} />
        ) : (
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <p>La prenotazione online non è attiva.</p>
            {t.phone && <a className="mt-3 inline-block font-semibold underline" href={`tel:${t.phone}`}>Chiama {t.phone}</a>}
          </div>
        )}
        <p className="mt-6 text-center text-sm">
          <Link href={`/m/${slug}`} className="text-slate-600 underline">Vedi il menu</Link>
        </p>
      </div>
    </main>
  );
}
