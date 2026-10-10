"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/field";
import { useAction } from "@/components/staff/use-action";
import { saveLegal } from "../actions";

export function LegalForm({ token, initial }: { token: string; initial: { privacyText: string; cookieText: string } }) {
  const [v, setV] = useState(initial);
  const { pending, msg, run } = useAction();
  return (
    <Card className="max-w-3xl">
      <CardHeader title="Informativa privacy e cookie" description="Pubblicate nel menu (link in fondo alla pagina). Il menu usa solo cookie tecnici." />
      <form className="space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); run(() => saveLegal(token, v), { success: "Testi salvati." }); }}>
        <Field label="Informativa privacy (GDPR)">
          <Textarea rows={10} value={v.privacyText} onChange={(e) => setV({ ...v, privacyText: e.target.value })} placeholder="Titolare del trattamento: …" />
        </Field>
        <Field label="Cookie policy">
          <Textarea rows={6} value={v.cookieText} onChange={(e) => setV({ ...v, cookieText: e.target.value })} />
        </Field>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button type="submit" disabled={pending}>Salva</Button>
      </form>
      <div className="border-t border-slate-100 p-5 text-sm">
        <p className="font-medium">Esporta tutti i dati del locale</p>
        <p className="mt-1 text-slate-500">Menu, ordini, conti, clienti, prenotazioni e magazzino in un file JSON (solo titolare).</p>
        <a href="export" className="mt-2 inline-block font-medium text-sky-700 underline">
          Scarica esportazione
        </a>
      </div>
    </Card>
  );
}
