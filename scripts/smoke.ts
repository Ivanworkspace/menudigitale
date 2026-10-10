/** Dev smoke test: logs in as the demo owner (direct session) and loads every page. */
import { adminDb } from "../src/lib/firebase/admin-core";
import { randomToken, sha256 } from "../src/lib/crypto-core";

async function main() {
  const db = adminDb();
  const token = process.env.DEMO_ACCESS_TOKEN!;
  const slug = "pizzeria-da-mario";
  const tenantId = (await db.collection("slugs").doc(slug).get()).get("tenantId");
  const owner = (await db.collection("tenants").doc(tenantId).collection("staff").where("role", "==", "owner").get()).docs[0];
  const raw = randomToken();
  const now = new Date().toISOString();
  await db.collection("staff_sessions").doc(sha256(raw)).set({
    tenantId, staffId: owner.id, kind: "owner", ip: "test", userAgent: "smoke", impersonatedBy: null, createdAt: now, lastSeenAt: now,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(), revokedAt: null,
  });
  const table = (await db.collection("tenants").doc(tenantId).collection("tables").limit(1).get()).docs[0];
  const product = (await db.collection("tenants").doc(tenantId).collection("products").limit(1).get()).docs[0];
  const cust = (await db.collection("tenants").doc(tenantId).collection("customers").limit(1).get()).docs[0];
  const base = `http://localhost:3000/g/${token}`;
  const pages = [
    "dashboard", "sala", "ordini", "ordini/nuovo", "ordini/storico", "cucina", "conti", "menu", "menu/categorie", "menu/varianti",
    "menu/listini", "menu/import", "menu/qr", `menu/prodotti/${product.id}`, "menu/prodotti/nuovo", "disponibilita", "prenotazioni",
    "prenotazioni/impostazioni", "clienti", `clienti/${cust.id}`, "clienti/fidelity", "clienti/promozioni", "magazzino",
    "magazzino/ricette", "magazzino/movimenti", "statistiche", "statistiche?periodo=30g", "personale", "registro", "impostazioni",
    "impostazioni/menu", "impostazioni/ordini", "impostazioni/aspetto", "impostazioni/reparti", "impostazioni/stampanti",
    "impostazioni/pagamenti", "impostazioni/legali",
  ];
  let fail = 0;
  for (const p of pages) {
    const res = await fetch(`${base}/${p}`, { headers: { cookie: `gs=${raw}` }, redirect: "manual" });
    const html = res.status === 200 ? await res.text() : "";
    const bad = res.status !== 200 || /Application error|Unhandled Runtime Error|"digest"/.test(html);
    if (bad) fail++;
    console.log(bad ? "✗" : "✓", res.status, p);
  }
  for (const p of [`/m/${slug}`, `/m/${slug}?lang=en`, `/m/${slug}/t/${table.get("qrToken")}`, `/m/${slug}/prenota`, `/m/${slug}/privacy`, "/superadmin/login"]) {
    const res = await fetch(`http://localhost:3000${p}`);
    const bad = res.status !== 200;
    if (bad) fail++;
    console.log(bad ? "✗" : "✓", res.status, p);
  }
  await db.collection("staff_sessions").doc(sha256(raw)).delete();
  console.log(fail ? `\n${fail} pagine con errori` : "\nTutte le pagine OK");
  process.exit(fail ? 1 : 0);
}
main();
