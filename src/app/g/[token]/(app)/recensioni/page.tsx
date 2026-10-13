import { requireStaffPage } from "@/server/auth/require-staff";
import { refs, allWithId } from "@/server/db";
import { reviewConfig, reviewMessage, reviewsActive } from "@/server/reviews";
import { whatsappLink } from "@/server/reservations";
import { venueDay } from "@/server/owner";
import { shiftDay } from "@/domain/push";
import type { ReviewRequest } from "@/domain/reviews";
import { Alert, PageHeader, Stat } from "@/components/ui/card";
import { ReviewSettingsForm } from "./settings-form";
import { ReviewQueue } from "./review-queue";

export const metadata = { title: "Recensioni" };

export default async function ReviewsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { permission: "customers.manage" });
  const t = ctx.tenant;
  const today = venueDay(t);
  const since = shiftDay(today, -30);
  const all = allWithId<ReviewRequest>(await refs.reviewRequests(t.id).where("visitDay", ">=", since).get()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sent = all.filter((r) => r.status === "sent" || r.status === "clicked");
  const clicked = all.filter((r) => r.status === "clicked");
  // WhatsApp invitations become due the day after the visit.
  const toSend = all
    .filter((r) => r.status === "to_send" && r.sendOn <= today)
    .map((r) => ({ id: r.id, name: r.name, phone: r.phone ?? "", visitDay: r.visitDay, source: r.source, wa: whatsappLink(r.phone ?? "", reviewMessage(t, r)) }));

  return (
    <>
      <PageHeader title="Recensioni" description="Il giorno dopo la visita o il ritiro, i clienti che hanno accettato ricevono l'invito a recensirvi su Google" />
      {!reviewsActive(t) && (
        <div className="mb-4">
          <Alert tone="warning">Gli inviti automatici sono disattivati. Attivali qui sotto e inserisci il link alle recensioni Google.</Alert>
        </div>
      )}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Inviti inviati (30 giorni)" value={sent.length} />
        <Stat label="Link aperti" value={clicked.length} hint={sent.length ? `${Math.round((clicked.length / sent.length) * 100)}% degli inviti` : undefined} />
        <Stat label="Da inviare su WhatsApp" value={toSend.length} />
        <Stat label="In programma (email)" value={all.filter((r) => r.status === "queued").length} />
      </div>
      <ReviewQueue
        token={token}
        toSend={toSend}
        history={all.slice(0, 60).map((r) => ({ id: r.id, name: r.name, status: r.status, channel: r.channel, visitDay: r.visitDay, source: r.source, skipReason: r.skipReason }))}
      />
      {ctx.permissions.has("settings.manage") && (
        <div className="mt-6">
          <ReviewSettingsForm token={token} initial={{ ...reviewConfig(t), reviewUrl: t.settings.reviewUrl ?? "" }} venue={t.displayName} />
        </div>
      )}
    </>
  );
}
