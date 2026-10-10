"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { I18nField } from "@/components/staff/i18n-field";
import { useAction } from "@/components/staff/use-action";
import { cn } from "@/lib/cn";
import { LANGUAGES, type I18n } from "@/domain/menu";
import { MENU_MODE_LABELS, type MenuMode } from "@/domain/modules";
import { saveMenuSettings } from "../actions";

const DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
type Schedule = { weekdays: number[]; from: string; to: string; mode: MenuMode };
type Values = { languages: string[]; soldOutBehavior: "show" | "hide"; frozenNote: I18n; defaultMenuMode: MenuMode; modeSchedules: Schedule[] };

export function MenuSettingsForm({ token, initial, multilang, orders }: { token: string; initial: Values; multilang: boolean; orders: boolean }) {
  const [v, setV] = useState(initial);
  const { pending, msg, run } = useAction();
  const modes = (Object.keys(MENU_MODE_LABELS) as MenuMode[]).filter((m) => orders || m === "static");

  return (
    <form
      className="grid gap-6 lg:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveMenuSettings(token, v), { success: "Impostazioni salvate." });
      }}
    >
      <Card>
        <CardHeader title="Lingue del menu" description={multilang ? "Il cliente sceglie la lingua; i testi mancanti restano in italiano" : "Attiva il modulo Multilingua per altre lingue"} />
        <div className="flex flex-wrap gap-2 p-5">
          {Object.entries(LANGUAGES).map(([code, l]) => {
            const on = v.languages.includes(code);
            const locked = code === "it" || !multilang;
            return (
              <button
                key={code}
                type="button"
                disabled={locked}
                onClick={() => setV({ ...v, languages: on ? v.languages.filter((x) => x !== code) : [...v.languages, code] })}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm ring-1 disabled:cursor-not-allowed",
                  on ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-300",
                  locked && !on && "opacity-50",
                )}
              >
                {l.flag} {l.label}
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader title="Prodotti esauriti e surgelati" />
        <div className="space-y-4 p-5">
          <Field label="Prodotti esauriti">
            <Select value={v.soldOutBehavior} onChange={(e) => setV({ ...v, soldOutBehavior: e.target.value as Values["soldOutBehavior"] })}>
              <option value="show">Mostra con la scritta «Esaurito»</option>
              <option value="hide">Nascondi dal menu</option>
            </Select>
          </Field>
          <I18nField label="Nota per prodotti surgelati / abbattuti" value={v.frozenNote} onChange={(frozenNote) => setV({ ...v, frozenNote })} languages={v.languages} />
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader title="Modalità del menu" description="Puoi cambiarla in ogni momento o programmarla per fasce orarie (es. pranzo alla carta, cena AYCE)" />
        <div className="space-y-4 p-5">
          <Field label="Modalità predefinita">
            <Select value={v.defaultMenuMode} onChange={(e) => setV({ ...v, defaultMenuMode: e.target.value as MenuMode })}>
              {modes.map((m) => (
                <option key={m} value={m}>{MENU_MODE_LABELS[m]}</option>
              ))}
            </Select>
          </Field>
          {v.modeSchedules.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3">
              <div className="flex flex-wrap gap-1">
                {DAYS.map((d, j) => {
                  const day = j + 1;
                  const on = s.weekdays.includes(day);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        setV({ ...v, modeSchedules: v.modeSchedules.map((x, k) => (k === i ? { ...x, weekdays: on ? x.weekdays.filter((w) => w !== day) : [...x.weekdays, day].sort() } : x)) })
                      }
                      className={cn("rounded-md px-2 py-1 text-xs font-medium ring-1", on ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-300")}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <Input type="time" className="w-28" value={s.from} onChange={(e) => setV({ ...v, modeSchedules: v.modeSchedules.map((x, k) => (k === i ? { ...x, from: e.target.value } : x)) })} />
              –
              <Input type="time" className="w-28" value={s.to} onChange={(e) => setV({ ...v, modeSchedules: v.modeSchedules.map((x, k) => (k === i ? { ...x, to: e.target.value } : x)) })} />
              <Select className="w-auto" value={s.mode} onChange={(e) => setV({ ...v, modeSchedules: v.modeSchedules.map((x, k) => (k === i ? { ...x, mode: e.target.value as MenuMode } : x)) })}>
                {modes.map((m) => (
                  <option key={m} value={m}>{MENU_MODE_LABELS[m]}</option>
                ))}
              </Select>
              <button type="button" className="ml-auto text-slate-400 hover:text-red-600" onClick={() => setV({ ...v, modeSchedules: v.modeSchedules.filter((_, k) => k !== i) })} aria-label="Rimuovi">✕</button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => setV({ ...v, modeSchedules: [...v.modeSchedules, { weekdays: [], from: "19:00", to: "23:30", mode: orders ? "ayce" : "static" }] })}>
            + Aggiungi fascia oraria
          </Button>
        </div>
      </Card>
      {msg && <div className="lg:col-span-2"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <div><Button type="submit" disabled={pending}>Salva</Button></div>
    </form>
  );
}
