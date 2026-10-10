"use server";

import { refs, nowIso, withId } from "@/server/db";
import { UserError } from "@/server/action";
import { readGuestCookie, setGuestCookie } from "@/server/guest";
import { getTenant, tenantSubscription } from "@/server/tenancy/resolve";
import { getTable, nowMode, openSession, refreshTableStatus, resolveTableToken } from "@/server/sala/service";
import { createOrder, recentOrdersCount, type LineInput } from "@/server/orders/service";
import { mintGuestToken } from "@/server/auth/firebase-token";
import { checkLockout, recordAttempt } from "@/server/auth/rate-limit";
import { notify } from "@/server/notify";
import { clientIp } from "@/server/request";
import { randomToken } from "@/server/crypto";
import { BLOCK_MESSAGES, guardOrder, type GeoFact } from "@/domain/order-guard";
import type { TableSession } from "@/domain/orders";
import type { LockoutPolicy } from "@/domain/lockout";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string; code?: string };

/** Anti-bot: many blocked/failed attempts from one IP → temporary refusal. */
const BOT_POLICY: LockoutPolicy = { maxFailures: 20, windowMs: 10 * 60_000, lockMs: 30 * 60_000 };

async function context(slug: string, tableToken: string) {
  const ref = await resolveTableToken(tableToken);
  if (!ref) throw new UserError("QR non valido o rigenerato: chiedi al personale.");
  const tenant = await getTenant(ref.tenantId);
  if (!tenant || tenant.slug !== slug || !tenantSubscription(tenant).accessAllowed) throw new UserError("Menu non disponibile.");
  const table = await getTable(tenant.id, ref.tableId);
  const session = table.currentSessionId ? withId<TableSession>(await refs.tableSessions(tenant.id).doc(table.currentSessionId).get()) : null;
  return { tenant, table, session };
}

async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof UserError || (e as Error).name === "SelectionError") return { ok: false, error: (e as Error).message };
    console.error(e);
    return { ok: false, error: "Si è verificato un errore. Riprova." };
  }
}

/**
 * Binds this device to the table's current session (scan of the QR).
 * Opens the table automatically if the venue allows it.
 */
export async function joinTable(slug: string, tableToken: string, opts: { code?: string; geo?: GeoFact } = {}) {
  return guard(async () => {
    const ctx = await context(slug, tableToken);
    const { tenant, table } = ctx;
    let session = ctx.session;
    const mode = nowMode(tenant);
    const p = tenant.settings.orderProtection;
    if (mode === "static") return { state: "static" as const };

    // Proof of presence before binding the device to the table: with a strict
    // geofence a QR photo used from home cannot even join an open table.
    if (p.geofence === "block" && tenant.lat != null && tenant.lng != null) {
      const geo = sanitizeGeo(opts.geo);
      if (geo.status !== "ok") return { state: "need_geo" as const };
      const { isWithinRadius } = await import("@/domain/geo");
      const r = isWithinRadius({ lat: tenant.lat, lng: tenant.lng }, tenant.geofenceRadiusM, geo);
      if (!r.inside) {
        await refs.orderBlocks(tenant.id).add({
          tableId: table.id, tableLabel: table.label, sessionId: session?.id ?? null, reason: "outside_area_join",
          distanceM: r.distanceM, ip: await clientIp(), createdAt: nowIso(),
        });
        return { state: "outside" as const, message: BLOCK_MESSAGES.outside_area };
      }
    }

    if (!session || session.status === "closed") {
      // AYCE needs covers from the staff, so it is never auto-opened.
      if (p.autoOpenOnScan && mode === "table_orders") {
        const id = await openSession(tenant, table.id, { covers: 0, coversChildren: 0, waiterId: null, waiterName: null }, { id: null, name: "QR" });
        session = withId<TableSession>(await refs.tableSessions(tenant.id).doc(id).get());
        await notify(tenant.id, { type: "message", title: `Tavolo ${table.label} aperto dal QR` });
      } else {
        return { state: "closed" as const };
      }
    }
    if (p.tableCode && session!.accessCode) {
      const code = opts.code;
      if (!code) return { state: "code" as const };
      const ip = await clientIp();
      const lock = await checkLockout("table_code", `${tenant.id}:${ip}`, BOT_POLICY);
      if (lock.locked) throw new UserError("Troppi tentativi. Chiedi al personale.");
      const ok = code === session!.accessCode;
      await recordAttempt("table_code", `${tenant.id}:${ip}`, ok, tenant.id);
      if (!ok) return { state: "code" as const, error: "Codice non corretto." };
    }
    const existing = await readGuestCookie();
    await setGuestCookie(slug, {
      tenantId: tenant.id,
      tableId: table.id,
      sessionId: session!.id,
      deviceId: existing?.deviceId ?? randomToken(9),
      codeOk: true,
    });
    return { state: "joined" as const, sessionId: session!.id };
  });
}

