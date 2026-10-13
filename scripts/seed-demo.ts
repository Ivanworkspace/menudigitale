/**
 * Seeds plans and a complete demo restaurant for sales presentations.
 * Idempotent: the demo tenant is recreated from scratch on every run.
 *   npm run seed
 */
import { hash } from "@node-rs/argon2";
import { adminDb, nowIso, requireEnv } from "./_shared";
import { encryptWithKey, randomToken, sha256 } from "../src/lib/crypto-core";
import { COL, SUB } from "../src/lib/firebase/paths";
import { seedDemoContent } from "./seed-content";

const DEMO_SLUG = "pizzeria-da-mario";
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const ALL_MODULES = ["orders", "kds", "billing", "payments", "reservations", "loyalty", "inventory", "advanced_stats", "multilang", "takeaway"];

const PLANS = [
  {
    code: "base", name: "Base", sort: 1, priceMonthCents: 2900, active: true,
    description: "Menu digitale con QR, multilingua",
    maxTables: 15, maxProducts: 150, maxStaff: 3, includedModules: ["multilang"],
  },
  {
    code: "pro", name: "Pro", sort: 2, priceMonthCents: 5900, active: true,
    description: "Ordini al tavolo, AYCE, cucina e conti",
    maxTables: 40, maxProducts: 400, maxStaff: 12, includedModules: ["orders", "kds", "billing", "payments", "multilang"],
  },
  {
    code: "premium", name: "Premium", sort: 3, priceMonthCents: 9900, active: true,
    description: "Tutti i moduli, limiti illimitati",
    maxTables: null, maxProducts: null, maxStaff: null, includedModules: ALL_MODULES,
  },
];

const STAFF = [
  { displayName: "Mario", role: "owner", pin: "482915", color: "#b91c1c" },
  { displayName: "Giulia", role: "manager", pin: "2580", color: "#7c3aed" },
  { displayName: "Luca", role: "waiter", pin: "3691", color: "#0891b2" },
  { displayName: "Sara", role: "waiter", pin: "4826", color: "#db2777" },
  { displayName: "Antonio", role: "kitchen", pin: "5937", color: "#ea580c" },
  { displayName: "Marco", role: "bar", pin: "7148", color: "#16a34a" },
  { displayName: "Elena", role: "cashier", pin: "8263", color: "#ca8a04" },
];

