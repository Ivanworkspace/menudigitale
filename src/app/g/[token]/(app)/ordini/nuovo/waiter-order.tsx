"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonClass } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useAction } from "@/components/staff/use-action";
import { cn } from "@/lib/cn";
import { formatEuro } from "@/lib/format";
import { sendWaiterOrder } from "../actions";
import { enqueue, flushQueue, readQueue } from "@/components/staff/offline-queue";

type OrderPayload = { sessionId: string; input: Parameters<typeof sendWaiterOrder>[2] };

type P = { id: string; categoryId: string; name: string; priceCents: number; prices: Record<string, number>; available: boolean; ayceIncluded: boolean; groups: string[] };
type G = { id: string; name: string; kind: string; minSelect: number; maxSelect: number; options: { id: string; name: string; priceDeltaCents: number; available: boolean }[] };
type S = { id: string; label: string; covers: number; mode: string; menuId: string | null };
type Line = { key: string; p: P; qty: number; sel: Record<string, string[]>; notes: string; course: number };

const FAV_KEY = "waiter.favorites";

export function WaiterOrder(props: { token: string; basePath: string; initialSessionId: string | null; sessions: S[]; categories: { id: string; name: string; icon: string | null }[]; products: P[]; groups: G[] }) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState(props.initialSessionId ?? "");
  const session = props.sessions.find((s) => s.id === sessionId) ?? null;
  const [cat, setCat] = useState<string>("fav");
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [course, setCourse] = useState(1);
  const [notes, setNotes] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [picking, setPicking] = useState<P | null>(null);
  const [favs, setFavs] = useState<string[]>([]);
  const { pending, msg, run } = useAction();
  const groups = useMemo(() => new Map(props.groups.map((g) => [g.id, g])), [props.groups]);

  useEffect(() => {
    try {
      const f = JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]");
      setFavs(f);
      if (!f.length) setCat(props.categories[0]?.id ?? "");
    } catch {}
  }, [props.categories]);

  const toggleFav = (id: string) => {
    const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    setFavs(next);
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
    } catch {}
  };

  const price = (p: P, sel: Record<string, string[]>) => {
    let c = session?.menuId && p.prices[session.menuId] != null ? p.prices[session.menuId] : p.priceCents;
    for (const gid of p.groups) for (const oid of sel[gid] ?? []) c += groups.get(gid)?.options.find((o) => o.id === oid)?.priceDeltaCents ?? 0;
    return c;
  };

  const add = (p: P, sel: Record<string, string[]> = {}, lineNotes = "") => {
    const key = `${p.id}|${JSON.stringify(sel)}|${lineNotes}|${course}`;
    setLines((ls) => (ls.some((l) => l.key === key) ? ls.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l)) : [...ls, { key, p, qty: 1, sel, notes: lineNotes, course }]));
  };

  const needle = q.trim().toLowerCase();
  const visible = props.products.filter((p) => (needle ? p.name.toLowerCase().includes(needle) : cat === "fav" ? favs.includes(p.id) : p.categoryId === cat));
  const ayce = session?.mode === "ayce";
  const total = lines.reduce((s, l) => s + (ayce && l.p.ayceIncluded ? 0 : price(l.p, l.sel) * l.qty), 0);

  const [queued, setQueued] = useState(0);
  useEffect(() => {
    const flush = async () => {
      if (!navigator.onLine) return;
      const r = await flushQueue<OrderPayload>(`order:${props.token}`, (p) => sendWaiterOrder(props.token, p.sessionId, p.input));
      setQueued(r.remaining);
      if (r.errors.length) alert(`Alcuni ordini in coda non sono stati inviati: ${r.errors.join(", ")}`);
    };
    setQueued(readQueue<OrderPayload>().filter((q) => q.kind === `order:${props.token}`).length);
    flush();
    window.addEventListener("online", flush);
    const id = setInterval(flush, 20_000);
    return () => {
      window.removeEventListener("online", flush);
      clearInterval(id);
    };
  }, [props.token]);

  const send = () => {
    const input = {
      lines: lines.map((l) => ({ productId: l.p.id, qty: l.qty, notes: l.notes, course: l.course, modifiers: Object.entries(l.sel).map(([groupId, optionIds]) => ({ groupId, optionIds })) })),
      notes,
      urgent,
    };
    if (!navigator.onLine) {
      enqueue<OrderPayload>(`order:${props.token}`, { sessionId, input });
      setQueued((n) => n + 1);
      setLines([]);
      setNotes("");
      setUrgent(false);
      return;
    }
    return run(
      () =>
        sendWaiterOrder(props.token, sessionId, input),
      {
        success: "Ordine inviato.",
        onOk: () => {
          setLines([]);
          setNotes("");
          setUrgent(false);
          setCourse(1);
          router.refresh();
        },
      },
    );
  };

  if (!props.sessions.length) {
    return (
      <Card className="px-6 py-14 text-center">
        <p className="font-medium">Nessun tavolo aperto</p>
        <Link href={`${props.basePath}/sala`} className={cn(buttonClass(), "mt-4")}>Apri un tavolo dalla sala</Link>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Select className="w-auto text-base font-semibold" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            <option value="">— Scegli il tavolo —</option>
            {props.sessions.map((s) => (
              <option key={s.id} value={s.id}>
                Tavolo {s.label} ({s.covers} cop.){s.mode === "ayce" ? " · AYCE" : ""}
              </option>
            ))}
          </Select>
          <Input className="flex-1" placeholder="Cerca prodotto…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!needle && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setCat("fav")} className={cn("whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ring-1", cat === "fav" ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-300")}>
              ⭐ Preferiti
            </button>
            {props.categories.map((c) => (
              <button key={c.id} onClick={() => setCat(c.id)} className={cn("whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ring-1", cat === c.id ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-300")}>
                {c.icon} {c.name}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {visible.length === 0 && <p className="col-span-full py-8 text-center text-sm text-slate-500">{cat === "fav" ? "Tocca ☆ sui prodotti per aggiungerli ai preferiti." : "Nessun prodotto."}</p>}
          {visible.map((p) => (
            <div key={p.id} className={cn("relative rounded-xl bg-white shadow-sm ring-1 ring-slate-200", !p.available && "opacity-50")}>
              <button
                disabled={!p.available || !sessionId}
                onClick={() => (p.groups.length ? setPicking(p) : add(p))}
                className="flex h-24 w-full flex-col justify-between p-3 text-left active:bg-slate-50 disabled:cursor-not-allowed"
              >
                <span className="line-clamp-2 text-sm font-semibold leading-tight">{p.name}</span>
                <span className="text-xs tabular-nums text-slate-500">
                  {ayce && p.ayceIncluded ? "incluso" : formatEuro(p.priceCents)}
                  {!p.available && " · esaurito"}
                  {p.groups.length > 0 && " · opzioni"}
                </span>
              </button>
              <button onClick={() => toggleFav(p.id)} className="absolute right-1.5 top-1.5 text-sm" aria-label="Preferito">
                {favs.includes(p.id) ? "⭐" : "☆"}
              </button>
            </div>
          ))}
        </div>
      </div>

      <Card className="flex h-fit flex-col lg:sticky lg:top-4">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="font-semibold">{session ? `Tavolo ${session.label}` : "Nessun tavolo"}</p>
          <div className="flex items-center gap-1 text-sm">
            Uscita
            {[1, 2, 3].map((c) => (
              <button key={c} onClick={() => setCourse(c)} className={cn("h-8 w-8 rounded-lg font-semibold ring-1", course === c ? "bg-slate-900 text-white ring-slate-900" : "ring-slate-300")}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto">
          {lines.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">Tocca i prodotti per aggiungerli.</li>}
          {lines.map((l) => {
            const opts = l.p.groups.flatMap((gid) => (l.sel[gid] ?? []).map((oid) => groups.get(gid)?.options.find((o) => o.id === oid)?.name)).filter(Boolean);
            return (
              <li key={l.key} className="flex items-start gap-2 px-4 py-2.5">
                <div className="flex items-center gap-1">
                  <button className="h-8 w-8 rounded-lg bg-slate-100 font-bold" onClick={() => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, qty: x.qty - 1 } : x)).filter((x) => x.qty > 0))}>−</button>
                  <span className="w-6 text-center font-semibold tabular-nums">{l.qty}</span>
                  <button className="h-8 w-8 rounded-lg bg-slate-100 font-bold" onClick={() => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, qty: x.qty + 1 } : x)))}>+</button>
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{l.p.name}</p>
                  {opts.length > 0 && <p className="text-xs text-slate-500">{opts.join(", ")}</p>}
                  <input
                    value={l.notes}
                    onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, notes: e.target.value.slice(0, 200) } : x)))}
                    placeholder="nota…"
                    className="mt-1 w-full rounded border-0 bg-slate-50 px-2 py-1 text-xs"
                  />
                </div>
                <div className="text-right text-xs">
                  <p className="font-semibold tabular-nums">{ayce && l.p.ayceIncluded ? "incl." : formatEuro(price(l.p, l.sel) * l.qty)}</p>
                  {l.course > 1 && <p className="text-slate-500">uscita {l.course}</p>}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="space-y-3 border-t border-slate-100 p-4">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note per la comanda" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="accent-red-600" /> 🔥 Urgente
          </label>
          <div className="flex justify-between text-lg font-bold">
            <span>Totale</span>
            <span className="tabular-nums">{formatEuro(total)}</span>
          </div>
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
          {queued > 0 && <Alert tone="warning">{queued} ordine/i in coda: verranno inviati appena torna la connessione.</Alert>}
          <Button size="lg" className="w-full" disabled={!sessionId || !lines.length || pending} onClick={send}>
            {pending ? "Invio…" : "Invia in cucina"}
          </Button>
        </div>
      </Card>

      {picking && <OptionsModal p={picking} groups={picking.groups.map((g) => groups.get(g)!).filter(Boolean)} onClose={() => setPicking(null)} onAdd={(sel, n) => { add(picking, sel, n); setPicking(null); }} />}
    </div>
  );
}

