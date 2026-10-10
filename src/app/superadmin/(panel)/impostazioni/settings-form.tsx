"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { savePlatformSettings } from "../actions";

type Values = { brandName: string; brandUrl: string; defaultGraceDays: number; expiryWarningDays: string };

export function SettingsForm({ initial }: { initial: Values }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="max-w-xl p-5">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await savePlatformSettings(v);
            setMsg(r.ok ? { tone: "success", text: "Impostazioni salvate." } : { tone: "danger", text: r.error });
          });
        }}
      >
        <Field label="Nome del brand" hint='Usato in "Powered by" nel menu pubblico'>
          <Input value={v.brandName} onChange={(e) => setV({ ...v, brandName: e.target.value })} />
        </Field>
        <Field label="Sito del brand" hint="Link della scritta Powered by">
          <Input value={v.brandUrl} onChange={(e) => setV({ ...v, brandUrl: e.target.value })} placeholder="https://" />
        </Field>
        <Field label="Giorni di tolleranza predefiniti">
          <Input type="number" min={0} max={90} value={v.defaultGraceDays} onChange={(e) => setV({ ...v, defaultGraceDays: Number(e.target.value) })} />
        </Field>
        <Field label="Avvisi di scadenza (giorni prima)" hint="Separati da virgola, es. 14, 7, 3, 1">
          <Input value={v.expiryWarningDays} onChange={(e) => setV({ ...v, expiryWarningDays: e.target.value })} />
        </Field>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button type="submit" disabled={pending}>Salva</Button>
      </form>
    </Card>
  );
}
