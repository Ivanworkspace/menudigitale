// Dev helper: enables takeaway on the demo venue with a pickup window open all day.
import { adminDb } from "../../src/lib/firebase/admin-core";

async function main() {
const db = adminDb();
const slug = process.argv[2] ?? "pizzeria-da-mario";
const s = await db.collection("slugs").doc(slug).get();
if (!s.exists) throw new Error(`slug ${slug} not found`);
await db.collection("tenants").doc(s.get("tenantId")).update({
  "modules.takeaway": true,
  "settings.takeaway": {
    enabled: true,
    windows: [{ weekdays: [1, 2, 3, 4, 5, 6, 7], from: "00:00", to: "23:59" }],
    slotMinutes: 15, leadMinutes: 20, maxOrdersPerSlot: 4, manualAccept: true,
    minOrderCents: 0, menuId: null, note: "Pagamento al ritiro, in contanti o con carta.",
  },
});
console.log("takeaway enabled on", slug);
}
main().then(() => process.exit(0));
