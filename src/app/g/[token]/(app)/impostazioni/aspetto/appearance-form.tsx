"use client";
/* eslint-disable @next/next/no-img-element */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { useAction } from "@/components/staff/use-action";
import { FONT_OPTIONS } from "@/domain/tenant-input";
import type { Branding } from "@/server/db/types";
import { saveAppearance } from "../actions";

export function AppearanceForm({ token, name, branding, logoUrl, coverUrl }: { token: string; name: string; branding: Branding; logoUrl: string | null; coverUrl: string | null }) {
  const router = useRouter();
  const [b, setB] = useState(branding);
  const { pending, msg, run } = useAction();
  return (
    <form
      className="grid gap-6 lg:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => saveAppearance(token, fd), { success: "Aspetto aggiornato.", onOk: () => router.refresh() });
      }}
    >
      <Card>
        <CardHeader title="Logo, copertina e colori" />
        <div className="space-y-4 p-5">
          <Field label="Logo" hint="Quadrato, sfondo trasparente o bianco">
            <div className="flex items-center gap-3">
              {logoUrl && <img src={logoUrl} alt="" className="h-14 w-14 rounded-xl object-contain ring-1 ring-slate-200" />}
              <Input type="file" name="logo" accept="image/png,image/jpeg,image/webp" />
            </div>
            {logoUrl && <Checkbox label="Rimuovi logo" name="remove_logo" value="1" className="mt-2" />}
          </Field>
          <Field label="Foto di copertina" hint="Orizzontale, almeno 1600 px">
            <div className="flex items-center gap-3">
              {coverUrl && <img src={coverUrl} alt="" className="h-14 w-24 rounded-lg object-cover ring-1 ring-slate-200" />}
              <Input type="file" name="cover" accept="image/png,image/jpeg,image/webp" />
            </div>
            {coverUrl && <Checkbox label="Rimuovi copertina" name="remove_cover" value="1" className="mt-2" />}
          </Field>
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["primaryColor", "Principale"],
                ["accentColor", "Accento"],
                ["backgroundColor", "Sfondo"],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} label={label}>
                <input type="color" name={k} value={b[k]} onChange={(e) => setB({ ...b, [k]: e.target.value })} className="h-10 w-full cursor-pointer rounded-lg ring-1 ring-slate-300" />
              </Field>
            ))}
          </div>
          <Field label="Font">
            <Select name="fontFamily" value={b.fontFamily} onChange={(e) => setB({ ...b, fontFamily: e.target.value })}>
              {FONT_OPTIONS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </Select>
          </Field>
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
          <Button type="submit" disabled={pending}>{pending ? "Salvataggio…" : "Salva"}</Button>
        </div>
      </Card>
      <div className="overflow-hidden rounded-2xl shadow-sm ring-1 ring-slate-200" style={{ background: b.backgroundColor }}>
        <div className="h-28 bg-cover bg-center" style={{ backgroundColor: b.primaryColor, backgroundImage: coverUrl ? `url(${coverUrl})` : undefined }} />
        <div className="-mt-8 px-5">
          {logoUrl ? <img src={logoUrl} alt="" className="h-16 w-16 rounded-2xl bg-white object-contain p-1 shadow" /> : <div className="h-16 w-16 rounded-2xl bg-white shadow" />}
          <p className="mt-2 text-xl font-bold" style={{ color: b.primaryColor }}>{name}</p>
        </div>
        <div className="flex gap-2 px-5 py-3">
          {["Antipasti", "Pizze", "Dolci"].map((c, i) => (
            <span key={c} className="rounded-full px-3 py-1 text-xs font-medium" style={i === 0 ? { background: b.primaryColor, color: "#fff" } : { background: "#fff" }}>
              {c}
            </span>
          ))}
        </div>
        <div className="space-y-2 px-5 pb-5">
          {["Margherita", "Diavola"].map((p) => (
            <div key={p} className="flex justify-between rounded-xl bg-white p-3 text-sm shadow-sm">
              <span className="font-medium">{p}</span>
              <span style={{ color: b.accentColor }} className="font-semibold">8,00 €</span>
            </div>
          ))}
        </div>
      </div>
    </form>
  );
}
