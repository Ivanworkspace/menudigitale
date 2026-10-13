// Dev helper: prints today's takeaway sessions of the demo venue.
import { adminDb } from "../../src/lib/firebase/admin-core";

async function main() {
  const db = adminDb();
  const s = await db.collection("slugs").doc(process.argv[2] ?? "pizzeria-da-mario").get();
  const snap = await db.collection("tenants").doc(s.get("tenantId")).collection("table_sessions").where("takeaway.number", ">", 0).get();
  for (const d of snap.docs) console.log(d.id, d.get("status"), d.get("takeaway.status"), d.get("tableLabel"), d.get("totalCents"));
}
main().then(() => process.exit(0));
