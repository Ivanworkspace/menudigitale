"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Alert, Card, Stat } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useAction } from "@/components/staff/use-action";
import { RESERVATION_STATUS_LABELS, type Reservation, type ReservationStatus } from "@/domain/reservations";
import { addReservation, getSlots, setReservationStatus, updateReservation } from "./actions";

const TONE: Record<ReservationStatus, BadgeTone> = { pending: "amber", confirmed: "sky", arrived: "green", no_show: "red", cancelled: "slate" };
const shift = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

type R = Reservation & { whatsapp: string };

export function ReservationsDay({ token, date, today, reservations, tables, publicUrl, online }: { token: string; date: string; today: string; reservations: R[]; tables: { id: string; label: string }[]; publicUrl: string; online: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState<null | { name: string; phone: string; email: string; covers: number; date: string; time: string; notes: string; tableId: string; reviewConsent: boolean }>(null);
  const [slots, setSlots] = useState<{ time: string; available: number }[]>([]);
  const { pending, msg, run } = useAction();
  const active = reservations.filter((r) => r.status !== "cancelled" && r.status !== "no_show");
  const covers = active.reduce((s, r) => s + r.covers, 0);
  const label = new Date(`${date}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

  useEffect(() => {
    if (!form) return;
    getSlots(token, form.date, form.covers).then((r) => r.ok && setSlots(r.data));
  }, [form?.date, form?.covers, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = (r: R, s: ReservationStatus) => run(() => setReservationStatus(token, r.id, s), { onOk: () => router.refresh() });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link className={buttonClass("secondary", "sm")} href={`?giorno=${shift(date, -1)}`}>←</Link>
        <Link className={buttonClass(date === today ? "primary" : "secondary", "sm")} href="?">Oggi</Link>
        <Link className={buttonClass("secondary", "sm")} href={`?giorno=${shift(date, 1)}`}>→</Link>
        <input type="date" value={date} onChange={(e) => router.push(`?giorno=${e.target.value}`)} className="h-8 rounded-lg px-2 text-sm ring-1 ring-slate-300" />
        <span className="ml-2 font-semibold capitalize">{label}</span>
        <div className="ml-auto flex gap-2">
          {online && <a className={buttonClass("ghost", "sm")} href={publicUrl} target="_blank" rel="noreferrer">Pagina pubblica ↗</a>}
          <Button size="sm" onClick={() => setForm({ name: "", phone: "", email: "", covers: 2, date, time: "", notes: "", tableId: "", reviewConsent: false })}>+ Prenotazione</Button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Prenotazioni" value={active.length} />
        <Stat label="Coperti previsti" value={covers} />
        <Stat label="Da confermare" value={reservations.filter((r) => r.status === "pending").length} />
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Card className="divide-y divide-slate-100">
        {reservations.map((r) => (
          <div key={r.id} className={`flex flex-wrap items-center gap-3 px-5 py-3 ${r.status === "cancelled" || r.status === "no_show" ? "opacity-50" : ""}`}>
            <span className="w-14 text-lg font-bold tabular-nums">{r.time}</span>
            <div className="min-w-40 flex-1">
              <p className="font-medium">
                {r.name} · {r.covers} pers. <Badge tone={TONE[r.status]}>{RESERVATION_STATUS_LABELS[r.status]}</Badge> {r.source === "online" && <Badge tone="violet">Online</Badge>}
              </p>
              <p className="text-xs text-slate-500">
                <a href={`tel:${r.phone}`} className="hover:underline">{r.phone}</a>
                {r.email ? ` · ${r.email}` : ""}
                {r.notes ? ` · “${r.notes}”` : ""}
              </p>
            </div>
            <Select className="h-8 w-28 text-xs" value={r.tableId ?? ""} onChange={(e) => run(() => updateReservation(token, r.id, { tableId: e.target.value || null }), { onOk: () => router.refresh() })}>
              <option value="">Tavolo…</option>
              {tables.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
            <div className="flex flex-wrap gap-1">
              {r.status === "pending" && <Button size="sm" onClick={() => status(r, "confirmed")} disabled={pending}>Conferma</Button>}
              {(r.status === "pending" || r.status === "confirmed") && (
                <>
                  <Button size="sm" variant="secondary" onClick={() => status(r, "arrived")} disabled={pending}>Arrivati</Button>
                  <Button size="sm" variant="ghost" onClick={() => status(r, "no_show")} disabled={pending}>No-show</Button>
                  <Button size="sm" variant="ghost" onClick={() => confirm("Annullare la prenotazione?") && status(r, "cancelled")} disabled={pending}>Annulla</Button>
                </>
              )}
              <a className={buttonClass("ghost", "sm")} href={r.whatsapp} target="_blank" rel="noreferrer" title="Scrivi su WhatsApp">💬</a>
            </div>
          </div>
        ))}
        {!reservations.length && <p className="px-5 py-10 text-center text-sm text-slate-500">Nessuna prenotazione per questo giorno.</p>}
      </Card>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title="Nuova prenotazione"
        footer={
          form && (
            <>
              <Button variant="ghost" onClick={() => setForm(null)}>Annulla</Button>
              <Button disabled={pending} onClick={() => run(() => addReservation(token, { ...form, tableId: form.tableId || null }), { onOk: () => { setForm(null); router.push(`?giorno=${form.date}`); router.refresh(); } })}>
                Salva
              </Button>
            </>
          )
        }
      >
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Giorno"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Persone"><Input type="number" min={1} max={99} value={form.covers} onChange={(e) => setForm({ ...form, covers: Number(e.target.value) })} /></Field>
            <Field label="Ora" hint={slots.length ? "Orari con disponibilità; puoi anche scrivere un orario" : "Nessuna fascia disponibile: inserisci l'orario a mano"} className="sm:col-span-2">
              <div className="flex flex-wrap gap-1.5">
                {slots.map((s) => (
                  <button key={s.time} type="button" onClick={() => setForm({ ...form, time: s.time })} className={`rounded-lg px-2.5 py-1 text-sm ring-1 ${form.time === s.time ? "bg-slate-900 text-white ring-slate-900" : "ring-slate-300"}`}>
                    {s.time}
                  </button>
                ))}
                <Input type="time" className="w-28" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
              </div>
            </Field>
            <Field label="Nome"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Telefono"><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Email (per la conferma)"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Tavolo">
              <Select value={form.tableId} onChange={(e) => setForm({ ...form, tableId: e.target.value })}>
                <option value="">—</option>
                {tables.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </Select>
            </Field>
            <Field label="Note" className="sm:col-span-2"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="mt-1" checked={form.reviewConsent} onChange={(e) => setForm({ ...form, reviewConsent: e.target.checked })} />
              <span>Il cliente accetta di ricevere, dopo la visita, un invito a lasciare una recensione</span>
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