export async function placeOrder(
  slug: string,
  tableToken: string,
  input: { lines: LineInput[]; notes?: string; geo: GeoFact; code?: string | null },
) {
  return guard(async () => {
    const { tenant, table, session } = await context(slug, tableToken);
    const guest = await readGuestCookie();
    const ip = await clientIp();
    const bot = await checkLockout("order_ip", ip, BOT_POLICY);
    if (bot.locked) throw new UserError(BLOCK_MESSAGES.rate_limited);

    const p = tenant.settings.orderProtection;
    const guestSessionId = guest && guest.tenantId === tenant.id && guest.tableId === table.id ? guest.sessionId : null;
    const decision = guardOrder({
      protection: p,
      menuMode: nowMode(tenant),
      session: session
        ? { id: session.id, status: session.status, accessCode: session.accessCode, firstOrderApproved: session.firstOrderApproved, ordersCount: session.ordersCount }
        : null,
      guestSessionId,
      // The code was verified at join time and is bound in the cookie.
      codeProvided: guest?.codeOk && guestSessionId === session?.id ? session?.accessCode ?? null : (input.code ?? null),
      geo: sanitizeGeo(input.geo),
      venue: { lat: tenant.lat, lng: tenant.lng, radiusM: tenant.geofenceRadiusM },
      recentOrdersLastMinute: session ? await recentOrdersCount(tenant.id, session.id) : 0,
    });

    if (!decision.ok) {
      await recordAttempt("order_ip", ip, false, tenant.id);
      await refs.orderBlocks(tenant.id).add({
        tableId: table.id,
        tableLabel: table.label,
        sessionId: session?.id ?? null,
        reason: decision.reason,
        distanceM: decision.distanceM,
        ip,
        createdAt: nowIso(),
      });
      if (decision.reason === "outside_area" || decision.reason === "session_expired" || decision.reason === "geo_denied") {
        await notify(tenant.id, {
          type: "order_blocked",
          title: `Ordine bloccato · Tavolo ${table.label}`,
          body: BLOCK_MESSAGES[decision.reason] + (decision.distanceM ? ` (distanza ${decision.distanceM} m)` : ""),
        });
      }
      return { status: "blocked" as const, message: BLOCK_MESSAGES[decision.reason], reason: decision.reason };
    }

    const r = await createOrder(tenant, session!.id, input.lines, {
      source: "qr",
      actor: { id: null, name: "Cliente" },
      deviceId: guest?.deviceId ?? null,
      notes: input.notes,
      needsApproval: decision.needsApproval,
      approvalReason: decision.approvalReason,
    });
    return { status: r.status, orderId: r.orderId };
  });
}

function sanitizeGeo(g: GeoFact | undefined): GeoFact {
  if (!g || typeof g !== "object") return { status: "unavailable" };
  if (g.status === "ok" && Number.isFinite(g.lat) && Number.isFinite(g.lng) && Math.abs(g.lat) <= 90 && Math.abs(g.lng) <= 180) {
    return { status: "ok", lat: g.lat, lng: g.lng, accuracy: Number.isFinite(g.accuracy ?? NaN) ? Number(g.accuracy) : null };
  }
  return g.status === "denied" ? { status: "denied" } : { status: "unavailable" };
}

export async function requestService(slug: string, tableToken: string, type: "call_waiter" | "request_bill") {
  return guard(async () => {
    if (type !== "call_waiter" && type !== "request_bill") throw new UserError("Richiesta non valida.");
    const { tenant, table, session } = await context(slug, tableToken);
    const guest = await readGuestCookie();
    if (!session || session.status === "closed" || guest?.sessionId !== session.id) throw new UserError("Il tavolo non è aperto.");
    const open = await refs
      .serviceRequests(tenant.id)
      .where("tableSessionId", "==", session.id)
      .where("type", "==", type)
      .where("status", "==", "open")
      .limit(1)
      .get();
    if (open.empty) {
      await refs.serviceRequests(tenant.id).add({
        tableSessionId: session.id,
        tableId: table.id,
        tableLabel: session.tableLabel,
        type,
        status: "open",
        createdAt: nowIso(),
        handledBy: null,
      });
      await notify(tenant.id, {
        type,
        title: type === "call_waiter" ? `Tavolo ${session.tableLabel} chiama il cameriere` : `Tavolo ${session.tableLabel} chiede il conto`,
        urgent: true,
      });
      if (type === "request_bill") await refreshTableStatus(tenant.id, session.id);
    }
  });
}

/** Firebase custom token so the guest can follow their orders in realtime. */
export async function guestRealtimeToken(slug: string, tableToken: string) {
  return guard(async () => {
    const { tenant, session } = await context(slug, tableToken);
    const guest = await readGuestCookie();
    if (!session || session.status === "closed" || guest?.sessionId !== session.id) throw new UserError("Sessione non valida.");
    const token = await mintGuestToken({ tenantId: tenant.id, tableSessionId: session.id, deviceId: guest.deviceId });
    return { token, tenantId: tenant.id, sessionId: session.id };
  });
}

