// Dev check of the review flow on the emulator: takeaway with consent → bill
// closed → request queued → morning job sends it → tracked link → opt-out.
import { adminDb } from "../../src/lib/firebase/admin-core";
import { getTenant } from "../../src/server/tenancy/resolve";
import { createTakeawayOrder, setTakeawayStatus } from "../../src/server/takeaway";
import { openBill, addPayment, closeBill } from "../../src/server/billing/service";
import { sendDueReviewEmails, openReviewLink } from "../../src/server/reviews";
import { shiftDay } from "../../src/domain/push";

async function main() {
  const db = adminDb();
  const tenantId = (await db.collection("slugs").doc("pizzeria-da-mario").get()).get("tenantId");
  const t = (await getTenant(tenantId))!;
  const { availablePickupSlots, takeawayMenuId } = await import("../../src/server/takeaway");
  const { loadMenuData } = await import("../../src/server/menu/repo");
  const { categoryInMenu } = await import("../../src/domain/menu");
  const data = await loadMenuData(tenantId);
  const menuId = takeawayMenuId(t, data.menus);
  const cats = new Map(data.categories.map((c) => [c.id, c]));
  const product = data.products.find((p) => p.available && !p.hidden && !p.modifierGroupIds.length && cats.get(p.categoryId)?.active && categoryInMenu(cats.get(p.categoryId)!, menuId))!;
  const slot = (await availablePickupSlots(t))[0];
  const email = `review.${Date.now()}@example.com`;
  const { token } = await createTakeawayOrder(t, { name: "Giulia Test", phone: "3339876543", email, reviewConsent: true, pickupTime: slot.time, lines: [{ productId: product.id, qty: 1, modifiers: [] }] });
  const tokenDoc = (await db.collection("takeaway_tokens").get()).docs.find((d) => d.get("tenantId") === tenantId && d.id)!;
  void tokenDoc;
  const { takeawayByToken } = await import("../../src/server/takeaway");
  const found = (await takeawayByToken(token))!;
  const sessionId = found.session.id;
  await setTakeawayStatus(t, sessionId, "accepted", { id: null, name: "test" });
  const bill = await openBill(t, sessionId);
  await addPayment(tenantId, bill.id, { method: "cash", amountCents: bill.totals.totalCents, by: "test" });
  await closeBill(t, bill.id, "test");
  const reqRef = db.collection("tenants").doc(tenantId).collection("review_requests").doc(`takeaway-${sessionId}`);
  const queued = (await reqRef.get()).data();
  console.log("1 queued:", queued?.status, queued?.channel, "sendOn", queued?.sendOn);
  // Simulate "tomorrow morning".
  const sent = await sendDueReviewEmails(t, shiftDay(found.session.takeaway.day, 1));
  console.log("2 morning job sent:", sent, "→", (await reqRef.get()).get("status"));
  console.log("3 click →", await openReviewLink(t, reqRef.id, false), (await reqRef.get()).get("status"));
  await openReviewLink(t, reqRef.id, true);
  // A new visit by the same contact must not be invited again (opt-out + cooldown).
  const r2 = await createTakeawayOrder(t, { name: "Giulia Test", phone: "3339876543", email, reviewConsent: true, pickupTime: slot.time, lines: [{ productId: product.id, qty: 1, modifiers: [] }] });
  const s2 = (await takeawayByToken(r2.token))!.session.id;
  await setTakeawayStatus(t, s2, "accepted", { id: null, name: "test" });
  const b2 = await openBill(t, s2);
  await addPayment(tenantId, b2.id, { method: "cash", amountCents: b2.totals.totalCents, by: "test" });
  await closeBill(t, b2.id, "test");
  const second = (await db.collection("tenants").doc(tenantId).collection("review_requests").doc(`takeaway-${s2}`).get()).data();
  console.log("4 second visit:", second?.status, "-", second?.skipReason);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
