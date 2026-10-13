// Dev helper: enables review invitations on the demo venue.
import { adminDb } from "../../src/lib/firebase/admin-core";

async function main() {
  const db = adminDb();
  const s = await db.collection("slugs").doc(process.argv[2] ?? "pizzeria-da-mario").get();
  await db.collection("tenants").doc(s.get("tenantId")).update({
    "settings.reviewUrl": "https://g.page/r/demo/review",
    "settings.reviews": {
      enabled: true, fromReservations: true, fromTakeaway: true, cooldownDays: 90,
      message: "Ciao {nome}, grazie per aver scelto {locale}! Se hai un minuto, ci aiuteresti molto lasciando una recensione: {link}\nA presto!",
    },
  });
  console.log("reviews enabled");
}
main().then(() => process.exit(0));
