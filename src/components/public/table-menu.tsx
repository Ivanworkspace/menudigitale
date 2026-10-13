"use client";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { clientAuth, clientDb } from "@/lib/firebase/client";
import { cn } from "@/lib/cn";
import { formatEuro } from "@/lib/format";
import { publicDict } from "@/i18n/public";
import { orderProgress, type Order, type OrderProgress } from "@/domain/orders";
import { tr } from "@/domain/menu";
import type { GeoFact } from "@/domain/order-guard";
import type { PublicMenu, PublicProduct } from "@/server/menu/public";
import { PublicMenuView, Sheet } from "./public-menu";
import { guestRealtimeToken, joinTable, placeOrder, requestService } from "@/app/m/[slug]/t/[tableToken]/actions";

type SessionInfo = {
  id: string;
  status: "open" | "bill_requested" | "closed";
  joined: boolean;
  covers: number;
  ayce: {
    adultCents: number;
    childCents: number;
    piecesPerPerson: number;
    minIntervalSec: number;
    nextRoundInSec: number;
    rounds: number;
    penaltyNote: string | null;
  } | null;
};

type CartLine = {
  key: string;
  product: PublicProduct;
  qty: number;
  selection: Record<string, string[]>;
  notes: string;
};

type JoinState = "idle" | "joining" | "closed" | "code" | "need_geo" | "outside" | "joined" | "static";