function OptionsModal({ p, groups, onClose, onAdd }: { p: P; groups: G[]; onClose: () => void; onAdd: (sel: Record<string, string[]>, notes: string) => void }) {
  const [sel, setSel] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(groups.filter((g) => g.kind === "variant" && g.maxSelect === 1).map((g) => [g.id, [g.options.find((o) => o.available)?.id ?? ""]]).filter(([, v]) => (v as string[])[0])),
  );
  const [notes, setNotes] = useState("");
  const missing = groups.find((g) => (sel[g.id]?.length ?? 0) < g.minSelect);
  return (
    <Modal open onClose={onClose} title={p.name} footer={<><Button variant="ghost" onClick={onClose}>Annulla</Button><Button disabled={!!missing} onClick={() => onAdd(sel, notes)}>Aggiungi</Button></>}>
      <div className="space-y-4">
        {groups.map((g) => {
          const single = g.maxSelect === 1;
          const chosen = sel[g.id] ?? [];
          return (
            <div key={g.id}>
              <p className="mb-2 text-sm font-semibold">{g.name} <span className="font-normal text-slate-500">({g.minSelect ? "obbligatorio" : `max ${g.maxSelect}`})</span></p>
              <div className="flex flex-wrap gap-2">
                {g.options.map((o) => {
                  const on = chosen.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      disabled={!o.available || (!single && !on && chosen.length >= g.maxSelect)}
                      onClick={() => setSel((s) => ({ ...s, [g.id]: single ? [o.id] : on ? chosen.filter((x) => x !== o.id) : [...chosen, o.id] }))}
                      className={cn("rounded-xl px-3 py-2 text-sm ring-1 disabled:opacity-40", on ? "bg-slate-900 text-white ring-slate-900" : "ring-slate-300")}
                    >
                      {o.name}
                      {o.priceDeltaCents ? ` ${o.priceDeltaCents > 0 ? "+" : ""}${formatEuro(o.priceDeltaCents)}` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <Input placeholder="Nota (es. ben cotta)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}
