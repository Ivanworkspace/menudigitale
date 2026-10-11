"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { where } from "firebase/firestore";
import { Button, buttonClass } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { useAction } from "@/components/staff/use-action";
import { useLiveCollection } from "@/components/staff/realtime";
import { cn } from "@/lib/cn";
import { formatEuro } from "@/lib/format";
import { tr } from "@/domain/menu";
import {
  ITEM_STATUS_LABELS,
  TABLE_STATUS_LABELS,
  orderProgress,
  type Order,
  type Room,
  type ServiceRequest,
  type Table,
  type TableSession,
  type TableStatus,
} from "@/domain/orders";
import {
  addTable,
  cleanTable,
  closeTable,
  editSession,
  joinTables,
  moveTable,
  openTable,
  regenerateTableQr,
  removeTable,
  resolveRequest,
  saveLayout,
  saveRoom,
  separateTable,
  updateTable,
  deleteRoom,
} from "./actions";
import { approve, cancelOrderItem, nextCourse } from "../ordini/actions";

const STATUS_STYLE: Record<TableStatus, string> = {
  free: "bg-emerald-50 ring-emerald-300 text-emerald-900",
  occupied: "bg-sky-100 ring-sky-400 text-sky-950",
  pending: "bg-amber-100 ring-amber-400 text-amber-950 animate-pulse",
  bill_requested: "bg-violet-100 ring-violet-400 text-violet-950",
  to_clean: "bg-slate-200 ring-slate-400 text-slate-700",
  reserved: "bg-pink-100 ring-pink-300 text-pink-900",
};

type Waiter = { id: string; name: string };