function getGeo(): Promise<GeoFact> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve({ status: "unavailable" });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ status: "ok", lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => resolve(e.code === e.PERMISSION_DENIED ? { status: "denied" } : { status: "unavailable" }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

export function unitPrice(p: PublicProduct, sel: Record<string, string[]>) {
  let price = p.priceCents;
  for (const g of p.modifierGroups) for (const id of sel[g.id] ?? []) price += g.options.find((o) => o.id === id)?.priceDeltaCents ?? 0;
  return Math.max(0, price);
}

export function TableMenu(props: {
  menu: PublicMenu;
  slug: string;
  tableToken: string;
  tableLabel: string;
  mode: "static" | "table_orders" | "ayce";
  session: SessionInfo | null;
  protection: { geofence: boolean; tableCode: boolean };
  reviewUrl: string | null;
}) {
  const { menu, slug, tableToken, session, mode } = props;
  const t = publicDict(menu.lang);
  const router = useRouter();
  const accent = menu.venue.primaryColor;
  const ayce = mode === "ayce" && !!session?.ayce;

  const [join, setJoin] = useState<JoinState>(mode === "static" ? "static" : !session ? "closed" : session.joined ? "joined" : "idle");
  const [code, setCode] = useState("");
  const [joinMsg, setJoinMsg] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [orderNotes, setOrderNotes] = useState("");
  const [toast, setToast] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [wait, setWait] = useState(session?.ayce?.nextRoundInSec ?? 0);
  const [pending, start] = useTransition();

  const flash = (tone: "ok" | "err", text: string) => {
    setToast({ tone, text });
    setTimeout(() => setToast(null), 5000);
  };

  // --- Join the table session -------------------------------------------------
  const doJoin = useCallback(
    (withCode?: string) =>
      start(async () => {
        setJoin("joining");
        const geo = props.protection.geofence ? await getGeo() : undefined;
        const r = await joinTable(slug, tableToken, { code: withCode, geo });
        if (!r.ok) {
          setJoinMsg(r.error);
          setJoin("closed");
          return;
        }
        const d = r.data;
        if (d.state === "joined") {
          setJoin("joined");
          router.refresh();
        } else if (d.state === "code") {
          setJoin("code");
          setJoinMsg("error" in d ? (d.error ?? null) : null);
        } else if (d.state === "outside") {
          setJoin("outside");
          setJoinMsg(d.message);
        } else setJoin(d.state);
      }),
    [slug, tableToken, props.protection.geofence, router],
  );

  useEffect(() => {
    if (join === "idle") doJoin();
  }, [join, doJoin]);

  // --- Realtime order status ------------------------------------------------
  useEffect(() => {
    if (join !== "joined" || !session) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const r = await guestRealtimeToken(slug, tableToken);
      if (!r.ok || cancelled) return;
      await signInWithCustomToken(clientAuth(), r.data.token);
      const q = query(collection(clientDb(), "tenants", r.data.tenantId, "orders"), where("tableSessionId", "==", r.data.sessionId));
      unsub = onSnapshot(q, (snap) => {
        setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Order).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      });
    })().catch(() => {});
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [join, session, slug, tableToken]);

  // --- AYCE countdown ---------------------------------------------------------
  useEffect(() => {
    if (!ayce || wait <= 0) return;
    const id = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(id);
  }, [ayce, wait]);

  const canOrder = join === "joined" && mode !== "static" && session?.status === "open";
  const maxPieces = ayce ? session!.ayce!.piecesPerPerson * Math.max(1, session!.covers) : 0;
  const includedPieces = cart.filter((l) => l.product.ayceIncluded).reduce((n, l) => n + l.qty, 0);
  const cartTotal = cart.reduce((s, l) => s + (ayce && l.product.ayceIncluded ? 0 : unitPrice(l.product, l.selection) * l.qty), 0);
  const cartCount = cart.reduce((n, l) => n + l.qty, 0);

  const addToCart = (p: PublicProduct, qty: number, selection: Record<string, string[]>, notes: string) => {
    if (ayce && p.ayceIncluded && includedPieces + qty > maxPieces) {
      flash("err", t.piecesLeft(includedPieces, maxPieces));
      return false;
    }
    const key = `${p.id}|${JSON.stringify(selection)}|${notes}`;
    setCart((c) => {
      const found = c.find((l) => l.key === key);
      return found ? c.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l)) : [...c, { key, product: p, qty, selection, notes }];
    });
    return true;
  };

  const send = () =>
    start(async () => {
      const geo = props.protection.geofence ? await getGeo() : ({ status: "unavailable" } as GeoFact);
      const r = await placeOrder(slug, tableToken, {
        lines: cart.map((l) => ({
          productId: l.product.id,
          qty: l.qty,
          notes: l.notes,
          modifiers: Object.entries(l.selection).map(([groupId, optionIds]) => ({ groupId, optionIds })),
        })),
        notes: orderNotes,
        geo,
      });
      if (!r.ok) return flash("err", r.error);
      if (r.data.status === "blocked") return flash("err", r.data.message);
      setCart([]);
      setOrderNotes("");
      setCartOpen(false);
      setOrdersOpen(true);
      flash("ok", r.data.status === "pending_approval" ? t.orderPending : t.orderSent);
      if (ayce && includedPieces > 0) setWait(session!.ayce!.minIntervalSec);
    });

  const service = (type: "call_waiter" | "request_bill") =>
    start(async () => {
      const r = await requestService(slug, tableToken, type);
      flash(r.ok ? "ok" : "err", r.ok ? t.requestSent : r.error);
    });

  const progressLabel: Record<OrderProgress, string> = {
    pending: t.statusPending,
    sent: t.statusSent,
    preparing: t.statusPreparing,
    ready: t.statusReady,
    served: t.statusServed,
    cancelled: t.statusCancelled,
  };

  const header = (
    <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-lg font-bold">
          {t.table} {props.tableLabel}
        </p>
        {ayce && (
          <span className="rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ background: accent }}>
            All you can eat · {formatEuro(session!.ayce!.adultCents)} {t.perPerson}
          </span>
        )}
      </div>
      {join === "static" && <p className="text-sm text-slate-600">{t.staticOnly}</p>}
      {join === "closed" && <p className="text-sm text-slate-600">{joinMsg ?? t.tableClosed}</p>}
      {join === "joining" && <p className="text-sm text-slate-500">{t.locating}</p>}
      {join === "need_geo" && (
        <div className="space-y-2 text-sm">
          <p>{t.needGeo}</p>
          <button onClick={() => doJoin()} className="rounded-xl px-4 py-2 font-semibold text-white" style={{ background: accent }}>
            📍 {t.allowGeo}
          </button>
        </div>
      )}
      {join === "outside" && <p className="text-sm text-red-600">{joinMsg ?? t.outside}</p>}
      {join === "code" && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            doJoin(code);
          }}
        >
          <p className="text-sm font-medium">{t.enterCode}</p>
          <p className="text-xs text-slate-500">{t.enterCodeHint}</p>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              className="h-11 w-28 rounded-xl px-3 text-center font-mono text-lg tracking-widest ring-1 ring-slate-300"
              autoFocus
            />
            <button disabled={code.length !== 4 || pending} className="rounded-xl px-4 font-semibold text-white disabled:opacity-50" style={{ background: accent }}>
              {t.confirm}
            </button>
          </div>
          {joinMsg && <p className="text-sm text-red-600">{joinMsg}</p>}
        </form>
      )}
      {join === "joined" && (
        <>
          {ayce && (
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              {wait > 0 ? (
                <p>
                  ⏱️ {t.nextRoundIn}{" "}
                  <span className="font-mono font-semibold tabular-nums">
                    {Math.floor(wait / 60)}:{String(wait % 60).padStart(2, "0")}
                  </span>
                </p>
              ) : (
                <p className="font-medium text-emerald-700">✅ {t.roundReady}</p>
              )}
              <p className="mt-1 text-slate-600">{t.piecesLeft(includedPieces, maxPieces)}</p>
              {session!.ayce!.penaltyNote && <p className="mt-1 text-xs text-slate-500">{session!.ayce!.penaltyNote}</p>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button disabled={pending} onClick={() => service("call_waiter")} className="rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-semibold">
              🙋 {t.callWaiter}
            </button>
            <button disabled={pending} onClick={() => service("request_bill")} className="rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-semibold">
              🧾 {t.requestBill}
            </button>
          </div>
          {orders.length > 0 && (
            <button onClick={() => setOrdersOpen(true)} className="w-full rounded-xl px-3 py-2 text-left text-sm ring-1 ring-slate-200">
              📋 {t.yourOrders} ({orders.length}) · {progressLabel[orderProgress(orders[0])]}
            </button>
          )}
        </>
      )}
    </div>
  );

  return (
    <>
      <PublicMenuView
        menu={menu}
        scanType="qr_scan"
        slots={{
          header,
          ayce,
          cardAction: canOrder
            ? (p) =>
                p.modifierGroups.some((g) => g.minSelect > 0) ? null : (
                  <button
                    onClick={() => addToCart(p, 1, {}, "") && flash("ok", `+1 ${p.name}`)}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-xl font-semibold text-white shadow"
                    style={{ background: accent }}
                    aria-label={`${t.add} ${p.name}`}
                  >
                    +
                  </button>
                )
            : undefined,
          productAction: canOrder ? (p) => (p.available ? <ProductPicker p={p} t={t} accent={accent} ayce={ayce} onAdd={addToCart} /> : null) : undefined,
          bottomBar:
            cartCount > 0 ? (
              <div className="fixed inset-x-0 bottom-0 z-30 p-3">
                <button
                  onClick={() => setCartOpen(true)}
                  className="mx-auto flex w-full max-w-3xl items-center justify-between rounded-2xl px-5 py-4 font-semibold text-white shadow-xl"
                  style={{ background: accent }}
                >
                  <span>
                    🛒 {t.viewCart} ({cartCount})
                  </span>
                  <span className="tabular-nums">{formatEuro(cartTotal)}</span>
                </button>
              </div>
            ) : null,
        }}
      />

      {toast && (
        <div
          className={cn(
            "fixed inset-x-0 top-3 z-50 mx-auto w-[92%] max-w-md rounded-xl px-4 py-3 text-center text-sm font-medium shadow-lg",
            toast.tone === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white",
          )}
          role="status"
        >
          {toast.text}
        </div>
      )}

      {cartOpen && (
        <Sheet onClose={() => setCartOpen(false)} label={t.close}>
          <h2 className="text-lg font-bold">{t.cart}</h2>
          {cart.length === 0 ? (
            <p className="mt-4 text-slate-500">{t.empty}</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {cart.map((l) => {
                const opts = l.product.modifierGroups.flatMap((g) => (l.selection[g.id] ?? []).map((id) => g.options.find((o) => o.id === id)?.name)).filter(Boolean);
                return (
                  <li key={l.key} className="flex items-start gap-3 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCart((c) => c.map((x) => (x.key === l.key ? { ...x, qty: x.qty - 1 } : x)).filter((x) => x.qty > 0))}
                        className="h-8 w-8 rounded-full bg-slate-100 font-bold"
                        aria-label="-1"
                      >
                        −
                      </button>
                      <span className="w-5 text-center font-semibold tabular-nums">{l.qty}</span>
                      <button
                        onClick={() => addToCart(l.product, 1, l.selection, l.notes)}
                        className="h-8 w-8 rounded-full bg-slate-100 font-bold"
                        aria-label="+1"
                      >
                        +
                      </button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{l.product.name}</p>
                      {opts.length > 0 && <p className="text-xs text-slate-500">{opts.join(", ")}</p>}
                      {l.notes && <p className="text-xs italic text-slate-500">“{l.notes}”</p>}
                    </div>
                    <span className="text-sm font-semibold tabular-nums">
                      {ayce && l.product.ayceIncluded ? t.ayceIncluded : formatEuro(unitPrice(l.product, l.selection) * l.qty)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <label className="mt-3 block text-sm font-medium">{t.orderNotes}</label>
          <textarea
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value.slice(0, 300))}
            rows={2}
            className="mt-1 w-full rounded-xl p-3 text-sm ring-1 ring-slate-300"
          />
          {ayce && <p className="mt-2 text-sm text-slate-600">{t.piecesLeft(includedPieces, maxPieces)}</p>}
          <div className="mt-4 flex items-center justify-between text-lg font-bold">
            <span>{t.total}</span>
            <span className="tabular-nums">{formatEuro(cartTotal)}</span>
          </div>
          <button
            disabled={pending || cart.length === 0 || (ayce && includedPieces > 0 && wait > 0)}
            onClick={send}
            className="mt-4 w-full rounded-2xl py-4 text-lg font-bold text-white disabled:opacity-50"
            style={{ background: accent }}
          >
            {pending ? t.sending : ayce && includedPieces > 0 && wait > 0 ? `${t.nextRoundIn} ${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, "0")}` : t.sendOrder}
          </button>
        </Sheet>
      )}

      {ordersOpen && (
        <Sheet onClose={() => setOrdersOpen(false)} label={t.close}>
          <h2 className="text-lg font-bold">{t.yourOrders}</h2>
          <ul className="mt-3 space-y-3">
            {orders.map((o) => {
              const pr = orderProgress(o);
              return (
                <li key={o.id} className="rounded-xl p-3 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      {new Date(o.createdAt).toLocaleTimeString(menu.lang, { hour: "2-digit", minute: "2-digit" })}
                      {o.round ? ` · #${o.round}` : ""}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        pr === "ready" ? "bg-emerald-100 text-emerald-800" : pr === "pending" ? "bg-amber-100 text-amber-800" : pr === "cancelled" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700",
                      )}
                    >
                      {progressLabel[pr]}
                    </span>
                  </div>
                  <ul className="mt-2 text-sm">
                    {o.items.map((i) => (
                      <li key={i.id} className={cn("flex justify-between", i.status === "cancelled" && "text-slate-400 line-through")}>
                        <span>
                          {i.qty}× {tr(i.name, menu.lang)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
          {props.reviewUrl && orders.some((o) => orderProgress(o) === "served") && (
            <a href={props.reviewUrl} target="_blank" rel="noopener noreferrer" className="mt-4 block rounded-xl py-3 text-center font-semibold text-white" style={{ background: menu.venue.accentColor }}>
              ⭐ {t.leaveReview}
            </a>
          )}
        </Sheet>
      )}
    </>
  );
}

export function ProductPicker({
  p,
  t,
  accent,
  ayce,
  onAdd,
}: {
  p: PublicProduct;
  t: ReturnType<typeof publicDict>;
  accent: string;
  ayce: boolean;
  onAdd: (p: PublicProduct, qty: number, sel: Record<string, string[]>, notes: string) => boolean;
}) {
  const initial = useMemo(() => {
    const s: Record<string, string[]> = {};
    for (const g of p.modifierGroups) {
      const first = g.options.find((o) => o.available);
      if (g.kind === "variant" && g.minSelect === 1 && g.maxSelect === 1 && first) s[g.id] = [first.id];
    }
    return s;
  }, [p]);
  const [sel, setSel] = useState<Record<string, string[]>>(initial);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [added, setAdded] = useState(false);
  const missing = p.modifierGroups.find((g) => (sel[g.id]?.length ?? 0) < g.minSelect);
  const price = unitPrice(p, sel) * qty;

  return (
    <div className="mt-5 space-y-4 border-t border-slate-100 pt-4">
      {p.modifierGroups.map((g) => {
        const single = g.maxSelect === 1;
        const chosen = sel[g.id] ?? [];
        return (
          <fieldset key={g.id}>
            <legend className="text-sm font-semibold">
              {g.name}{" "}
              <span className="font-normal text-slate-500">({g.minSelect > 0 ? t.required : t.chooseUpTo(g.maxSelect)})</span>
            </legend>
            <div className="mt-2 space-y-1.5">
              {g.options.map((o) => {
                const on = chosen.includes(o.id);
                const disabled = !o.available || (!single && !on && chosen.length >= g.maxSelect);
                return (
                  <label key={o.id} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1", on ? "ring-2" : "ring-slate-200", disabled && "opacity-40")} style={on ? { ["--tw-ring-color" as string]: accent } : undefined}>
                    <input
                      type={single ? "radio" : "checkbox"}
                      name={g.id}
                      checked={on}
                      disabled={disabled}
                      onChange={() =>
                        setSel((s) => ({
                          ...s,
                          [g.id]: single ? [o.id] : on ? chosen.filter((x) => x !== o.id) : [...chosen, o.id],
                        }))
                      }
                      style={{ accentColor: accent }}
                    />
                    <span className="flex-1 text-sm">{o.name}</span>
                    {o.priceDeltaCents !== 0 && (
                      <span className="text-sm tabular-nums text-slate-600">
                        {o.priceDeltaCents > 0 ? "+" : ""}
                        {formatEuro(o.priceDeltaCents)}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
      <div>
        <label className="text-sm font-semibold">{t.notes}</label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 200))}
          placeholder={t.notesPlaceholder}
          className="mt-1 h-11 w-full rounded-xl px-3 text-sm ring-1 ring-slate-300"
        />
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setQty(Math.max(1, qty - 1))} className="h-11 w-11 rounded-full bg-slate-100 text-xl font-bold" aria-label="-1">−</button>
          <span className="w-6 text-center text-lg font-semibold tabular-nums">{qty}</span>
          <button onClick={() => setQty(Math.min(20, qty + 1))} className="h-11 w-11 rounded-full bg-slate-100 text-xl font-bold" aria-label="+1">+</button>
        </div>
        <button
          disabled={!!missing}
          onClick={() => {
            if (onAdd(p, qty, sel, notes.trim())) {
              setAdded(true);
              setTimeout(() => setAdded(false), 1500);
            }
          }}
          className="flex flex-1 items-center justify-between rounded-2xl px-4 py-3 font-semibold text-white disabled:opacity-50"
          style={{ background: accent }}
        >
          <span>{added ? "✓" : t.addToOrder}</span>
          <span className="tabular-nums">{ayce && p.ayceIncluded ? t.ayceIncluded : formatEuro(price)}</span>
        </button>
      </div>
      {missing && <p className="text-xs text-amber-700">{missing.name}: {t.required}</p>}
    </div>
  );
}
