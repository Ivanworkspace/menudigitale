import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { resolveTenantBySlug } from "@/server/tenancy/resolve";
import { openReviewLink } from "@/server/reviews";
import { confirmStop } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recensione", robots: { index: false, follow: false } };

/** Tracked link of a review invitation: counts the click and opens the review page. */
export default async function ReviewRedirect({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ stop?: string }> }) {
  const { slug, id } = await params;
  const stop = (await searchParams).stop;
  const t = await resolveTenantBySlug(slug);
  if (!t) notFound();
  if (!stop) {
    const target = await openReviewLink(t, id, false);
    if (target) redirect(target);
  }
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <div className="max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-bold">{t.displayName}</h1>
        {stop === "1" ? (
          // Confirmation button: email scanners that open links must not unsubscribe people.
          <form action={confirmStop.bind(null, slug, id)} className="mt-3 space-y-3">
            <p className="text-sm text-slate-600">Vuoi smettere di ricevere inviti a lasciare una recensione?</p>
            <button className="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white">Sì, non inviarmene più</button>
          </form>
        ) : (
          <p className="mt-2 text-sm text-slate-600">
            {stop === "done" ? "Fatto: non riceverai altri inviti a lasciare una recensione." : "Questo link non è più valido."}
          </p>
        )}
      </div>
    </main>
  );
}
