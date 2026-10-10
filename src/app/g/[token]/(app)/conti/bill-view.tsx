"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useAction } from "@/components/staff/use-action";
import { useLiveDoc } from "@/components/staff/realtime";
import { cn } from "@/lib/cn";
import { formatEuro, parseEuroToCents } from "@/lib/format";
import { cashChange, paidCents, PAYMENT_LABELS, type PaymentMethod } from "@/domain/billing";
import type { Bill } from "@/server/billing/service";
import {
  applyAdjustment,
  deleteAdjustment,
  deletePayment,
  finalizeBill,
  itemsSplit,
  pay,
  refreshBill,
  resetSplit,
  romanSplit,
  updateCharges,
  updateCovers,
  attachCustomer,
  findCustomers,
  applyPromoCode,
} from "./actions";

const eurInput = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export function BillView({
  token,
  basePath,
  initial,
  methods,
  canDiscount,
  loyalty,
  warning,
}: {
  token: string;
  basePath: string;
  initial: Bill;
  methods: PaymentMethod[];
  canDiscount: boolean;
  loyalty: boolean;
  warning: string;
}) {
  const router = useRouter();
  const live = useLiveDoc<Bill>(`bills/${initial.id}`);
  const [local, setLocal] = useState<Bill>(initial);
  const bill = live && live.updatedAt >= local.updatedAt ? live : local;
  const { pending, msg, run, setMsg } = useAction();
  const t = bill.totals;
  const paid = paidCents(bill.payments);
  const remaining = Math.max(0, t.totalCents - paid);
  const isOpen = bill.status === "open";
  const apply = (b: Bill) => setLocal(b);

  // Payment form
  const [method, setMethod] = useState<PaymentMethod>(methods[0] ?? "cash");
  const [partId, setPartId] = useState<string | null>(null);
  const partRemaining = (id: string) => {
    const p = bill.parts.find((x) => x.id === id)!;
    return Math.max(0, p.amountCents - bill.payments.filter((x) => x.partId === id).reduce((s, x) => s + x.amountCents, 0));
  };
  const due = partId ? partRemaining(partId) : remaining;
  const [amount, setAmount] = useState(eurInput(due));
  const [tendered, setTendered] = useState("");
  useEffect(() => setAmount(eurInput(due)), [due]);
  const amountCents = parseEuroToCents(amount || "0") ?? 0;
  const tenderedCents = parseEuroToCents(tendered || "0") ?? 0;
  const change = method === "cash" && tenderedCents ? cashChange(amountCents, tenderedCents).changeCents : 0;

  // Dialogs
  const [adj, setAdj] = useState<null | { kind: "discount" | "surcharge"; mode: "percent" | "amount"; value: string; reason: string }>(null);
  const [split, setSplit] = useState<null | { label: string; persons: number; sel: Record<string, number> }>(null);
  const [covers, setCovers] = useState({ c: bill.covers, ch: bill.coversChildren });

  const vatRows = useMemo(() => t.vat.filter((v) => v.grossCents !== 0), [t.vat]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`${basePath}/conti`} className="text-sm text-slate-500 hover:underline">← Tutti i tavoli</Link>
          <h1 className="text-2xl font-bold">
            Conto · Tavolo {bill.tableLabel} {bill.number ? <span className="text-slate-400">#{bill.number}</span> : null}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={pending || !isOpen} onClick={() => run(() => refreshBill(token, bill.tableSessionId), { onOk: apply })}>
            ↻ Aggiorna
          </Button>
          <a className={buttonClass("secondary")} href={`${basePath}/conti/${bill.id}/stampa`} target="_blank" rel="noreferrer">
            🖨️ Preconto
          </a>
        </div>
      </div>
      <Alert tone="warning">{warning}</Alert>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Dettaglio" />
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {bill.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="w-12 px-5 py-2 font-semibold tabular-nums">{l.qty}×</td>
                    <td className="py-2">{l.name}</td>
                    <td className="px-2 py-2 text-xs text-slate-400">IVA {l.vatRateBp / 100}%</td>
                    <td className="px-5 py-2 text-right tabular-nums">{formatEuro(l.qty * l.unitPriceCents)}</td>
                  </tr>
                ))}
                {bill.ayce && (
                  <tr>
                    <td className="px-5 py-2 font-semibold tabular-nums">{bill.ayce.adults + bill.ayce.children}×</td>
                    <td className="py-2">
                      All you can eat ({bill.ayce.adults} adulti × {formatEuro(bill.ayce.adultCents)}
                      {bill.ayce.children ? `, ${bill.ayce.children} bambini × ${formatEuro(bill.ayce.childCents)}` : ""})
                    </td>
                    <td />
                    <td className="px-5 py-2 text-right tabular-nums">{formatEuro(t.ayceCents)}</td>
                  </tr>
                )}
                {t.coverCents > 0 && (
                  <tr>
                    <td className="px-5 py-2 font-semibold tabular-nums">{bill.covers + bill.coversChildren}×</td>
                    <td className="py-2">Coperto</td>
                    <td />
                    <td className="px-5 py-2 text-right tabular-nums">{formatEuro(t.coverCents)}</td>
                  </tr>
                )}
                {t.serviceCents > 0 && (
                  <tr>
                    <td />
                    <td className="py-2">Servizio {bill.servicePctBp / 100}%</td>
                    <td />
                    <td className="px-5 py-2 text-right tabular-nums">{formatEuro(t.serviceCents)}</td>
                  </tr>
                )}
                {bill.adjustments.map((a) => (
                  <tr key={a.id} className={a.kind === "discount" ? "text-emerald-700" : "text-amber-700"}>
                    <td />
                    <td className="py-2">
                      {a.kind === "discount" ? "Sconto" : "Maggiorazione"} {a.mode === "percent" ? `${a.value / 100}%` : ""} · {a.reason}
                    </td>
                    <td>
                      {isOpen && canDiscount && (
                        <button className="text-xs text-red-600" onClick={() => run(() => deleteAdjustment(token, bill.id, a.id), { onOk: apply })}>
                          rimuovi
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums">
                      {a.kind === "discount" ? "−" : "+"}
                      {a.mode === "amount" ? formatEuro(a.value) : `${a.value / 100}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 text-lg font-bold">
                  <td />
                  <td className="py-3">Totale</td>
                  <td />
                  <td className="px-5 py-3 text-right tabular-nums">{formatEuro(t.totalCents)}</td>
                </tr>
              </tfoot>
            </table>
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              {vatRows.map((v) => (
                <span key={v.rateBp}>
                  IVA {v.rateBp / 100}%: imponibile {formatEuro(v.netCents)} · imposta {formatEuro(v.vatCents)}
                </span>
              ))}
            </div>
          </Card>

          {isOpen && (
            <div className="flex flex-wrap gap-2">
              {canDiscount && (
                <>
                  <Button variant="secondary" onClick={() => setAdj({ kind: "discount", mode: "percent", value: "10", reason: "" })}>− Sconto</Button>
                  <Button variant="secondary" onClick={() => setAdj({ kind: "surcharge", mode: "amount", value: "", reason: "" })}>+ Maggiorazione</Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const v = prompt("Servizio % (0 per toglierlo)", String(bill.servicePctBp / 100));
                      if (v === null) return;
                      const c = prompt("Coperto a persona (€)", eurInput(bill.coverChargeCents));
                      if (c === null) return;
                      run(() => updateCharges(token, bill.id, Math.round(Number(v.replace(",", ".")) * 100), parseEuroToCents(c) ?? 0), { onOk: apply });
                    }}
                  >
                    Coperto e servizio
                  </Button>
                </>
              )}
              <div className="flex items-center gap-1 rounded-lg bg-white px-2 ring-1 ring-slate-200">
                <span className="text-sm text-slate-500">Coperti</span>
                <Input className="h-9 w-14" type="number" min={0} value={covers.c} onChange={(e) => setCovers({ ...covers, c: Number(e.target.value) })} />
                <span className="text-sm text-slate-500">bimbi</span>
                <Input className="h-9 w-14" type="number" min={0} value={covers.ch} onChange={(e) => setCovers({ ...covers, ch: Number(e.target.value) })} />
                <Button size="sm" variant="ghost" onClick={() => run(() => updateCovers(token, bill.id, bill.tableSessionId, covers.c, covers.ch), { onOk: apply })}>OK</Button>
              </div>
            </div>
          )}

          {loyalty && isOpen && <CustomerBox token={token} bill={bill} onChange={apply} />}

          <Card>
            <CardHeader
              title="Divisione del conto"
              action={
                isOpen && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const n = Number(prompt("In quante parti uguali? (alla romana)", String(Math.max(2, bill.covers + bill.coversChildren))));
                        if (n) run(() => romanSplit(token, bill.id, n), { onOk: apply });
                      }}
                    >
                      Alla romana
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setSplit({ label: `Conto ${bill.parts.length + 1}`, persons: 1, sel: {} })}>
                      Per prodotti
                    </Button>
                    {bill.parts.length > 0 && (
                      <Button size="sm" variant="ghost" onClick={() => run(() => resetSplit(token, bill.id), { onOk: apply })}>
                        Annulla divisione
                      </Button>
                    )}
                  </div>
                )
              }
            />
            {bill.parts.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">Conto unico.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {bill.parts.map((p) => {
                  const rem = partRemaining(p.id);
                  return (
                    <li key={p.id} className="flex items-center justify-between px-5 py-3 text-sm">
                      <span>
                        <strong>{p.label}</strong> · {formatEuro(p.amountCents)}
                      </span>
                      {rem === 0 ? (
                        <Badge tone="green">Pagata</Badge>
                      ) : (
                        <Button size="sm" variant={partId === p.id ? "primary" : "secondary"} onClick={() => setPartId(partId === p.id ? null : p.id)}>
                          Incassa {formatEuro(rem)}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm text-slate-500">Da pagare</p>
                <p className="text-3xl font-bold tabular-nums">{formatEuro(remaining)}</p>
              </div>
              <p className="text-right text-sm text-slate-500">
                Totale {formatEuro(t.totalCents)}
                <br />
                Pagato {formatEuro(paid)}
              </p>
            </div>
            {isOpen && remaining > 0 && (
              <div className="mt-4 space-y-3">
                {partId && <Alert tone="info">Incasso della quota «{bill.parts.find((p) => p.id === partId)?.label}»</Alert>}
                <div className="grid grid-cols-3 gap-2">
                  {methods.map((m) => (
                    <button
                      key={m}
                      onClick={() => setMethod(m)}
                      className={cn("rounded-xl px-2 py-3 text-sm font-semibold ring-1", method === m ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-300")}
                    >
                      {PAYMENT_LABELS[m]}
                    </button>
                  ))}
                </div>
                <Field label="Importo (€)">
                  <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-lg font-semibold" />
                </Field>
                {method === "cash" && (
                  <>
                    <Field label="Contanti ricevuti (€)">
                      <Input inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder="es. 50,00" />
                    </Field>
                    <div className="flex flex-wrap gap-1.5">
                      {[5, 10, 20, 50, 100].map((v) => (
                        <button key={v} onClick={() => setTendered(`${v},00`)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium">
                          {v} €
                        </button>
                      ))}
                    </div>
                    {change > 0 && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-lg font-bold text-emerald-800">Resto: {formatEuro(change)}</p>}
                  </>
                )}
                <Button
                  size="lg"
                  className="w-full"
                  disabled={pending || amountCents <= 0}
                  onClick={() => {
                    if (method === "cash" && tenderedCents && tenderedCents < amountCents) return setMsg({ tone: "danger", text: "I contanti ricevuti sono meno dell'importo." });
                    run(() => pay(token, bill.id, { method, amountCents, tenderedCents: method === "cash" ? tenderedCents || null : null, partId }), {
                      onOk: (b) => {
                        apply(b);
                        setTendered("");
                        setPartId(null);
                      },
                    });
                  }}
                >
                  Registra {PAYMENT_LABELS[method]} {formatEuro(amountCents)}
                </Button>
              </div>
            )}
            {bill.payments.length > 0 && (
              <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 text-sm">
                {bill.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <span>
                      {PAYMENT_LABELS[p.method]}
                      {p.changeCents ? <span className="text-xs text-slate-500"> (resto {formatEuro(p.changeCents)})</span> : null}
                      <span className="block text-xs text-slate-400">
                        {new Date(p.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} · {p.by}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{formatEuro(p.amountCents)}</span>
                      {isOpen && canDiscount && (
                        <button className="text-xs text-red-600" onClick={() => confirm("Annullare il pagamento?") && run(() => deletePayment(token, bill.id, p.id), { onOk: apply })}>
                          ✕
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {isOpen ? (
            <Button
              size="lg"
              variant={remaining === 0 ? "primary" : "secondary"}
              className="w-full"
              disabled={pending || remaining > 0}
              onClick={() => run(() => finalizeBill(token, bill.id), { onOk: () => router.push(`${basePath}/conti`) })}
            >
              {remaining > 0 ? `Mancano ${formatEuro(remaining)}` : "✓ Chiudi conto e libera il tavolo"}
            </Button>
          ) : (
            <Alert tone="success" title={`Conto chiuso #${bill.number}`}>Il tavolo è stato liberato.</Alert>
          )}
        </div>
      </div>

      <Modal
        open={!!adj}
        onClose={() => setAdj(null)}
        title={adj?.kind === "discount" ? "Applica sconto" : "Applica maggiorazione"}
        footer={
          adj && (
            <>
              <Button variant="ghost" onClick={() => setAdj(null)}>Annulla</Button>
              <Button
                disabled={pending}
                onClick={() => {
                  const value = adj.mode === "percent" ? Math.round(Number(adj.value.replace(",", ".")) * 100) : (parseEuroToCents(adj.value) ?? 0);
                  run(() => applyAdjustment(token, bill.id, { kind: adj.kind, mode: adj.mode, value, reason: adj.reason }), {
                    onOk: (b) => {
                      apply(b);
                      setAdj(null);
                    },
                  });
                }}
              >
                Applica
              </Button>
            </>
          )
        }
      >
        {adj && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo">
              <Select value={adj.mode} onChange={(e) => setAdj({ ...adj, mode: e.target.value as "percent" | "amount" })}>
                <option value="percent">Percentuale (%)</option>
                <option value="amount">Importo (€)</option>
              </Select>
            </Field>
            <Field label={adj.mode === "percent" ? "Percentuale" : "Importo €"}>
              <Input inputMode="decimal" value={adj.value} onChange={(e) => setAdj({ ...adj, value: e.target.value })} />
            </Field>
            <Field label="Motivo (obbligatorio)" className="sm:col-span-2">
              <Input value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} placeholder="Es. cliente abituale, ritardo, asporto" />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={!!split}
        onClose={() => setSplit(null)}
        wide
        title="Conto separato per prodotti"
        footer={
          split && (
            <>
              <Button variant="ghost" onClick={() => setSplit(null)}>Annulla</Button>
              <Button disabled={pending} onClick={() => run(() => itemsSplit(token, bill.id, split.label, split.sel, split.persons), { onOk: (b) => { apply(b); setSplit(null); } })}>
                Crea quota
              </Button>
            </>
          )
        }
      >
        {split && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome"><Input value={split.label} onChange={(e) => setSplit({ ...split, label: e.target.value })} /></Field>
              <Field label="Persone (quota di coperto/AYCE)"><Input type="number" min={0} value={split.persons} onChange={(e) => setSplit({ ...split, persons: Number(e.target.value) })} /></Field>
            </div>
            <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
              {bill.lines.map((l) => {
                const q = split.sel[l.id] ?? 0;
                return (
                  <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="flex-1">{l.name}</span>
                    <span className="text-slate-500">{formatEuro(l.unitPriceCents)}</span>
                    <div className="flex items-center gap-1">
                      <button className="h-8 w-8 rounded bg-slate-100" onClick={() => setSplit({ ...split, sel: { ...split.sel, [l.id]: Math.max(0, q - 1) } })}>−</button>
                      <span className="w-12 text-center tabular-nums">{q}/{l.qty}</span>
                      <button className="h-8 w-8 rounded bg-slate-100" onClick={() => setSplit({ ...split, sel: { ...split.sel, [l.id]: Math.min(l.qty, q + 1) } })}>+</button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-slate-500">L&apos;importo include la quota proporzionale di servizio e sconti.</p>
          </div>
        )}
      </Modal>

    </div>
  );
}

function CustomerBox({ token, bill, onChange }: { token: string; bill: Bill; onChange: (b: Bill) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; phone: string | null; points: number }[]>([]);
  const [code, setCode] = useState("");
  const { pending, msg, run } = useAction();
  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(async () => {
      const r = await findCustomers(token, q);
      if (r.ok) setResults(r.data);
    }, 300);
    return () => clearTimeout(t);
  }, [q, token]);
  return (
    <Card>
      <CardHeader title="Cliente e promozioni" description="Associa un cliente per accumulare punti fedeltà" />
      <div className="space-y-4 p-5">
        {bill.customerId ? (
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span>👤 {bill.customerName}</span>
            <button className="text-xs text-red-600" onClick={() => run(() => attachCustomer(token, bill.id, null), { onOk: onChange })}>rimuovi</button>
          </div>
        ) : (
          <div className="relative">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca cliente per nome o telefono…" />
            {results.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-slate-200">
                {results.map((c) => (
                  <li key={c.id}>
                    <button className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => run(() => attachCustomer(token, bill.id, c.id), { onOk: (b) => { onChange(b); setQ(""); setResults([]); } })}>
                      <span>{c.name} <span className="text-slate-400">{c.phone}</span></span>
                      <span className="text-xs text-slate-500">{c.points} punti</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(() => applyPromoCode(token, bill.id, code), { onOk: (b) => { onChange(b); setCode(""); } }); }}>
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Codice sconto" className="font-mono" />
          <Button type="submit" variant="secondary" disabled={pending || !code.trim()}>Applica</Button>
        </form>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      </div>
    </Card>
  );
}
