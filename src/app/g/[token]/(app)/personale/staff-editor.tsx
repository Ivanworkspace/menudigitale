"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useAction } from "@/components/staff/use-action";
import { formatRelative } from "@/lib/format";
import { PERMISSIONS, ROLE_LABELS, STAFF_ROLES, type StaffRole } from "@/domain/permissions";
import type { StaffMember } from "@/server/db/types";
import { savePermissions, saveStaff } from "./actions";

type Draft = { id?: string; displayName: string; role: StaffRole; color: string; active: boolean; pin: string };
const COLORS = ["#0891b2", "#db2777", "#7c3aed", "#16a34a", "#ea580c", "#ca8a04", "#2563eb", "#dc2626", "#475569"];

export function StaffEditor({ token, staff, maxStaff, isOwner, permissions }: { token: string; staff: StaffMember[]; maxStaff: number | null; isOwner: boolean; permissions: Record<string, string[]> }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [role, setRole] = useState<StaffRole>("waiter");
  const [perm, setPerm] = useState<Record<string, string[]>>(permissions);
  const modal = useAction();
  const p = useAction();
  const active = staff.filter((s) => s.active).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Personale"
        description={`${active} utenti attivi${maxStaff != null ? ` su ${maxStaff} del piano` : ""}`}
        action={<Button onClick={() => setDraft({ displayName: "", role: "waiter", color: COLORS[staff.length % COLORS.length], active: true, pin: "" })}>+ Nuovo utente</Button>}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {staff.map((s) => (
          <Card key={s.id} className={`flex items-center gap-3 p-4 ${s.active ? "" : "opacity-60"}`}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white" style={{ background: s.color }}>
              {s.displayName.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {s.displayName} {!s.active && <Badge tone="red">Disattivo</Badge>}
              </p>
              <p className="text-xs text-slate-500">
                {ROLE_LABELS[s.role]} · ultimo accesso {formatRelative(s.lastLoginAt)}
              </p>
            </div>
            {(s.role !== "owner" || isOwner) && (
              <Button size="sm" variant="ghost" onClick={() => setDraft({ id: s.id, displayName: s.displayName, role: s.role, color: s.color, active: s.active, pin: "" })}>
                Modifica
              </Button>
            )}
          </Card>
        ))}
      </div>

      {isOwner && (
        <Card>
          <CardHeader title="Permessi per ruolo" description="Personalizza cosa può fare ogni ruolo. Il titolare ha sempre tutti i permessi." />
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2">
              {STAFF_ROLES.filter((r) => r !== "owner").map((r) => (
                <button key={r} onClick={() => setRole(r)} className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${role === r ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-300"}`}>
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(PERMISSIONS).map(([k, label]) => (
                <Checkbox
                  key={k}
                  label={label}
                  checked={perm[role]?.includes(k) ?? false}
                  onChange={(e) => setPerm({ ...perm, [role]: e.target.checked ? [...(perm[role] ?? []), k] : (perm[role] ?? []).filter((x) => x !== k) })}
                />
              ))}
            </div>
            {p.msg && <Alert tone={p.msg.tone}>{p.msg.text}</Alert>}
            <Button disabled={p.pending} onClick={() => p.run(() => savePermissions(token, role, perm[role] ?? []), { success: `Permessi di «${ROLE_LABELS[role]}» salvati.` })}>
              Salva permessi
            </Button>
          </div>
        </Card>
      )}

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Modifica utente" : "Nuovo utente"}
        footer={
          draft && (
            <>
              <Button variant="ghost" onClick={() => setDraft(null)}>Annulla</Button>
              <Button disabled={modal.pending} onClick={() => modal.run(() => saveStaff(token, { ...draft, pin: draft.pin || undefined }), { onOk: () => { setDraft(null); router.refresh(); } })}>
                Salva
              </Button>
            </>
          )
        }
      >
        {draft && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome"><Input value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} autoFocus /></Field>
              <Field label="Ruolo">
                <Select value={draft.role} disabled={draft.role === "owner"} onChange={(e) => setDraft({ ...draft, role: e.target.value as StaffRole })}>
                  {STAFF_ROLES.filter((r) => r !== "owner" || draft.role === "owner").map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </Select>
              </Field>
              <Field label={draft.id ? "Nuovo PIN (lascia vuoto per non cambiarlo)" : "PIN (4–8 cifre)"}>
                <Input inputMode="numeric" maxLength={8} value={draft.pin} onChange={(e) => setDraft({ ...draft, pin: e.target.value.replace(/\D/g, "") })} className="font-mono tracking-widest" />
              </Field>
              <Field label="Colore">
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setDraft({ ...draft, color: c })} className={`h-7 w-7 rounded-full ${draft.color === c ? "ring-2 ring-slate-900 ring-offset-2" : ""}`} style={{ background: c }} aria-label={c} />
                  ))}
                </div>
              </Field>
            </div>
            {draft.role !== "owner" && <Checkbox label="Attivo" description="Gli utenti disattivati non possono accedere" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />}
            {modal.msg && <Alert tone={modal.msg.tone}>{modal.msg.text}</Alert>}
          </div>
        )}
      </Modal>
    </div>
  );
}