async function deleteTenant(tenantId: string) {
  const db = adminDb();
  await db.recursiveDelete(db.collection(COL.tenants).doc(tenantId));
  for (const col of [COL.accessTokens, COL.staffCredentials, COL.staffSessions, COL.tableTokens]) {
    const snap = await db.collection(col).where("tenantId", "==", tenantId).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

async function main() {
  requireEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "APP_ENCRYPTION_KEY");
  const db = adminDb();
  const encKey = process.env.APP_ENCRYPTION_KEY!;

  // Plans (upsert by code)
  const planIds: Record<string, string> = {};
  for (const p of PLANS) {
    const existing = await db.collection(COL.plans).where("code", "==", p.code).limit(1).get();
    const ref = existing.docs[0]?.ref ?? db.collection(COL.plans).doc();
    await ref.set(p, { merge: true });
    planIds[p.code] = ref.id;
  }
  await db.collection(COL.platform).doc("settings").set(
    { brandName: process.env.NEXT_PUBLIC_BRAND_NAME ?? "MenuSaaS", defaultGraceDays: 7, expiryWarningDays: [14, 7, 3, 1] },
    { merge: true },
  );
  console.log("✓ Piani Base / Pro / Premium");

  // Reset demo tenant
  const slugRef = db.collection(COL.slugs).doc(DEMO_SLUG);
  const prev = await slugRef.get();
  if (prev.exists) await deleteTenant(prev.get("tenantId"));

  const tenantRef = db.collection(COL.tenants).doc();
  const now = nowIso();
  await tenantRef.set({
    slug: DEMO_SLUG,
    status: "active",
    planId: planIds.premium,
    legalName: "Da Mario S.r.l.",
    displayName: "Pizzeria Da Mario",
    vatNumber: "00743110157",
    address: "Via Roma 12",
    city: "Milano",
    postalCode: "20121",
    province: "MI",
    phone: "+39 02 1234567",
    email: "info@pizzeriadamario.example",
    contactName: "Mario Rossi",
    lat: 45.4642,
    lng: 9.19,
    geofenceRadiusM: 120,
    defaultMenuMode: "table_orders",
    trialEndsAt: null,
    subscriptionEndsAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
    graceDays: 7,
    suspendedReason: null,
    showPoweredBy: true,
    lastActivityAt: null,
    createdAt: now,
    updatedAt: now,
    modules: Object.fromEntries(ALL_MODULES.map((m) => [m, true])),
    branding: {
      logoPath: null, coverPath: null, primaryColor: "#b91c1c", accentColor: "#f59e0b",
      backgroundColor: "#fffaf5", fontFamily: "Poppins",
    },
    settings: {
      timezone: "Europe/Rome",
      languages: ["it", "en", "de"],
      defaultLanguage: "it",
      soldOutBehavior: "show",
      coverChargeCents: 250,
      servicePctBp: 0,
      orderProtection: {
        requireOpenTable: true, autoOpenOnScan: false, geofence: "waiter_confirm",
        tableCode: false, manualFirstApproval: false, maxOrdersPerMinute: 3,
      },
      openingHours: [
        { weekdays: [2, 3, 4, 5, 6, 7], open: "12:00", close: "14:30" },
        { weekdays: [2, 3, 4, 5, 6, 7], open: "19:00", close: "23:30" },
      ],
      closures: [],
      reviewUrl: "https://g.page/r/demo",
      socials: { instagram: "https://instagram.com/pizzeriadamario", facebook: "https://facebook.com/pizzeriadamario" },
      privacyText: null,
      cookieText: null,
      frozenNote: { it: "* Prodotto surgelato o abbattuto all'origine", en: "* Frozen or blast-chilled product", de: "* Tiefgekühltes Produkt" },
      takeaway: {
        enabled: true,
        windows: [
          { weekdays: [1, 2, 3, 4, 5, 6, 7], from: "11:30", to: "14:30" },
          { weekdays: [1, 2, 3, 4, 5, 6, 7], from: "18:30", to: "23:30" },
        ],
        slotMinutes: 15, leadMinutes: 20, maxOrdersPerSlot: 4, manualAccept: true,
        minOrderCents: 0, menuId: null, note: "Pagamento al ritiro, in contanti o con carta.",
      },
    },
    stats: { ordersThisMonth: 0, ordersMonth: now.slice(0, 7) },
  });
  await slugRef.set({ tenantId: tenantRef.id });

  const fixed = process.env.DEMO_ACCESS_TOKEN;
  const token = fixed && fixed.length >= 40 ? fixed : randomToken();
  await db.collection(COL.accessTokens).doc(sha256(token)).set({
    tenantId: tenantRef.id, tokenEnc: encryptWithKey(token, encKey), hint: token.slice(-4), rotatedAt: now,
  });

  for (const [i, s] of STAFF.entries()) {
    const ref = tenantRef.collection(SUB.staff).doc();
    await ref.set({ displayName: s.displayName, role: s.role, active: true, color: s.color, sort: i, lastLoginAt: null, createdAt: now });
    await db.collection(COL.staffCredentials).doc(ref.id).set({ tenantId: tenantRef.id, pinHash: await hash(s.pin, ARGON), pinUpdatedAt: now });
  }
  await tenantRef.collection(SUB.subscriptionEvents).add({
    type: "created", periodEnd: null, amountCents: null, note: "Locale demo", createdBy: null, createdAt: now,
  });

  const { tableTokens } = await seedDemoContent(db, tenantRef.id);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  console.log("\n✓ Locale demo creato: Pizzeria Da Mario");
  console.log(`  Menu pubblico:   ${appUrl}/m/${DEMO_SLUG}`);
  console.log(`  Link gestione:   ${appUrl}/g/${token}`);
  console.log("  PIN:");
  for (const s of STAFF) console.log(`    ${s.displayName.padEnd(8)} ${s.role.padEnd(8)} ${s.pin}`);
  console.log(`  QR tavolo 1:     ${appUrl}/m/${DEMO_SLUG}/t/${tableTokens[0].token}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