export function FloorPlan(props: {
  token: string;
  basePath: string;
  appUrl: string;
  slug: string;
  initialRooms: Room[];
  initialTables: Table[];
  waiters: Waiter[];
  canEditLayout: boolean;
  canOrder: boolean;
  canBill: boolean;
  me: string;
}) {
  const { token, basePath } = props;
  const { data: rooms } = useLiveCollection<Room>("rooms", [], "", props.initialRooms);
  const { data: tables } = useLiveCollection<Table>("tables", [], "", props.initialTables);
  const { data: sessions } = useLiveCollection<TableSession>("table_sessions", [where("status", "in", ["open", "bill_requested"])], "open");
  const { data: requests } = useLiveCollection<ServiceRequest>("service_requests", [where("status", "==", "open")], "open");

  const sortedRooms = useMemo(() => [...rooms].sort((a, b) => a.sort - b.sort), [rooms]);
  const [roomId, setRoomId] = useState<string | null>(props.initialRooms[0]?.id ?? null);
  const room = roomId ?? sortedRooms[0]?.id ?? null;
  const [edit, setEdit] = useState(false);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tableForm, setTableForm] = useState<null | { id?: string; label: string; seats: number; shape: Table["shape"] }>(null);
  const { pending, msg, run, setMsg } = useAction();

  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const roomTables = tables.filter((t) => t.roomId === room && t.active);
  const selected = tables.find((t) => t.id === selectedId) ?? null;
  const selectedSession = selected?.currentSessionId ? sessionById.get(selected.currentSessionId) ?? null : null;

  // --- drag & drop in edit mode -------------------------------------------
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);
  const pos = (t: Table) => positions[t.id] ?? { x: t.x, y: t.y };

  // Edit mode: drag a table to move it; a tap without movement opens its form.
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>, t: Table) => {
    if (!edit) return;
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const p = pos(t);
    drag.current = { id: t.id, dx: e.clientX - rect.left - p.x, dy: e.clientY - rect.top - p.y, sx: e.clientX, sy: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
    d.moved = true;
    const rect = canvasRef.current!.getBoundingClientRect();
    const snap = (v: number) => Math.round(v / 10) * 10;
    setPositions((p) => ({
      ...p,
      [d.id]: { x: Math.max(0, snap(e.clientX - rect.left - d.dx)), y: Math.max(0, snap(e.clientY - rect.top - d.dy)) },
    }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) {
      const t = tables.find((x) => x.id === d.id);
      if (t) setTableForm({ id: t.id, label: t.label, seats: t.seats, shape: t.shape });
    }
    if (e.currentTarget instanceof HTMLElement && e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const dirty = Object.keys(positions).length > 0;

  const height = Math.max(520, ...roomTables.map((t) => pos(t).y + t.h + 40));
  const width = Math.max(900, ...roomTables.map((t) => pos(t).x + t.w + 40));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sala e tavoli</h1>
          <p className="text-sm text-slate-500">Tocca un tavolo per aprirlo, ordinare, spostarlo o chiuderlo.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className={buttonClass("secondary", "sm")} href={`${basePath}/sala/qr?all=1`}>QR di tutti i tavoli (PDF)</a>
          {props.canEditLayout &&
            (edit ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => setTableForm({ label: "", seats: 4, shape: "square" })} disabled={!room}>
                  + Tavolo
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (dirty && !confirm("Annullare gli spostamenti non salvati?")) return;
                    setPositions({});
                    setEdit(false);
                  }}
                >
                  Annulla
                </Button>
                <Button
                  size="sm"
                  disabled={pending || !dirty}
                  onClick={() =>
                    run(() => saveLayout(token, Object.entries(positions).map(([id, p]) => ({ id, ...p }))), {
                      success: "Disposizione salvata.",
                      onOk: () => {
                        setEdit(false);
                        setPositions({});
                      },
                    })
                  }
                >
                  Salva disposizione
                </Button>
              </>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setEdit(true)}>
                Modifica sala
              </Button>
            ))}
        </div>
      </div>

      {requests.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {requests
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            .map((r) => (
              <div key={r.id} className={cn("flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium ring-1", r.type === "call_waiter" ? "bg-amber-50 ring-amber-300" : "bg-violet-50 ring-violet-300")}>
                <span>
                  {r.type === "call_waiter" ? "🙋" : "🧾"} Tavolo {r.tableLabel} · {r.type === "call_waiter" ? "chiama" : "chiede il conto"} ·{" "}
                  {new Date(r.createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <button className="rounded-lg bg-white px-2 py-1 text-xs ring-1 ring-slate-300" onClick={() => run(() => resolveRequest(token, r.id))}>
                  Fatto
                </button>
              </div>
            ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {sortedRooms.map((r) => (
          <button
            key={r.id}
            onClick={() => setRoomId(r.id)}
            className={cn("rounded-full px-4 py-1.5 text-sm font-medium ring-1", r.id === room ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-300")}
          >
            {r.name} <span className="opacity-60">{tables.filter((t) => t.roomId === r.id && t.currentSessionId).length}/{tables.filter((t) => t.roomId === r.id).length}</span>
          </button>
        ))}
        {props.canEditLayout && edit && (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const name = prompt("Nome della nuova sala (es. Terrazza)");
                if (name) run(() => saveRoom(token, { name }), { onOk: (r) => setRoomId(r.id) });
              }}
            >
              + Sala
            </Button>
            {room && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const name = prompt("Nuovo nome", rooms.find((r) => r.id === room)?.name);
                    if (name) run(() => saveRoom(token, { id: room, name }));
                  }}
                >
                  Rinomina
                </Button>
                <Button size="sm" variant="ghost" onClick={() => confirm("Eliminare la sala?") && run(() => deleteRoom(token, room), { onOk: () => setRoomId(null) })}>
                  Elimina sala
                </Button>
              </>
            )}
          </>
        )}
      </div>

      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {edit && (
        <Alert tone="info" title="Modifica della sala">
          Trascina i tavoli per spostarli · tocca un tavolo per cambiarne nome, posti, forma o eliminarlo · «+ Tavolo» per aggiungerne uno · poi
          «Salva disposizione».
        </Alert>
      )}

      {sortedRooms.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <p className="font-medium">Nessuna sala configurata</p>
          {props.canEditLayout ? (
            <Button className="mt-4" onClick={() => run(() => saveRoom(token, { name: "Sala principale" }), { onOk: (r) => { setRoomId(r.id); setEdit(true); } })}>
              Crea la prima sala
            </Button>
          ) : (
            <p className="mt-1 text-sm text-slate-500">Chiedi al titolare di configurare sale e tavoli.</p>
          )}
        </Card>
      ) : (
        <div className="overflow-auto rounded-2xl bg-[radial-gradient(circle,#e2e8f0_1px,transparent_1px)] bg-[length:20px_20px] ring-1 ring-slate-200">
          <div ref={canvasRef} className={cn("relative select-none", edit && "outline-dashed outline-2 outline-offset-[-8px] outline-sky-300")} style={{ width, height }} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            {roomTables.map((t) => {
              const p = pos(t);
              const s = t.currentSessionId ? sessionById.get(t.currentSessionId) : null;
              const req = requests.filter((r) => s && r.tableSessionId === s.id);
              return (
                <button
                  key={t.id}
                  onPointerDown={(e) => onPointerDown(e, t)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onClick={() => !edit && setSelectedId(t.id)}
                  className={cn(
                    "absolute flex flex-col items-center justify-center p-1 text-center shadow-sm ring-2 transition-shadow",
                    STATUS_STYLE[t.status] ?? STATUS_STYLE.free,
                    t.shape === "round" ? "rounded-full" : "rounded-2xl",
                    edit ? "cursor-move touch-none" : "hover:shadow-md",
                    selectedId === t.id && "outline outline-2 outline-offset-2 outline-slate-900",
                  )}
                  style={{ left: p.x, top: p.y, width: t.w, height: t.h }}
                >
                  <span className="text-lg font-bold leading-none">{t.label}</span>
                  <span className="mt-1 text-[11px] leading-tight">
                    {s ? `${s.covers + s.coversChildren} cop.` : `${t.seats} posti`}
                    {t.mergedInto && " · unito"}
                  </span>
                  {s && <span className="text-[11px] font-semibold tabular-nums">{formatEuro(s.totalCents)}</span>}
                  {req.length > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-xs text-white">{req.length}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        {(Object.keys(TABLE_STATUS_LABELS) as TableStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn("inline-block h-3 w-3 rounded ring-2", STATUS_STYLE[s].replace("animate-pulse", ""))} /> {TABLE_STATUS_LABELS[s]}
          </span>
        ))}
      </div>

      {selected && !edit && (
        <TablePanel
          {...props}
          table={selected}
          session={selectedSession}
          tables={tables}
          onClose={() => setSelectedId(null)}
          setMsg={setMsg}
        />
      )}

      <Modal
        open={!!tableForm}
        onClose={() => setTableForm(null)}
        title={tableForm?.id ? "Modifica tavolo" : "Nuovo tavolo"}
        footer={
          tableForm && (
            <>
              {tableForm.id && (
                <Button
                  variant="danger"
                  size="sm"
                  className="mr-auto"
                  onClick={() => confirm("Eliminare il tavolo?") && run(() => removeTable(token, tableForm.id!), { onOk: () => setTableForm(null) })}
                >
                  Elimina
                </Button>
              )}
              <Button variant="ghost" onClick={() => setTableForm(null)}>Annulla</Button>
              <Button
                disabled={pending}
                onClick={() => {
                  const v = { roomId: room!, label: tableForm.label, seats: Number(tableForm.seats), shape: tableForm.shape };
                  if (tableForm.id) run(() => updateTable(token, tableForm.id!, v), { onOk: () => setTableForm(null) });
                  else run(() => addTable(token, v), { onOk: () => setTableForm(null) });
                }}
              >
                Salva
              </Button>
            </>
          )
        }
      >
        {tableForm && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Nome / numero">
              <Input value={tableForm.label} maxLength={12} onChange={(e) => setTableForm({ ...tableForm, label: e.target.value })} autoFocus />
            </Field>
            <Field label="Posti">
              <Input type="number" min={1} max={40} value={tableForm.seats} onChange={(e) => setTableForm({ ...tableForm, seats: Number(e.target.value) })} />
            </Field>
            <Field label="Forma">
              <Select value={tableForm.shape} onChange={(e) => setTableForm({ ...tableForm, shape: e.target.value as Table["shape"] })}>
                <option value="square">Quadrato</option>
                <option value="round">Rotondo</option>
                <option value="rect">Rettangolare</option>
              </Select>
            </Field>
            <p className="text-xs text-slate-500 sm:col-span-3">Il nuovo tavolo compare in un punto libero della sala: poi trascinalo dove vuoi.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function TablePanel(props: {
  token: string;
  basePath: string;
  appUrl: string;
  slug: string;
  table: Table;
  session: TableSession | null;
  tables: Table[];
  waiters: Waiter[];
  canOrder: boolean;
  canBill: boolean;
  me: string;
  onClose: () => void;
  setMsg: (m: { tone: "success" | "danger"; text: string } | null) => void;
}) {
  const { token, table, session, basePath } = props;
  const { pending, msg, run } = useAction();
  const [covers, setCovers] = useState(2);
  const [children, setChildren] = useState(0);
  const [waiterId, setWaiterId] = useState<string>(props.waiters.some((w) => w.id === props.me) ? props.me : "");
  const [target, setTarget] = useState<{ kind: "move" | "merge"; tableId: string } | null>(null);
  const [cancelItem, setCancelItem] = useState<{ orderId: string; itemId: string; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const { data: orders } = useLiveCollection<Order>(session ? "orders" : "", session ? [where("tableSessionId", "==", session.id)] : [], session?.id ?? "none");
  const sessionOrders = session ? orders.filter((o) => o.tableSessionId === session.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : [];
  const freeTables = props.tables.filter((t) => t.active && !t.currentSessionId && t.id !== table.id);
  const mergeable = props.tables.filter((t) => t.active && t.id !== table.id && !session?.tableIds.includes(t.id) && !t.mergedInto);
  const hasHeld = sessionOrders.some((o) => o.items.some((i) => i.status === "held"));

  return (
    <Modal open onClose={props.onClose} wide title={`Tavolo ${session?.tableLabel ?? table.label} · ${TABLE_STATUS_LABELS[table.status]}`}>
      <div className="space-y-5">
        {!session ? (
          <>
            {table.status === "to_clean" && (
              <Alert tone="info">
                Tavolo da pulire.{" "}
                <button className="font-semibold underline" onClick={() => run(() => cleanTable(token, table.id))}>
                  Segna come pulito
                </button>
              </Alert>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Coperti adulti">
                <Input type="number" min={0} max={99} value={covers} onChange={(e) => setCovers(Number(e.target.value))} />
              </Field>
              <Field label="Bambini">
                <Input type="number" min={0} max={99} value={children} onChange={(e) => setChildren(Number(e.target.value))} />
              </Field>
              <Field label="Cameriere">
                <Select value={waiterId} onChange={(e) => setWaiterId(e.target.value)}>
                  <option value="">—</option>
                  {props.waiters.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button size="lg" className="w-full" disabled={pending} onClick={() => run(() => openTable(token, table.id, { covers, coversChildren: children, waiterId: waiterId || null }))}>
              Apri tavolo
            </Button>
            <QrBox {...props} />
          </>
        ) : (
          <>
            <div className="grid gap-3 text-sm sm:grid-cols-4">
              <Info label="Aperto alle" value={new Date(session.openedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} />
              <Info label="Coperti" value={`${session.covers}${session.coversChildren ? ` + ${session.coversChildren} bimbi` : ""}`} />
              <Info label="Cameriere" value={session.waiterName ?? "—"} />
              <Info label="Totale" value={formatEuro(session.totalCents)} />
              {session.accessCode && <Info label="Codice tavolo" value={session.accessCode} mono />}
              <Info label="Modalità" value={session.mode === "ayce" ? `AYCE · giro ${session.ayce?.rounds ?? 0}` : session.mode === "table_orders" ? "Ordini" : "Statico"} />
              <Info label="Uscita attuale" value={String(session.currentCourse)} />
            </div>

            <div className="flex flex-wrap gap-2">
              {props.canOrder && (
                <Link href={`${basePath}/ordini/nuovo?sessione=${session.id}`} className={buttonClass("primary")}>
                  + Ordina
                </Link>
              )}
              {hasHeld && (
                <Button variant="secondary" disabled={pending} onClick={() => run(() => nextCourse(token, session.id), { success: "Uscita successiva inviata." })}>
                  ▶ Segue
                </Button>
              )}
              {props.canBill && (
                <Link href={`${basePath}/conti?sessione=${session.id}`} className={buttonClass("secondary")}>
                  🧾 Conto
                </Link>
              )}
              <Button variant="secondary" onClick={() => setTarget({ kind: "move", tableId: freeTables[0]?.id ?? "" })}>Sposta</Button>
              <Button variant="secondary" onClick={() => setTarget({ kind: "merge", tableId: mergeable[0]?.id ?? "" })}>Unisci</Button>
              {session.tableIds.length > 1 &&
                session.tableIds
                  .filter((id) => id !== session.tableId)
                  .map((id) => (
                    <Button key={id} variant="ghost" onClick={() => run(() => separateTable(token, session.id, id))}>
                      Separa {props.tables.find((t) => t.id === id)?.label}
                    </Button>
                  ))}
              <Button
                variant="danger"
                disabled={pending}
                onClick={() => confirm(`Chiudere il tavolo ${session.tableLabel}?`) && run(() => closeTable(token, session.id), { onOk: props.onClose })}
              >
                Chiudi tavolo
              </Button>
            </div>

            {target && (
              <div className="flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3">
                <Field label={target.kind === "move" ? "Sposta sul tavolo libero" : "Unisci con il tavolo"}>
                  <Select value={target.tableId} onChange={(e) => setTarget({ ...target, tableId: e.target.value })}>
                    {(target.kind === "move" ? freeTables : mergeable).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                        {t.currentSessionId ? " (occupato: ordini uniti)" : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button
                  disabled={!target.tableId || pending}
                  onClick={() =>
                    run(() => (target.kind === "move" ? moveTable(token, session.id, target.tableId) : joinTables(token, session.id, target.tableId)), {
                      onOk: () => {
                        setTarget(null);
                        if (target.kind === "move") props.onClose();
                      },
                    })
                  }
                >
                  Conferma
                </Button>
                <Button variant="ghost" onClick={() => setTarget(null)}>Annulla</Button>
              </div>
            )}

            <details className="rounded-xl ring-1 ring-slate-200">
              <summary className="cursor-pointer px-4 py-2 text-sm font-medium">Modifica coperti e cameriere</summary>
              <EditSession token={token} session={session} waiters={props.waiters} />
            </details>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Ordini</h3>
              {sessionOrders.length === 0 && <p className="text-sm text-slate-500">Nessun ordine.</p>}
              {sessionOrders.map((o) => (
                <Card key={o.id} className={cn("p-3", o.status === "pending_approval" && "ring-2 ring-amber-400")}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span>
                      {new Date(o.createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} · {o.source === "qr" ? "📱 QR" : `👤 ${o.createdByName ?? ""}`}
                      {o.round ? ` · giro ${o.round}` : ""}
                    </span>
                    <span className="flex items-center gap-2">
                      {o.status === "pending_approval" ? (
                        <>
                          <Badge tone="amber">{o.approvalReason === "geo" ? "Fuori area: verifica" : "Da confermare"}</Badge>
                          <Button size="sm" onClick={() => run(() => approve(token, o.id, true))}>Conferma</Button>
                          <Button size="sm" variant="ghost" onClick={() => run(() => approve(token, o.id, false))}>Rifiuta</Button>
                        </>
                      ) : (
                        <Badge tone={o.status === "sent" ? "sky" : "red"}>{o.status === "sent" ? orderProgress(o) : "Rifiutato"}</Badge>
                      )}
                    </span>
                  </div>
                  <ul className="mt-2 divide-y divide-slate-100 text-sm">
                    {o.items.map((i) => (
                      <li key={i.id} className={cn("flex items-center gap-2 py-1.5", i.status === "cancelled" && "text-slate-400 line-through")}>
                        <span className="w-8 font-semibold tabular-nums">{i.qty}×</span>
                        <span className="flex-1">
                          {tr(i.name, "it")}
                          {i.modifiers.length > 0 && <span className="text-xs text-slate-500"> · {i.modifiers.map((m) => tr(m.name, "it")).join(", ")}</span>}
                          {i.notes && <span className="text-xs italic text-slate-500"> “{i.notes}”</span>}
                          {i.course > 1 && <span className="ml-1 text-xs text-slate-500">(uscita {i.course})</span>}
                        </span>
                        <span className="text-xs text-slate-500">{ITEM_STATUS_LABELS[i.status]}</span>
                        <span className="w-16 text-right tabular-nums">{i.ayceIncluded && session.mode === "ayce" ? "incl." : formatEuro(i.qty * i.unitPriceCents)}</span>
                        {i.status !== "cancelled" && (
                          <button className="text-xs text-red-600 hover:underline" onClick={() => setCancelItem({ orderId: o.id, itemId: i.id, name: tr(i.name, "it") })}>
                            Annulla
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {o.notes && <p className="mt-1 text-xs italic text-slate-600">Note: {o.notes}</p>}
                </Card>
              ))}
            </div>
            <QrBox {...props} />
          </>
        )}
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      </div>

      <Modal
        open={!!cancelItem}
        onClose={() => setCancelItem(null)}
        title={`Annulla: ${cancelItem?.name ?? ""}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelItem(null)}>Indietro</Button>
            <Button
              variant="danger"
              disabled={reason.trim().length < 3 || pending}
              onClick={() =>
                run(() => cancelOrderItem(token, cancelItem!.orderId, cancelItem!.itemId, reason), {
                  onOk: () => {
                    setCancelItem(null);
                    setReason("");
                  },
                })
              }
            >
              Annulla prodotto
            </Button>
          </>
        }
      >
        <Field label="Motivo (obbligatorio)">
          <Select value={["Errore di inserimento", "Cliente ha cambiato idea", "Prodotto esaurito", "Ritardo eccessivo"].includes(reason) ? reason : ""} onChange={(e) => setReason(e.target.value)}>
            <option value="">— Scegli o scrivi sotto —</option>
            <option>Errore di inserimento</option>
            <option>Cliente ha cambiato idea</option>
            <option>Prodotto esaurito</option>
            <option>Ritardo eccessivo</option>
          </Select>
        </Field>
        <Input className="mt-2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Altro motivo…" />
      </Modal>
    </Modal>
  );
}

function EditSession({ token, session, waiters }: { token: string; session: TableSession; waiters: Waiter[] }) {
  const [c, setC] = useState(session.covers);
  const [ch, setCh] = useState(session.coversChildren);
  const [w, setW] = useState(session.waiterId ?? "");
  const { pending, msg, run } = useAction();
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-4 sm:items-end">
      <Field label="Adulti"><Input type="number" min={0} value={c} onChange={(e) => setC(Number(e.target.value))} /></Field>
      <Field label="Bambini"><Input type="number" min={0} value={ch} onChange={(e) => setCh(Number(e.target.value))} /></Field>
      <Field label="Cameriere">
        <Select value={w} onChange={(e) => setW(e.target.value)}>
          <option value="">—</option>
          {waiters.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
      </Field>
      <Button disabled={pending} onClick={() => run(() => editSession(token, session.id, { covers: c, coversChildren: ch, waiterId: w || null }), { success: "Aggiornato." })}>
        Salva
      </Button>
      {msg && <div className="sm:col-span-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
    </div>
  );
}

function QrBox({ token, table, basePath, appUrl, slug }: { token: string; table: Table; basePath: string; appUrl: string; slug: string }) {
  const { pending, msg, run } = useAction();
  const url = `${appUrl}/m/${slug}/t/${table.qrToken}`;
  return (
    <details className="rounded-xl ring-1 ring-slate-200">
      <summary className="cursor-pointer px-4 py-2 text-sm font-medium">QR del tavolo</summary>
      <div className="space-y-3 p-4 text-sm">
        <p className="break-all text-xs text-slate-500">{url}</p>
        <div className="flex flex-wrap gap-2">
          <a className={buttonClass("secondary", "sm")} href={`${basePath}/sala/qr?table=${table.id}&layout=tent`}>Segnaposto PDF</a>
          <a className={buttonClass("secondary", "sm")} href={`${basePath}/sala/qr?table=${table.id}&layout=sticker`}>Adesivo PDF</a>
          <a className={buttonClass("ghost", "sm")} href={url} target="_blank" rel="noreferrer">Apri come cliente ↗</a>
          <Button
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() => confirm("Il vecchio QR smetterà di funzionare: dovrai stamparne uno nuovo. Continuare?") && run(() => regenerateTableQr(token, table.id), { success: "QR rigenerato." })}
          >
            Rigenera QR
          </Button>
        </div>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      </div>
    </details>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn("font-semibold", mono && "font-mono text-lg tracking-widest")}>{value}</p>
    </div>
  );
}
