"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatEuro } from "@/lib/format";
import { ALLERGENS, LANGUAGES, PRODUCT_TAGS, tr } from "@/domain/menu";
import { publicDict } from "@/i18n/public";
import type { PublicMenu, PublicProduct } from "@/server/menu/public";

const FILTER_KEY = "menu.excludedAllergens";

export type MenuSlots = {
  /** Extra header content (e.g. table name, waiter buttons). */
  header?: ReactNode;
  /** Action rendered inside the product sheet (e.g. "Add to order"). */
  productAction?: (p: PublicProduct) => ReactNode;
  /** Small action on each card (e.g. "+"). */
  cardAction?: (p: PublicProduct) => ReactNode;
  /** Sticky bottom area (e.g. cart bar). */
  bottomBar?: ReactNode;
  /** Shows AYCE included/extra labels. */
  ayce?: boolean;
};

function track(slug: string, type: string, productId?: string) {
  try {
    const body = JSON.stringify({ type, productId });
    if (!navigator.sendBeacon?.(`/api/public/${slug}/event`, new Blob([body], { type: "application/json" }))) {
      void fetch(`/api/public/${slug}/event`, { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } });
    }
  } catch {}
}

export function PublicMenuView({ menu, slots = {}, scanType = "menu_view" }: { menu: PublicMenu; slots?: MenuSlots; scanType?: "menu_view" | "qr_scan" }) {
  const t = publicDict(menu.lang);
  const v = menu.venue;
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [q, setQ] = useState("");
  const [excluded, setExcluded] = useState<number[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [selected, setSelected] = useState<PublicProduct | null>(null);
  const [activeCat, setActiveCat] = useState<string | null>(menu.categories[0]?.id ?? null);
  const chipsRef = useRef<HTMLDivElement>(null);

  // Anonymous aggregated analytics, once per browser session.
  useEffect(() => {
    try {
      const k = `seen.${scanType}.${v.slug}`;
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, "1");
    } catch {}
    track(v.slug, scanType);
  }, [scanType, v.slug]);
  useEffect(() => {
    if (selected) track(v.slug, "product_view", selected.id);
  }, [selected, v.slug]);

  // Allergen filter persisted per device.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTER_KEY);
      if (raw) setExcluded(JSON.parse(raw));
    } catch {}
  }, []);
  const saveFilter = (list: number[]) => {
    setExcluded(list);
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(list));
    } catch {}
  };

  // Near-realtime updates: refresh when the menu version changes.
  useEffect(() => {
    let version = menu.version;
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/api/public/${v.slug}/version`, { cache: "no-store" });
        const j = (await r.json()) as { version: string | null };
        if (j.version && j.version !== version) {
          version = j.version;
          router.refresh();
        }
      } catch {}
    }, 30_000);
    return () => clearInterval(id);
  }, [menu.version, v.slug, router]);

  const setParam = (key: string, value: string | null) => {
    const p = new URLSearchParams(search.toString());
    if (value) p.set(key, value);
    else p.delete(key);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const needle = q.trim().toLowerCase();
  const exSet = useMemo(() => new Set(excluded), [excluded]);
  const filtered = menu.products.filter(
    (p) =>
      !p.allergens.some((a) => exSet.has(a)) &&
      (!needle || p.name.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle)),
  );
  const hiddenByAllergens = menu.products.filter((p) => p.allergens.some((a) => exSet.has(a))).length;
  const specials = filtered.filter((p) => p.tags.includes("special"));

  // Scroll-spy for category chips: the last section whose top passed the sticky bar.
  useEffect(() => {
    if (needle) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-cat]"));
        let current = sections[0]?.id;
        for (const el of sections) if (el.getBoundingClientRect().top < 140) current = el.id;
        const top = menu.categories.find((c) => `cat-${c.id}` === current);
        if (top) setActiveCat(top.parentId ?? top.id);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [needle, menu.categories]);

  useEffect(() => {
    const chip = chipsRef.current?.querySelector(`[data-chip="${activeCat}"]`) as HTMLElement | null;
    chip?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeCat]);

  const jump = useCallback((id: string) => {
    const el = document.getElementById(`cat-${id}`);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 110, behavior: "smooth" });
  }, []);

  const style = {
    "--brand": v.primaryColor,
    "--accent": v.accentColor,
    "--bg": v.backgroundColor,
    background: v.backgroundColor,
    fontFamily: `'${v.fontFamily}', ui-sans-serif, system-ui, sans-serif`,
  } as CSSProperties;

  return (
    <div style={style} className="min-h-dvh pb-28 text-slate-900">
      <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(v.fontFamily)}:wght@400;500;600;700&display=swap`} />

      {/* Cover */}
      <header className="relative">
        <div
          className="h-40 bg-cover bg-center sm:h-56"
          style={{ backgroundColor: v.primaryColor, backgroundImage: v.coverUrl ? `linear-gradient(to bottom, transparent 40%, rgba(0,0,0,.35)), url(${v.coverUrl})` : undefined }}
        />
        <div className="absolute right-3 top-3">
          {menu.languages.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setLangOpen(!langOpen)}
                className="rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium shadow backdrop-blur"
                aria-label={t.language}
              >
                {LANGUAGES[menu.lang]?.flag} {menu.lang.toUpperCase()}
              </button>
              {langOpen && (
                <div className="absolute right-0 z-30 mt-2 w-44 overflow-hidden rounded-xl bg-white py-1 shadow-xl ring-1 ring-black/5">
                  {menu.languages.map((l) => (
                    <button
                      key={l}
                      onClick={() => {
                        setLangOpen(false);
                        setParam("lang", l);
                      }}
                      className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50", l === menu.lang && "font-semibold")}
                    >
                      {LANGUAGES[l]?.flag} {LANGUAGES[l]?.label ?? l}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="mx-auto max-w-3xl px-4">
          <div className="-mt-10 flex items-end gap-3">
            {v.logoUrl ? (
              <img src={v.logoUrl} alt="" className="h-20 w-20 rounded-2xl bg-white object-contain p-1 shadow-md" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl text-3xl font-bold text-white shadow-md" style={{ background: v.primaryColor }}>
                {v.name.slice(0, 1)}
              </div>
            )}
          </div>
          <h1 className="mt-3 text-2xl font-bold" style={{ color: v.primaryColor }}>
            {v.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            {v.closedNote !== null ? (
              <span className="font-medium text-red-600">{t.closedToday}{v.closedNote ? ` · ${v.closedNote}` : ""}</span>
            ) : v.hoursToday.length ? (
              <span>
                🕒 {t.openToday} {v.hoursToday.join(" · ")}
              </span>
            ) : null}
            {v.address && <span>📍 {v.address}</span>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {v.phone && (
              <a href={`tel:${v.phone.replace(/\s/g, "")}`} className="rounded-full bg-white px-3 py-1.5 text-sm font-medium shadow-sm ring-1 ring-black/5">
                📞 {t.call}
              </a>
            )}
            {v.bookingEnabled && (
              <Link href={`/m/${v.slug}/prenota`} className="rounded-full px-3 py-1.5 text-sm font-semibold text-white shadow-sm" style={{ background: v.primaryColor }}>
                📅 {t.book}
              </Link>
            )}
            {v.mapsUrl && (
              <a href={v.mapsUrl} target="_blank" rel="noopener noreferrer" className="rounded-full bg-white px-3 py-1.5 text-sm font-medium shadow-sm ring-1 ring-black/5">
                🗺️ {t.directions}
              </a>
            )}
            {Object.entries(v.socials).map(([k, url]) => (
              <a key={k} href={url} target="_blank" rel="noopener noreferrer" className="rounded-full bg-white px-3 py-1.5 text-sm font-medium capitalize shadow-sm ring-1 ring-black/5">
                {k === "website" ? "🌐 Web" : k}
              </a>
            ))}
          </div>
          {slots.header && <div className="mt-4">{slots.header}</div>}
        </div>
      </header>

      {/* Menu tabs */}
      {menu.menus.length > 1 && (
        <div className="mx-auto mt-5 max-w-3xl px-4">
          <div className="inline-flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5">
            {menu.menus.map((m) => (
              <button
                key={m.id}
                onClick={() => setParam("menu", m.id)}
                className={cn("rounded-lg px-4 py-1.5 text-sm font-medium", m.id === menu.menuId ? "text-white" : "text-slate-600")}
                style={m.id === menu.menuId ? { background: v.primaryColor } : undefined}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sticky search + categories */}
      <div className="sticky top-0 z-20 mt-4 border-b border-black/5 backdrop-blur" style={{ background: `${v.backgroundColor}ee` }}>
        <div className="mx-auto max-w-3xl px-4 pt-3">
          <div className="flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`🔍 ${t.search}`}
              className="h-11 flex-1 rounded-xl bg-white px-4 text-base shadow-sm outline-none ring-1 ring-black/10 focus:ring-2"
              style={{ ["--tw-ring-color" as string]: v.primaryColor }}
            />
            <button
              onClick={() => setFilterOpen(true)}
              className={cn("relative h-11 rounded-xl px-3 text-sm font-medium shadow-sm ring-1 ring-black/10", excluded.length ? "text-white" : "bg-white")}
              style={excluded.length ? { background: v.primaryColor } : undefined}
              aria-label={t.allergenFilter}
            >
              ⚠️ {excluded.length ? excluded.length : ""}
            </button>
          </div>
          {!needle && (
            <div ref={chipsRef} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-3">
              {menu.categories
                .filter((c) => !c.parentId)
                .map((c) => (
                  <button
                    key={c.id}
                    data-chip={c.id}
                    onClick={() => jump(c.id)}
                    className={cn("whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium shadow-sm ring-1 ring-black/5", activeCat === c.id ? "text-white" : "bg-white text-slate-700")}
                    style={activeCat === c.id ? { background: v.primaryColor } : undefined}
                  >
                    {c.icon} {c.name}
                  </button>
                ))}
            </div>
          )}
          {needle && <div className="h-3" />}
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4">
        {hiddenByAllergens > 0 && (
          <button onClick={() => setFilterOpen(true)} className="mt-4 w-full rounded-xl bg-amber-50 px-4 py-2 text-left text-sm text-amber-900 ring-1 ring-amber-200">
            ⚠️ {t.hiddenByFilter(hiddenByAllergens)}
          </button>
        )}

        {!needle && specials.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-3 text-lg font-bold">🍽️ {t.specials}</h2>
            <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
              {specials.map((p) => (
                <button key={p.id} onClick={() => setSelected(p)} className="w-56 shrink-0 overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-black/5">
                  {p.images[0] ? (
                    <img src={p.images[0].thumb} alt="" loading="lazy" className="h-32 w-full object-cover" />
                  ) : (
                    <div className="flex h-16 items-center justify-center text-2xl" style={{ background: `${v.accentColor}33` }}>🍽️</div>
                  )}
                  <div className="p-3">
                    <p className="font-semibold">{p.name}</p>
                    <p className="mt-1 text-sm font-semibold" style={{ color: v.primaryColor }}>{formatEuro(p.priceCents)}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {needle ? (
          <section className="mt-5 space-y-3">
            {filtered.length === 0 && <p className="py-10 text-center text-slate-500">{t.noResults}</p>}
            {filtered.map((p) => (
              <ProductCard key={p.id} p={p} t={t} lang={menu.lang} onOpen={() => setSelected(p)} action={slots.cardAction?.(p)} ayce={slots.ayce} accent={v.primaryColor} />
            ))}
          </section>
        ) : (
          menu.categories.map((c) => {
            const items = filtered.filter((p) => p.categoryId === c.id);
            if (!items.length && !menu.categories.some((x) => x.parentId === c.id)) return null;
            return (
              <section key={c.id} id={`cat-${c.id}`} data-cat className="scroll-mt-28 pt-7">
                <h2 className={cn("font-bold", c.parentId ? "text-base text-slate-700" : "text-xl")}>
                  {c.icon} {c.name}
                </h2>
                {c.description && <p className="mt-1 text-sm text-slate-600">{c.description}</p>}
                <div className="mt-3 space-y-3">
                  {items.map((p) => (
                    <ProductCard key={p.id} p={p} t={t} lang={menu.lang} onOpen={() => setSelected(p)} action={slots.cardAction?.(p)} ayce={slots.ayce} accent={v.primaryColor} />
                  ))}
                </div>
              </section>
            );
          })
        )}

        {/* Footer */}
        <footer className="mt-12 space-y-4 border-t border-black/10 pt-6 text-sm text-slate-600">
          {menu.products.some((p) => p.isFrozen) && <p>{menu.frozenNote || "*"}</p>}
          <details className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <summary className="cursor-pointer font-semibold text-slate-800">{t.allergens} (Reg. UE 1169/2011)</summary>
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {ALLERGENS.map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <AllergenBadge id={a.id} /> {a.icon} {tr(a.name, menu.lang, "en")}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs">{t.allergenNote}</p>
          </details>
          {v.reviewUrl && (
            <a href={v.reviewUrl} target="_blank" rel="noopener noreferrer" className="block rounded-xl px-4 py-3 text-center font-semibold text-white" style={{ background: v.accentColor }}>
              ⭐ {t.reviews}
            </a>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 text-xs text-slate-500">
            {v.hasPrivacy ? <Link href={`/m/${v.slug}/privacy`} className="underline">{t.privacy}</Link> : <span />}
            {v.showPoweredBy && <span>Powered by {v.brandName}</span>}
          </div>
        </footer>
      </main>

      {slots.bottomBar}

      {/* Product sheet */}
      {selected && (
        <Sheet onClose={() => setSelected(null)} label={t.close}>
          <ProductDetail p={selected} t={t} lang={menu.lang} accent={v.primaryColor} ayce={slots.ayce} showOptions={!slots.productAction} />
          {slots.productAction?.(selected)}
        </Sheet>
      )}

      {/* Allergen filter sheet */}
      {filterOpen && (
        <Sheet onClose={() => setFilterOpen(false)} label={t.close}>
          <h2 className="text-lg font-bold">{t.allergenFilter}</h2>
          <p className="mt-1 text-sm text-slate-600">{t.allergenFilterHint}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {ALLERGENS.map((a) => {
              const on = excluded.includes(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => saveFilter(on ? excluded.filter((x) => x !== a.id) : [...excluded, a.id])}
                  className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ring-1", on ? "bg-red-50 ring-red-300" : "bg-white ring-slate-200")}
                >
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded border", on ? "border-red-500 bg-red-500 text-white" : "border-slate-300")}>{on ? "✓" : ""}</span>
                  <span>{a.icon}</span>
                  <span>{tr(a.name, menu.lang, "en")}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-5 flex gap-2">
            <button onClick={() => saveFilter([])} className="flex-1 rounded-xl bg-slate-100 py-3 font-medium">{t.clearFilter}</button>
            <button onClick={() => setFilterOpen(false)} className="flex-1 rounded-xl py-3 font-semibold text-white" style={{ background: v.primaryColor }}>
              {t.apply}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function AllergenBadge({ id }: { id: number }) {
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1 text-[11px] font-bold tabular-nums text-amber-900">
      {id}
    </span>
  );
}

function TagIcons({ tags, lang }: { tags: PublicProduct["tags"]; lang: string }) {
  return (
    <>
      {tags
        .filter((tg) => tg !== "special")
        .map((tg) => (
          <span key={tg} title={tr(PRODUCT_TAGS[tg]?.label, lang, "en")} aria-label={tr(PRODUCT_TAGS[tg]?.label, lang, "en")}>
            {PRODUCT_TAGS[tg]?.icon}
          </span>
        ))}
    </>
  );
}

function ProductCard({
  p,
  t,
  lang,
  onOpen,
  action,
  ayce,
  accent,
}: {
  p: PublicProduct;
  t: ReturnType<typeof publicDict>;
  lang: string;
  onOpen: () => void;
  action?: ReactNode;
  ayce?: boolean;
  accent: string;
}) {
  return (
    <div className={cn("flex gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5", !p.available && "opacity-60")}>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="font-semibold leading-snug">
          {p.name}
          {p.isFrozen && <span className="text-slate-400"> *</span>}{" "}
          <span className="text-sm">
            <TagIcons tags={p.tags} lang={lang} />
          </span>
        </p>
        {p.description && <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{p.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {ayce && p.ayceIncluded ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">{t.ayceIncluded}</span>
          ) : (
            <span className="font-semibold tabular-nums" style={{ color: accent }}>
              {ayce && <span className="mr-1 text-xs font-medium text-slate-500">{t.extra}</span>}
              {formatEuro(p.priceCents)}
            </span>
          )}
          {!p.available && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">{t.soldOut}</span>}
          {p.allergens.map((a) => (
            <AllergenBadge key={a} id={a} />
          ))}
        </div>
      </button>
      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        {p.images[0] && (
          <button onClick={onOpen} aria-label={p.name}>
            <img src={p.images[0].thumb} alt="" loading="lazy" decoding="async" className={cn("h-24 w-24 rounded-xl object-cover", !p.available && "grayscale")} />
          </button>
        )}
        {p.available && action}
      </div>
    </div>
  );
}

function ProductDetail({
  p,
  t,
  lang,
  accent,
  ayce,
  showOptions,
}: {
  p: PublicProduct;
  t: ReturnType<typeof publicDict>;
  lang: string;
  accent: string;
  ayce?: boolean;
  showOptions?: boolean;
}) {
  return (
    <div>
      {p.images.length > 0 && (
        <div className="no-scrollbar -mx-5 -mt-5 mb-4 flex snap-x snap-mandatory overflow-x-auto">
          {p.images.map((img) => (
            <img key={img.full} src={img.full} alt="" className="aspect-[4/3] w-full shrink-0 snap-center object-cover" />
          ))}
        </div>
      )}
      <h2 className="text-xl font-bold">
        {p.name}
        {p.isFrozen && <span className="text-slate-400"> *</span>}
      </h2>
      <p className="mt-1 text-lg font-semibold" style={{ color: accent }}>
        {ayce && p.ayceIncluded ? t.ayceIncluded : formatEuro(p.priceCents)}
      </p>
      {!p.available && <p className="mt-1 font-semibold text-red-600">{t.soldOut}</p>}
      {p.description && <p className="mt-3 whitespace-pre-line text-slate-700">{p.description}</p>}
      {p.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {p.tags.map((tg) => (
            <span key={tg} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium">
              {PRODUCT_TAGS[tg]?.icon} {tr(PRODUCT_TAGS[tg]?.label, lang, "en")}
            </span>
          ))}
        </div>
      )}
      {showOptions &&
        p.modifierGroups.map((g) => (
          <div key={g.id} className="mt-4">
            <p className="text-sm font-semibold">
              {g.name}{" "}
              <span className="font-normal text-slate-500">
                ({g.minSelect > 0 ? t.required : t.chooseUpTo(g.maxSelect)})
              </span>
            </p>
            <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
              {g.options.map((o) => (
                <li key={o.id} className={cn("flex justify-between", !o.available && "text-slate-400 line-through")}>
                  <span>{o.name}</span>
                  {o.priceDeltaCents !== 0 && <span className="tabular-nums">{o.priceDeltaCents > 0 ? "+" : ""}{formatEuro(o.priceDeltaCents)}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      {p.allergens.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold">{t.allergens}</p>
          <ul className="mt-1.5 space-y-1 text-sm">
            {p.allergens.map((id) => {
              const a = ALLERGENS.find((x) => x.id === id);
              return (
                <li key={id} className="flex items-center gap-2">
                  <AllergenBadge id={id} /> {a?.icon} {tr(a?.name, lang, "en")}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Sheet({ onClose, label, children }: { onClose: () => void; label: string; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose} role="dialog" aria-modal="true">
      <div className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 pb-8 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-3 top-3 z-10 rounded-full bg-white/90 px-2.5 py-1 text-sm shadow" aria-label={label}>
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
