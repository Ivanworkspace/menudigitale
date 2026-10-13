/**
 * Push notification topics the owner (or a manager) can subscribe to from
 * the owner app. Each topic maps to staff notification types.
 */
export const PUSH_TOPICS = {
  approvals: { label: "Ordini da confermare", description: "Ordini dal QR e d'asporto in attesa di conferma", types: ["order_pending"] },
  orders: { label: "Tutti i nuovi ordini", description: "Ogni comanda inviata in cucina", types: ["new_order"] },
  blocked: { label: "Tentativi bloccati", description: "Ordini da fuori locale o con codice errato", types: ["order_blocked"] },
  stock: { label: "Scorte e prodotti esauriti", description: "Ingredienti sotto soglia e piatti finiti", types: ["stock_low", "product_sold_out"] },
  service: { label: "Chiamate dai tavoli", description: "Richieste del cameriere e del conto", types: ["call_waiter", "request_bill"] },
  summary: { label: "Riepilogo del giorno prima", description: "Ogni mattina: incasso, conti e coperti di ieri", types: [] },
} as const;

export type PushTopic = keyof typeof PUSH_TOPICS;
export const PUSH_TOPIC_KEYS = Object.keys(PUSH_TOPICS) as PushTopic[];
export const DEFAULT_PUSH_TOPICS: PushTopic[] = ["approvals", "blocked", "stock", "summary"];

/** Topics whose notifications include a given staff notification type. */
export function topicsForType(type: string): PushTopic[] {
  return PUSH_TOPIC_KEYS.filter((k) => (PUSH_TOPICS[k].types as readonly string[]).includes(type));
}

/** "+12%" / "−5%" / null when there is nothing to compare. */
export function deltaLabel(current: number, previous: number): string | null {
  if (!previous) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%`;
}

/** Adds `n` days to a YYYY-MM-DD date. */
export function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
