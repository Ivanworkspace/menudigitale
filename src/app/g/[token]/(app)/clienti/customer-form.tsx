"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useAction } from "@/components/staff/use-action";
import { saveCustomer } from "./actions";

export type CustomerDraft = { id?: string; name: string; phone: string; email: string; birthday: string; notes: string; privacyConsent: boolean; marketingConsent: boolean };

export function CustomerModal({ token, initial, onClose, onSaved }: { token: string; initial: CustomerDraft; onClose: () => void; onSaved: (id: string) => void }) {
  const [v, setV] = useState(initial);
  const { pending, msg, run } = useAction();
  return (
    <Modal
      open
      onClose={onClose}
      title={v.id ? "Modifica cliente" : "Nuovo cliente"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
          <Button disabled={pending} onClick={() => run(() => saveCustomer(token, v), { onOk: (r) => onSaved(r.id) })}>Salva</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome e cognome" className="sm:col-span-2"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus /></Field>
        <Field label="Telefono"><Input type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></Field>
        <Field label="Email"><Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
        <Field label="Compleanno"><Input type="date" value={v.birthday} onChange={(e) => setV({ ...v, birthday: e.target.value })} /></Field>
        <Field label="Note" className="sm:col-span-2"><Textarea rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} placeholder="Allergie, preferenze…" /></Field>
        <div className="space-y-2 sm:col-span-2">
          <Checkbox label="Consenso al trattamento dei dati (obbligatorio)" description="Informativa privacy GDPR consegnata al cliente" checked={v.privacyConsent} onChange={(e) => setV({ ...v, privacyConsent: e.target.checked })} />
          <Checkbox label="Consenso a comunicazioni promozionali (facoltativo)" description="Separato dal consenso privacy, revocabile in ogni momento" checked={v.marketingConsent} onChange={(e) => setV({ ...v, marketingConsent: e.target.checked })} />
        </div>
        {msg && <div className="sm:col-span-2"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      </div>
    </Modal>
  );
}

export function NewCustomerButton({ token, basePath }: { token: string; basePath: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Nuovo cliente</Button>
      {open && (
        <CustomerModal
          token={token}
          initial={{ name: "", phone: "", email: "", birthday: "", notes: "", privacyConsent: false, marketingConsent: false }}
          onClose={() => setOpen(false)}
          onSaved={(id) => router.push(`${basePath}/clienti/${id}`)}
        />
      )}
    </>
  );
}
