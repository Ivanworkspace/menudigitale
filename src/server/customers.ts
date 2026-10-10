import "server-only";
import { refs, db, nowIso, withId, FieldValue } from "@/server/db";
import { UserError } from "@/server/action";
import { DEFAULT_LOYALTY, earned, normalizePhone } from "@/domain/loyalty";
import type { Tenant } from "@/server/db/types";

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  notes: string;
  privacyConsentAt: string | null;
  marketingConsent: boolean;
  marketingConsentAt: string | null;
  visits: number;
  totalSpentCents: number;
  points: number;
  stamps: number;
  lastVisitAt: string | null;
  createdAt: string;
  searchKeys: string[];
};

export function searchKeys(c: { name: string; phone: string | null; email: string | null }) {
  const words = c.name.toLowerCase().split(/\s+/).filter(Boolean);
  const keys = new Set<string>();
  for (const w of words) for (let i = 2; i <= Math.min(w.length, 12); i++) keys.add(w.slice(0, i));
  if (c.phone) keys.add(c.phone.replace(/\D/g, "").slice(-6));
  if (c.email) keys.add(c.email.toLowerCase());
  return [...keys].slice(0, 60);
}

export async function upsertCustomer(
  tenantId: string,
  input: { id?: string; name: string; phone: string; email: string; birthday?: string | null; notes?: string; privacyConsent: boolean; marketingConsent: boolean },
): Promise<string> {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new UserError("Inserisci il nome.");
  const phone = input.phone.trim() ? normalizePhone(input.phone) : null;
  const email = input.email.trim().toLowerCase() || null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new UserError("Email non valida.");
  if (!input.privacyConsent) throw new UserError("Serve il consenso al trattamento dei dati (privacy).");
  const col = refs.customers(tenantId);
  if (phone) {
    const dup = await col.where("phone", "==", phone).limit(1).get();
    if (!dup.empty && dup.docs[0].id !== input.id) throw new UserError("Esiste già un cliente con questo telefono.");
  }
  const now = nowIso();
  const before = input.id ? withId<Customer>(await col.doc(input.id).get()) : null;
  const data = {
    name,
    phone,
    email,
    birthday: input.birthday || null,
    notes: (input.notes ?? "").slice(0, 500),
    privacyConsentAt: before?.privacyConsentAt ?? now,
    marketingConsent: input.marketingConsent,
    marketingConsentAt: input.marketingConsent ? (before?.marketingConsent ? before.marketingConsentAt : now) : null,
    searchKeys: searchKeys({ name, phone, email }),
  };
  if (before) {
    await col.doc(before.id).update(data);
    return before.id;
  }
  const ref = await col.add({ ...data, visits: 0, totalSpentCents: 0, points: 0, stamps: 0, lastVisitAt: null, createdAt: now });
  return ref.id;
}

/** Credits visit, spend and loyalty after a paid bill. Never throws. */
export async function creditBillToCustomer(tenant: Tenant, customerId: string, billId: string, totalCents: number) {
  try {
    const cfg = tenant.settings.loyalty ?? DEFAULT_LOYALTY;
    const e = tenant.modules.loyalty ? earned(cfg, totalCents) : { points: 0, stamps: 0 };
    const batch = db().batch();
    batch.update(refs.customers(tenant.id).doc(customerId), {
      visits: FieldValue.increment(1),
      totalSpentCents: FieldValue.increment(totalCents),
      points: FieldValue.increment(e.points),
      stamps: FieldValue.increment(e.stamps),
      lastVisitAt: nowIso(),
    });
    if (e.points || e.stamps) {
      batch.create(refs.loyaltyTransactions(tenant.id).doc(), {
        customerId, billId, points: e.points, stamps: e.stamps, kind: "earn", note: null, at: nowIso(),
      });
    }
    await batch.commit();
  } catch (err) {
    console.error("loyalty credit failed", err);
  }
}

export async function redeemReward(tenant: Tenant, customerId: string, rewardId: string, by: string | null) {
  const cfg = tenant.settings.loyalty ?? DEFAULT_LOYALTY;
  const reward = cfg.rewards.find((r) => r.id === rewardId);
  if (!reward) throw new UserError("Premio non trovato.");
  const field = cfg.mode === "points" ? "points" : "stamps";
  await db().runTransaction(async (tx) => {
    const ref = refs.customers(tenant.id).doc(customerId);
    const c = (await tx.get(ref)).data() as Customer | undefined;
    if (!c) throw new UserError("Cliente non trovato.");
    if ((c[field] ?? 0) < reward.cost) throw new UserError(`Servono ${reward.cost} ${field === "points" ? "punti" : "timbri"}.`);
    tx.update(ref, { [field]: FieldValue.increment(-reward.cost) });
    tx.create(refs.loyaltyTransactions(tenant.id).doc(), {
      customerId, billId: null, points: field === "points" ? -reward.cost : 0, stamps: field === "stamps" ? -reward.cost : 0,
      kind: "redeem", note: reward.name, by, at: nowIso(),
    });
  });
}

/** GDPR: removes personal data but keeps anonymous totals for statistics. */
export async function anonymizeCustomer(tenantId: string, customerId: string) {
  await refs.customers(tenantId).doc(customerId).update({
    name: "Cliente anonimizzato",
    phone: null,
    email: null,
    birthday: null,
    notes: "",
    marketingConsent: false,
    marketingConsentAt: null,
    searchKeys: [],
    anonymizedAt: nowIso(),
  });
}
