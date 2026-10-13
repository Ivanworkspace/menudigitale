"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { useAction } from "@/components/staff/use-action";
import { renderReviewMessage, type ReviewConfig } from "@/domain/reviews";
import { saveReviewSettings } from "./actions";

export function ReviewSettingsForm({ token, initial, venue }: { token: string; initial: ReviewConfig & { reviewUrl: string }; venue: string }) {
  const [v, setV] = useState(initial);
  const { pending, msg, run } = useAction();
  return (
    <Card className="max-w-3xl">
      <CardHeader title="Impostazioni inviti" />
      <form className="space-y-5 p-5" onSubmit={(e) => { e.preventDefault(); run(() => saveReviewSettings(token, v), { success: "Impostazioni salvate." }); }}>
        <Checkbox label="Invia automaticamente gli inviti a recensire" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} />
        <Field
          label="Link per lasciare una recensione su Google"
          hint={<>Dal Profilo dell&apos;attività su Google (cerca il nome del locale su Google o apri l&apos;app Google Business) → <strong>Chiedi recensioni</strong> → copia il link (es. https://g.page/r/…/review).</>}
        >
          <Input value={v.reviewUrl} onChange={(e) => setV({ ...v, reviewUrl: e.target.value })} placeholder="https://g.page/r/…/review" />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          <Checkbox label="Dopo le prenotazioni (cliente segnato «Arrivato»)" checked={v.fromReservations} onChange={(e) => setV({ ...v, fromReservations: e.target.checked })} />
          <Checkbox label="Dopo gli ordini d'asporto ritirati" checked={v.fromTakeaway} onChange={(e) => setV({ ...v, fromTakeaway: e.target.checked })} />
        </div>
        <Field label="Non reinvitare lo stesso cliente prima di (giorni)">
          <Input type="number" min={7} className="w-32" value={v.cooldownDays} onChange={(e) => setV({ ...v, cooldownDays: Number(e.target.value) })} />
        </Field>
        <Field label="Messaggio" hint="Puoi usare {nome}, {locale} e {link}">
          <Textarea rows={4} value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} />
        </Field>
        <div className="rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-line text-slate-700">
          <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Anteprima</p>
          {renderReviewMessage(v.message, { name: "Giulia Bianchi", venue, link: "https://…/recensione" })}
        </div>
        <div className="space-y-1 text-xs text-slate-500">
          <p>• L&apos;invito parte <strong>solo ai clienti che hanno spuntato la casella</strong> nella prenotazione o nell&apos;ordine d&apos;asporto (o se lo segni tu nella prenotazione telefonica).</p>
          <p>• Con email: parte da solo la mattina dopo. Senza email: lo trovi qui in «Da inviare su WhatsApp».</p>
          <p>• Regole di Google: lo stesso invito a tutti, senza chiedere prima se sono soddisfatti e senza sconti o regali in cambio. Ogni email contiene il link per non ricevere più inviti.</p>
        </div>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button type="submit" disabled={pending}>Salva</Button>
      </form>
    </Card>
  );
}
