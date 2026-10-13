"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { formatEuro } from "@/lib/format";
import { publicDict } from "@/i18n/public";
import type { PublicMenu, PublicProduct } from "@/server/menu/public";
import { PublicMenuView, Sheet } from "./public-menu";
import { ProductPicker, unitPrice } from "./table-menu";
import { placeTakeaway, takeawaySlots } from "@/app/m/[slug]/asporto/actions";

const TEXT = {
  it: {
    title: "Ordina da asporto",
    closed: "In questo momento non accettiamo ordini d'asporto.",
    pickup: "Orario di ritiro",
    noSlots: "Oggi non ci sono più orari di ritiro disponibili.",
    loadingSlots: "Cerco gli orari disponibili…",
    name: "Nome",
    phone: "Telefono",
    phoneHint: "Ti chiamiamo solo se c'è un problema con l'ordine.",
    privacy: (link: React.ReactNode) => <>Ho letto l&apos;{link} e acconsento al trattamento dei dati per gestire l&apos;ordine.</>,
    privacyLink: "informativa privacy",
    send: "Conferma ordine",
    payAtPickup: "Pagamento al ritiro",
    minOrder: (v: string) => `Ordine minimo ${v}`,
    lastOrder: "Il tuo ultimo ordine",
    call: "Chiama",
  },
  en: {
    title: "Order for pickup",
    closed: "We are not taking pickup orders right now.",
    pickup: "Pickup time",
    noSlots: "No pickup times left for today.",
    loadingSlots: "Looking for available times…",
    name: "Name",
    phone: "Phone",
    phoneHint: "We only call you if there is a problem with your order.",
    privacy: (link: React.ReactNode) => <>I have read the {link} and agree to the processing of my data to handle the order.</>,
    privacyLink: "privacy notice",
    send: "Place order",
    payAtPickup: "Pay at pickup",
    minOrder: (v: string) => `Minimum order ${v}`,
    lastOrder: "Your last order",
    call: "Call",
  },
};

type CartLine = { key: string; product: PublicProduct; qty: number; selection: Record<string, string[]>; notes: string };

