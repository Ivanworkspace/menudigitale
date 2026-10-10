/**
 * Protection against orders sent from home (spec section 4). Pure decision
 * logic: the API gathers facts and this function decides.
 */
import { isWithinRadius } from "./geo";

export type OrderProtection = {
  requireOpenTable: boolean;
  autoOpenOnScan: boolean;
  geofence: "off" | "block" | "waiter_confirm";
  tableCode: boolean;
  manualFirstApproval: boolean;
  maxOrdersPerMinute: number;
};

export type GeoFact = { status: "ok"; lat: number; lng: number; accuracy: number | null } | { status: "denied" } | { status: "unavailable" };

export type GuardInput = {
  protection: OrderProtection;
  menuMode: "static" | "table_orders" | "ayce";
  session: { id: string; status: "open" | "bill_requested" | "closed"; accessCode: string | null; firstOrderApproved: boolean; ordersCount: number } | null;
  /** Session id bound to the guest's device cookie at join time. */
  guestSessionId: string | null;
  codeProvided: string | null;
  geo: GeoFact;
  venue: { lat: number | null; lng: number | null; radiusM: number };
  recentOrdersLastMinute: number;
};

export type BlockReason =
  | "ordering_disabled"
  | "table_closed"
  | "session_expired"
  | "bad_code"
  | "outside_area"
  | "geo_denied"
  | "rate_limited";

export type GuardResult =
  | { ok: true; needsApproval: boolean; approvalReason: "first_order" | "geo" | null; distanceM: number | null }
  | { ok: false; reason: BlockReason; distanceM: number | null };

export const BLOCK_MESSAGES: Record<BlockReason, string> = {
  ordering_disabled: "Gli ordini dal telefono non sono attivi in questo momento.",
  table_closed: "Il tavolo non è ancora aperto: chiedi al personale di aprirlo.",
  session_expired: "Questa sessione del tavolo è chiusa. Scansiona di nuovo il QR sul tavolo.",
  bad_code: "Codice tavolo non corretto. Chiedilo al cameriere.",
  outside_area: "Sembra che tu non sia nel locale: gli ordini si possono inviare solo dal tavolo.",
  geo_denied: "Per ordinare consenti l'accesso alla posizione, oppure chiedi al cameriere.",
  rate_limited: "Hai inviato troppi ordini in poco tempo. Attendi un minuto.",
};

export function guardOrder(i: GuardInput): GuardResult {
  if (i.menuMode === "static") return { ok: false, reason: "ordering_disabled", distanceM: null };

  // 1–2. Open table + per-session QR binding (a photo of the QR taken home
  // carries an old session id that no longer matches once the bill is closed).
  if (!i.session || i.session.status === "closed") {
    return { ok: false, reason: i.guestSessionId ? "session_expired" : "table_closed", distanceM: null };
  }
  if (i.protection.requireOpenTable && i.guestSessionId !== i.session.id) {
    return { ok: false, reason: "session_expired", distanceM: null };
  }

  // 4. Table code (changes at every opening).
  if (i.protection.tableCode && i.session.accessCode && i.codeProvided !== i.session.accessCode) {
    return { ok: false, reason: "bad_code", distanceM: null };
  }

  // 6. Rate limit per table.
  if (i.recentOrdersLastMinute >= Math.max(1, i.protection.maxOrdersPerMinute)) {
    return { ok: false, reason: "rate_limited", distanceM: null };
  }

  // 3. Geofence.
  let distanceM: number | null = null;
  let geoApproval = false;
  if (i.protection.geofence !== "off" && i.venue.lat != null && i.venue.lng != null) {
    if (i.geo.status !== "ok") {
      if (i.protection.geofence === "block") return { ok: false, reason: "geo_denied", distanceM: null };
      geoApproval = true;
    } else {
      const r = isWithinRadius({ lat: i.venue.lat, lng: i.venue.lng }, i.venue.radiusM, i.geo);
      distanceM = r.distanceM;
      if (!r.inside) {
        if (i.protection.geofence === "block") return { ok: false, reason: "outside_area", distanceM };
        geoApproval = true;
      }
    }
  }

  // 5. Manual approval of the first order of each session.
  const firstApproval = i.protection.manualFirstApproval && !i.session.firstOrderApproved;
  return {
    ok: true,
    needsApproval: firstApproval || geoApproval,
    approvalReason: geoApproval ? "geo" : firstApproval ? "first_order" : null,
    distanceM,
  };
}
