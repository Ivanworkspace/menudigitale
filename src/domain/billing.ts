/**
 * Bill calculation (pre-receipt / "preconto"). All amounts are integer
 * cents, VAT-inclusive (Italian retail prices). Pure and fully tested.
 *
 * NOTE: this is NOT a fiscal document. The fiscal receipt must be issued by
 * the telematic cash register (RT).
 */

export type BillLine = {
  id: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  vatRateBp: number;
};

export type Adjustment = {
  id: string;
  kind: "discount" | "surcharge";
  mode: "percent" | "amount";
  /** percent: basis points (1000 = 10%); amount: cents */
  value: number;
  reason: string;
};

export type BillInput = {
  lines: BillLine[];
  covers: number;
  coverChargeCents: number;
  servicePctBp: number;
  adjustments: Adjustment[];
  /** All you can eat: per-person prices replace the cover charge. */
  ayce?: { adults: number; children: number; adultCents: number; childCents: number; vatRateBp: number } | null;
  /** VAT rate applied to cover/service/AYCE fees (default 10%). */
  feesVatRateBp?: number;
};

export type VatRow = { rateBp: number; grossCents: number; netCents: number; vatCents: number };

export type BillTotals = {
  itemsCents: number;
  coverCents: number;
  ayceCents: number;
  serviceCents: number;
  adjustmentsCents: number; // negative = discount
  totalCents: number;
  vat: VatRow[];
};

const pct = (cents: number, bp: number) => Math.round((cents * bp) / 10_000);

export function computeBill(b: BillInput): BillTotals {
  const feesVat = b.feesVatRateBp ?? 1000;
  // Gross amounts per VAT rate before adjustments.
  const byRate = new Map<number, number>();
  const add = (rate: number, cents: number) => byRate.set(rate, (byRate.get(rate) ?? 0) + cents);

  let itemsCents = 0;
  for (const l of b.lines) {
    const c = l.qty * l.unitPriceCents;
    itemsCents += c;
    add(l.vatRateBp, c);
  }
  let ayceCents = 0;
  let coverCents = 0;
  if (b.ayce) {
    ayceCents = b.ayce.adults * b.ayce.adultCents + b.ayce.children * b.ayce.childCents;
    add(b.ayce.vatRateBp, ayceCents);
  } else {
    coverCents = Math.max(0, b.covers) * b.coverChargeCents;
    add(feesVat, coverCents);
  }
  const base = itemsCents + ayceCents + coverCents;
  const serviceCents = pct(itemsCents + ayceCents, b.servicePctBp);
  add(feesVat, serviceCents);

  // Adjustments apply to the whole bill and are spread over VAT rates
  // proportionally (largest-remainder) so the VAT breakdown stays exact.
  const subtotal = base + serviceCents;
  let adjustmentsCents = 0;
  for (const a of b.adjustments) {
    const amount = a.mode === "percent" ? pct(subtotal, a.value) : a.value;
    adjustmentsCents += a.kind === "discount" ? -amount : amount;
  }
  if (subtotal + adjustmentsCents < 0) adjustmentsCents = -subtotal;
  const totalCents = subtotal + adjustmentsCents;

  const rates = [...byRate.entries()].filter(([, c]) => c !== 0).sort((a, b) => a[0] - b[0]);
  const distributed = distribute(adjustmentsCents, rates.map(([, c]) => c));
  const vat: VatRow[] = rates.map(([rateBp, gross], i) => {
    const g = gross + distributed[i];
    const net = Math.round((g * 10_000) / (10_000 + rateBp));
    return { rateBp, grossCents: g, netCents: net, vatCents: g - net };
  });

  return { itemsCents, coverCents, ayceCents, serviceCents, adjustmentsCents, totalCents, vat };
}

/**
 * Splits `amount` proportionally to `weights` with integer cents; the sum
 * of the result is exactly `amount` (largest remainder method).
 */
export function distribute(amount: number, weights: number[]): number[] {
  const total = weights.reduce((s, w) => s + w, 0);
  if (!weights.length) return [];
  if (total === 0) return equalSplit(amount, weights.length);
  const raw = weights.map((w) => (amount * w) / total);
  const floored = raw.map((r) => Math.trunc(r));
  let rest = amount - floored.reduce((s, v) => s + v, 0);
  const order = raw.map((r, i) => ({ i, frac: Math.abs(r - Math.trunc(r)) })).sort((a, b) => b.frac - a.frac);
  const step = Math.sign(rest);
  for (let k = 0; rest !== 0 && k < order.length * 2; k++) {
    floored[order[k % order.length].i] += step;
    rest -= step;
  }
  return floored;
}

/** "Alla romana": n equal parts that add up exactly to the total. */
export function equalSplit(totalCents: number, parts: number): number[] {
  const n = Math.max(1, Math.floor(parts));
  const base = Math.trunc(totalCents / n);
  const rem = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/**
 * Amount due for a selection of line quantities ("conto separato per
 * prodotti"): the items plus their proportional share of service and
 * adjustments. Cover/AYCE fees are split per person by `persons`.
 */
export function selectionAmount(
  b: BillInput,
  totals: BillTotals,
  selection: Record<string, number>,
  opts: { persons?: number; totalPersons?: number } = {},
): number {
  let items = 0;
  for (const l of b.lines) {
    const q = Math.min(Math.max(0, selection[l.id] ?? 0), l.qty);
    items += q * l.unitPriceCents;
  }
  const fees = totals.coverCents + totals.ayceCents;
  const feeShare = opts.persons && opts.totalPersons ? Math.round((fees * opts.persons) / opts.totalPersons) : 0;
  const baseAll = totals.itemsCents + fees;
  const share = items + feeShare;
  if (baseAll === 0) return 0;
  const extra = totals.serviceCents + totals.adjustmentsCents;
  return share + Math.round((extra * share) / baseAll);
}

export type PaymentMethod = "cash" | "card" | "satispay" | "paypal" | "voucher" | "other";

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Contanti",
  card: "Carta / POS",
  satispay: "Satispay",
  paypal: "PayPal",
  voucher: "Buono / Ticket",
  other: "Altro",
};

export type Payment = { id: string; method: PaymentMethod; amountCents: number; tenderedCents?: number | null; changeCents?: number | null; partId?: string | null; at: string; by: string | null };

export function paidCents(payments: Pick<Payment, "amountCents">[]): number {
  return payments.reduce((s, p) => s + p.amountCents, 0);
}

/** Cash payment: given what the customer hands over, how much is applied and the change. */
export function cashChange(dueCents: number, tenderedCents: number): { appliedCents: number; changeCents: number } {
  if (tenderedCents <= 0) return { appliedCents: 0, changeCents: 0 };
  if (tenderedCents >= dueCents) return { appliedCents: dueCents, changeCents: tenderedCents - dueCents };
  return { appliedCents: tenderedCents, changeCents: 0 };
}

export const FISCAL_WARNING =
  "Questo è un PRECONTO e non ha valore fiscale. Il documento commerciale va emesso con il registratore telematico (RT).";