export function TakeawayMenu({
  menu,
  slug,
  open,
  note,
  minOrderCents,
  phone,
}: {
  menu: PublicMenu;
  slug: string;
  open: boolean;
  note: string;
  minOrderCents: number;
  phone: string | null;
}) {
  const t = publicDict(menu.lang);
  const x = menu.lang === "it" ? TEXT.it : TEXT.en;
  const accent = menu.venue.primaryColor;
  const router = useRouter();
  const storeKey = `takeaway.${slug}`;

  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [slots, setSlots] = useState<{ time: string; left: number }[] | null>(null);
  const [f, setF] = useState({ name: "", phone: "", pickupTime: "", notes: "", privacy: false, website: "" });
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) ?? "null") as { token: string; at: number; name: string; phone: string } | null;
      if (saved && Date.now() - saved.at < 12 * 3600_000) setLast(saved.token);
      if (saved) setF((v) => ({ ...v, name: saved.name ?? "", phone: saved.phone ?? "" }));
    } catch {}
  }, [storeKey]);

  useEffect(() => {
    if (!cartOpen || !open) return;
    setSlots(null);
    takeawaySlots(slug).then((r) => (r.ok ? setSlots(r.data) : setError(r.error)));
  }, [cartOpen, open, slug]);

  const total = cart.reduce((s, l) => s + unitPrice(l.product, l.selection) * l.qty, 0);
  const count = cart.reduce((n, l) => n + l.qty, 0);

  const add = (p: PublicProduct, qty: number, selection: Record<string, string[]>, notes: string) => {
    const key = `${p.id}|${JSON.stringify(selection)}|${notes}`;
    setCart((c) => {
      const found = c.find((l) => l.key === key);
      return found ? c.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l)) : [...c, { key, product: p, qty, selection, notes }];
    });
    return true;
  };

  const flash = (text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 2500);
  };

  const submit = () =>
    start(async () => {
      setError(null);
      if (!f.pickupTime) return setError(x.pickup + ": " + t.required);
      const r = await placeTakeaway(slug, {
        ...f,
        lines: cart.map((l) => ({
          productId: l.product.id,
          qty: l.qty,
          notes: l.notes,
          modifiers: Object.entries(l.selection).map(([groupId, optionIds]) => ({ groupId, optionIds })),
        })),
      });
      if (!r.ok) return setError(r.error);
      try {
        localStorage.setItem(storeKey, JSON.stringify({ token: r.data.token, at: Date.now(), name: f.name, phone: f.phone }));
      } catch {}
      router.push(`/m/${slug}/asporto/${r.data.token}`);
    });

  const input = "h-12 w-full rounded-xl bg-white px-3 text-base ring-1 ring-slate-300 focus:outline-none focus:ring-2";

  const header = (
    <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <p className="text-lg font-bold">🛍️ {x.title}</p>
      {open ? (
        <>
          <p className="text-sm text-slate-600">{note || x.payAtPickup}</p>
          {minOrderCents > 0 && <p className="text-xs text-slate-500">{x.minOrder(formatEuro(minOrderCents))}</p>}
        </>
      ) : (
        <p className="text-sm text-slate-600">
          {x.closed}
          {phone && (
            <>
              {" "}
              <a className="font-semibold underline" href={`tel:${phone}`}>{x.call} {phone}</a>
            </>
          )}
        </p>
      )}
      {last && (
        <Link href={`/m/${slug}/asporto/${last}`} className="block rounded-xl px-3 py-2 text-sm ring-1 ring-slate-200">
          📋 {x.lastOrder} →
        </Link>
      )}
    </div>
  );

  return (
    <>
      <PublicMenuView
        menu={menu}
        slots={{
          header,
          cardAction: open
            ? (p) =>
                p.modifierGroups.some((g) => g.minSelect > 0) ? null : (
                  <button
                    onClick={() => add(p, 1, {}, "") && flash(`+1 ${p.name}`)}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-xl font-semibold text-white shadow"
                    style={{ background: accent }}
                    aria-label={`${t.add} ${p.name}`}
                  >
                    +
                  </button>
                )
            : undefined,
          productAction: open ? (p) => (p.available ? <ProductPicker p={p} t={t} accent={accent} ayce={false} onAdd={add} /> : null) : undefined,
          bottomBar:
            count > 0 ? (
              <div className="fixed inset-x-0 bottom-0 z-30 p-3">
                <button
                  onClick={() => setCartOpen(true)}
                  className="mx-auto flex w-full max-w-3xl items-center justify-between rounded-2xl px-5 py-4 font-semibold text-white shadow-xl"
                  style={{ background: accent }}
                >
                  <span>🛍️ {t.viewCart} ({count})</span>
                  <span className="tabular-nums">{formatEuro(total)}</span>
                </button>
              </div>
            ) : null,
        }}
      />

      {toast && (
        <div className="fixed inset-x-0 top-3 z-50 mx-auto w-[92%] max-w-md rounded-xl bg-emerald-600 px-4 py-3 text-center text-sm font-medium text-white shadow-lg" role="status">
          {toast}
        </div>
      )}

      {cartOpen && (
        <Sheet onClose={() => setCartOpen(false)} label={t.close}>
          <h2 className="text-lg font-bold">{t.cart}</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {cart.map((l) => {
              const opts = l.product.modifierGroups.flatMap((g) => (l.selection[g.id] ?? []).map((id) => g.options.find((o) => o.id === id)?.name)).filter(Boolean);
              return (
                <li key={l.key} className="flex items-start gap-3 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setCart((c) => c.map((y) => (y.key === l.key ? { ...y, qty: y.qty - 1 } : y)).filter((y) => y.qty > 0))} className="h-8 w-8 rounded-full bg-slate-100 font-bold" aria-label="-1">−</button>
                    <span className="w-5 text-center font-semibold tabular-nums">{l.qty}</span>
                    <button onClick={() => add(l.product, 1, l.selection, l.notes)} className="h-8 w-8 rounded-full bg-slate-100 font-bold" aria-label="+1">+</button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{l.product.name}</p>
                    {opts.length > 0 && <p className="text-xs text-slate-500">{opts.join(", ")}</p>}
                    {l.notes && <p className="text-xs italic text-slate-500">“{l.notes}”</p>}
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatEuro(unitPrice(l.product, l.selection) * l.qty)}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex items-center justify-between text-lg font-bold">
            <span>{t.total}</span>
            <span className="tabular-nums">{formatEuro(total)}</span>
          </div>
          {minOrderCents > 0 && total < minOrderCents && <p className="mt-1 text-sm text-amber-700">{x.minOrder(formatEuro(minOrderCents))}</p>}

          <form
            className="mt-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div>
              <p className="text-sm font-semibold">{x.pickup}</p>
              {slots === null ? (
                <p className="mt-2 text-sm text-slate-500">{x.loadingSlots}</p>
              ) : slots.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">{x.noSlots}</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {slots.map((s) => (
                    <button
                      key={s.time}
                      type="button"
                      onClick={() => setF({ ...f, pickupTime: s.time })}
                      className={cn("rounded-xl px-3 py-2 text-sm font-semibold ring-1 ring-slate-300")}
                      style={f.pickupTime === s.time ? { background: accent, color: "#fff", boxShadow: "none" } : undefined}
                    >
                      {s.time}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input className={input} placeholder={x.name} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required autoComplete="name" />
            <div>
              <input className={input} placeholder={x.phone} type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required autoComplete="tel" />
              <p className="mt-1 text-xs text-slate-500">{x.phoneHint}</p>
            </div>
            <textarea className="w-full rounded-xl p-3 text-base ring-1 ring-slate-300" rows={2} placeholder={t.orderNotes} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value.slice(0, 300) })} />
            <input tabIndex={-1} autoComplete="off" className="hidden" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} aria-hidden="true" />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={f.privacy} onChange={(e) => setF({ ...f, privacy: e.target.checked })} className="mt-1" style={{ accentColor: accent }} />
              <span>{x.privacy(<Link href={`/m/${slug}/privacy`} className="underline" target="_blank">{x.privacyLink}</Link>)}</span>
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              disabled={pending || !cart.length || !slots?.length || (minOrderCents > 0 && total < minOrderCents)}
              className="w-full rounded-2xl py-4 text-lg font-bold text-white disabled:opacity-50"
              style={{ background: accent }}
            >
              {pending ? t.sending : `${x.send} · ${formatEuro(total)}`}
            </button>
            <p className="text-center text-xs text-slate-500">{x.payAtPickup}</p>
          </form>
        </Sheet>
      )}
    </>
  );
}
