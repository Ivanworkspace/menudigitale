"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { LocationPicker } from "@/components/maps/location-picker";
import { cn } from "@/lib/cn";
import { formatEuro } from "@/lib/format";
import { slugify } from "@/domain/slug";
import { MODULE_KEYS, MODULE_LABELS, MENU_MODE_LABELS, type ModuleKey, type MenuMode } from "@/domain/modules";
import { FONT_OPTIONS, isValidPartitaIva } from "@/domain/tenant-input";
import type { Plan } from "@/server/superadmin/queries";
import { checkSlug, createTenant } from "../../actions";
import { publicEnv } from "@/lib/env";

const STEPS = ["Dati attività", "Indirizzo e accesso", "Piano e moduli", "Modalità menu", "Posizione", "Branding", "Riepilogo"];

type State = {
  legalName: string;
  displayName: string;
  vatNumber: string;
  address: string;
  city: string;
  postalCode: string;
  province: string;
  phone: string;
  email: string;
  contactName: string;
  slug: string;
  ownerName: string;
  planId: string | null;
  status: "trial" | "active";
  trialDays: number;
  subscriptionEndsAt: string;
  graceDays: number;
  modules: ModuleKey[];
  defaultMenuMode: MenuMode;
  lat: number | null;
  lng: number | null;
  geofenceRadiusM: number;
  showPoweredBy: boolean;
  branding: { primaryColor: string; accentColor: string; backgroundColor: string; fontFamily: (typeof FONT_OPTIONS)[number] };
};

type Created = { tenantId: string; link: string; pin: string; slug: string };

export function NewTenantWizard({ plans, defaultGraceDays }: { plans: Plan[]; defaultGraceDays: number }) {
  const firstPlan = plans.find((p) => p.active) ?? null;
  const [step, setStep] = useState(0);
  const [s, setS] = useState<State>({
    legalName: "", displayName: "", vatNumber: "", address: "", city: "", postalCode: "", province: "",
    phone: "", email: "", contactName: "", slug: "", ownerName: "Titolare",
    planId: firstPlan?.id ?? null, status: "trial", trialDays: 14, subscriptionEndsAt: "", graceDays: defaultGraceDays,
    modules: (firstPlan?.includedModules as ModuleKey[]) ?? [], defaultMenuMode: "static",
    lat: null, lng: null, geofenceRadiusM: 100, showPoweredBy: true,
    branding: { primaryColor: "#b91c1c", accentColor: "#f59e0b", backgroundColor: "#fffaf5", fontFamily: "Inter" },
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<{ checking: boolean; error: string | null }>({ checking: false, error: null });
  const [logo, setLogo] = useState<File | null>(null);
  const logoPreview = useMemo(() => (logo ? URL.createObjectURL(logo) : null), [logo]);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof State>(k: K, v: State[K]) => setS((prev) => ({ ...prev, [k]: v }));

  // Suggest slug from the business name until the user edits it.
  useEffect(() => {
    if (!slugTouched) setS((prev) => ({ ...prev, slug: slugify(prev.displayName) }));
  }, [s.displayName, slugTouched]);

  // Debounced availability check.
  useEffect(() => {
    if (!s.slug) return;
    setSlugState({ checking: true, error: null });
    const t = setTimeout(async () => {
      const r = await checkSlug(s.slug);
      setSlugState({ checking: false, error: r.error });
    }, 400);
    return () => clearTimeout(t);
  }, [s.slug]);

  const stepError = (): string | null => {
    switch (step) {
      case 0:
        if (s.legalName.trim().length < 2) return "Inserisci la ragione sociale.";
        if (s.displayName.trim().length < 2) return "Inserisci il nome del locale.";
        if (s.vatNumber && !isValidPartitaIva(s.vatNumber.replace(/^IT/i, "").replace(/\s/g, ""))) return "Partita IVA non valida.";
        return null;
      case 1:
        if (slugState.checking) return "Verifica dell'indirizzo in corso…";
        return slugState.error ?? (s.slug ? null : "Scegli l'indirizzo pubblico.");
      case 2:
        if (s.status === "active" && !s.subscriptionEndsAt) return "Indica la data di scadenza dell'abbonamento.";
        return null;
      default:
        return null;
    }
  };

  const next = () => {
    const err = stepError();
    if (err) return setError(err);
    setError(null);
    setStep((x) => Math.min(x + 1, STEPS.length - 1));
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set(
        "payload",
        JSON.stringify({
          ...s,
          subscriptionEndsAt: s.status === "active" && s.subscriptionEndsAt ? s.subscriptionEndsAt : null,
        }),
      );
      if (logo) fd.set("logo", logo);
      const res = await createTenant(fd);
      if (!res.ok) setError(res.error);
      else setCreated(res.data);
    });

  if (created) return <CreatedSummary created={created} name={s.displayName} />;

  const selectedPlan = plans.find((p) => p.id === s.planId);

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <ol className="flex gap-2 overflow-x-auto lg:flex-col">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              disabled={i > step}
              onClick={() => setStep(i)}
              className={cn(
                "flex w-full items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm",
                i === step ? "bg-white font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500",
                i < step && "text-slate-700 hover:bg-white",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs",
                  i < step ? "bg-emerald-600 text-white" : i === step ? "bg-slate-900 text-white" : "bg-slate-200",
                )}
              >
                {i < step ? "✓" : i + 1}
              </span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      <Card className="p-5 sm:p-6">
        <h2 className="mb-5 text-lg font-semibold text-slate-900">{STEPS[step]}</h2>

        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ragione sociale *" htmlFor="legalName">
              <Input id="legalName" value={s.legalName} onChange={(e) => set("legalName", e.target.value)} />
            </Field>
            <Field label="Nome del locale *" htmlFor="displayName" hint="Come appare nel menu">
              <Input id="displayName" value={s.displayName} onChange={(e) => set("displayName", e.target.value)} />
            </Field>
            <Field label="Partita IVA" htmlFor="vat">
              <Input id="vat" value={s.vatNumber} onChange={(e) => set("vatNumber", e.target.value)} />
            </Field>
            <Field label="Referente" htmlFor="contact">
              <Input id="contact" value={s.contactName} onChange={(e) => set("contactName", e.target.value)} />
            </Field>
            <Field label="Indirizzo" htmlFor="address" className="sm:col-span-2">
              <Input id="address" value={s.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
            <div className="grid grid-cols-[1fr_90px_70px] gap-3 sm:col-span-2">
              <Field label="Città" htmlFor="city">
                <Input id="city" value={s.city} onChange={(e) => set("city", e.target.value)} />
              </Field>
              <Field label="CAP" htmlFor="cap">
                <Input id="cap" value={s.postalCode} onChange={(e) => set("postalCode", e.target.value)} />
              </Field>
              <Field label="Prov." htmlFor="prov">
                <Input id="prov" maxLength={2} value={s.province} onChange={(e) => set("province", e.target.value.toUpperCase())} />
              </Field>
            </div>
            <Field label="Telefono" htmlFor="phone">
              <Input id="phone" type="tel" value={s.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" value={s.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <Field
              label="Indirizzo pubblico del menu *"
              htmlFor="slug"
              error={slugState.error}
              hint={slugState.checking ? "Verifica…" : s.slug ? "Disponibile ✓" : undefined}
            >
              <div className="flex items-center rounded-lg ring-1 ring-slate-300 focus-within:ring-2 focus-within:ring-slate-900">
                <span className="pl-3 text-sm text-slate-500">{publicEnv.appUrl.replace(/^https?:\/\//, "")}/m/</span>
                <input
                  id="slug"
                  className="h-10 flex-1 rounded-r-lg bg-transparent px-1 text-sm outline-none"
                  value={s.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                  }}
                />
              </div>
            </Field>
            <Field label="Nome del titolare" htmlFor="owner" hint="Comparirà nell'elenco del personale">
              <Input id="owner" value={s.ownerName} onChange={(e) => set("ownerName", e.target.value)} />
            </Field>
            <Alert tone="info" title="Link segreto e PIN">
              Alla creazione verranno generati automaticamente il link segreto di gestione (non indovinabile) e il PIN del
              titolare (6 cifre). Il PIN sarà mostrato una sola volta.
            </Alert>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {plans.filter((p) => p.active).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setS((prev) => ({ ...prev, planId: p.id, modules: p.includedModules as ModuleKey[] }))}
                  className={cn(
                    "rounded-xl p-4 text-left ring-1 transition",
                    s.planId === p.id ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-200 hover:ring-slate-400",
                  )}
                >
                  <p className="font-semibold">{p.name}</p>
                  <p className={cn("text-sm", s.planId === p.id ? "text-slate-300" : "text-slate-500")}>
                    {formatEuro(p.priceMonthCents)}/mese
                  </p>
                  <p className={cn("mt-2 text-xs", s.planId === p.id ? "text-slate-300" : "text-slate-500")}>
                    {p.maxTables ?? "∞"} tavoli · {p.maxProducts ?? "∞"} prodotti · {p.maxStaff ?? "∞"} utenti
                  </p>
                </button>
              ))}
              {plans.length === 0 && (
                <p className="text-sm text-slate-500 sm:col-span-3">
                  Nessun piano configurato. <Link className="underline" href="/superadmin/piani">Crea un piano</Link>.
                </p>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Moduli attivi</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {MODULE_KEYS.map((m) => (
                  <Checkbox
                    key={m}
                    label={MODULE_LABELS[m].label}
                    description={MODULE_LABELS[m].description}
                    checked={s.modules.includes(m)}
                    onChange={(e) =>
                      set("modules", e.target.checked ? [...s.modules, m] : s.modules.filter((x) => x !== m))
                    }
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Stato iniziale">
                <Select value={s.status} onChange={(e) => set("status", e.target.value as State["status"])}>
                  <option value="trial">In prova</option>
                  <option value="active">Attivo (abbonamento pagato)</option>
                </Select>
              </Field>
              {s.status === "trial" ? (
                <Field label="Giorni di prova">
                  <Input type="number" min={1} max={365} value={s.trialDays} onChange={(e) => set("trialDays", Number(e.target.value))} />
                </Field>
              ) : (
                <Field label="Scadenza abbonamento">
                  <Input type="date" value={s.subscriptionEndsAt} onChange={(e) => set("subscriptionEndsAt", e.target.value)} />
                </Field>
              )}
              <Field label="Giorni di tolleranza" hint="Dopo la scadenza, prima della sospensione">
                <Input type="number" min={0} max={90} value={s.graceDays} onChange={(e) => set("graceDays", Number(e.target.value))} />
              </Field>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            {(Object.keys(MENU_MODE_LABELS) as MenuMode[]).map((m) => {
              const needsOrders = m !== "static";
              const disabled = needsOrders && !s.modules.includes("orders");
              return (
                <label
                  key={m}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl p-4 ring-1",
                    s.defaultMenuMode === m ? "bg-slate-50 ring-slate-900" : "ring-slate-200",
                    disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type="radio"
                    name="mode"
                    className="mt-1 accent-slate-900"
                    disabled={disabled}
                    checked={s.defaultMenuMode === m}
                    onChange={() => set("defaultMenuMode", m)}
                  />
                  <span>
                    <span className="block font-medium text-slate-900">{MENU_MODE_LABELS[m]}</span>
                    <span className="block text-sm text-slate-500">
                      {m === "static" && "I clienti consultano il menu, nessun ordine dal telefono."}
                      {m === "table_orders" && "I clienti ordinano dal tavolo scansionando il QR."}
                      {m === "ayce" && "Prezzo a persona, ordini a giri con limiti e timer."}
                      {disabled && " Richiede il modulo Ordini."}
                    </span>
                  </span>
                </label>
              );
            })}
            <p className="text-xs text-slate-500">Il locale potrà cambiarla in ogni momento, anche per fasce orarie.</p>
          </div>
        )}

        {step === 4 && (
          <LocationPicker
            lat={s.lat}
            lng={s.lng}
            radius={s.geofenceRadiusM}
            defaultQuery={[s.address, s.city].filter(Boolean).join(", ")}
            onChange={({ lat, lng, radius }) => setS((prev) => ({ ...prev, lat, lng, geofenceRadiusM: radius }))}
          />
        )}

        {step === 5 && (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <Field label="Logo" hint="JPG, PNG o WebP. Verrà convertito e ottimizzato.">
                <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                {(["primaryColor", "accentColor", "backgroundColor"] as const).map((k) => (
                  <Field key={k} label={{ primaryColor: "Principale", accentColor: "Accento", backgroundColor: "Sfondo" }[k]}>
                    <input
                      type="color"
                      value={s.branding[k]}
                      onChange={(e) => set("branding", { ...s.branding, [k]: e.target.value })}
                      className="h-10 w-full cursor-pointer rounded-lg ring-1 ring-slate-300"
                    />
                  </Field>
                ))}
              </div>
              <Field label="Font">
                <Select
                  value={s.branding.fontFamily}
                  onChange={(e) => set("branding", { ...s.branding, fontFamily: e.target.value as State["branding"]["fontFamily"] })}
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </Select>
              </Field>
              <Checkbox
                label={`Mostra "Powered by ${publicEnv.brandName}"`}
                description="Disattiva per il white-label"
                checked={s.showPoweredBy}
                onChange={(e) => set("showPoweredBy", e.target.checked)}
              />
            </div>
            <div
              className="overflow-hidden rounded-2xl ring-1 ring-slate-200"
              style={{ background: s.branding.backgroundColor, fontFamily: s.branding.fontFamily }}
            >
              <div className="flex items-center gap-3 p-4" style={{ background: s.branding.primaryColor }}>
                {logoPreview ? (
                  <img src={logoPreview} alt="" className="h-10 w-10 rounded-full bg-white object-contain" />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-white/30" />
                )}
                <p className="font-semibold text-white">{s.displayName || "Nome del locale"}</p>
              </div>
              <div className="space-y-2 p-4">
                {["Antipasti", "Pizze", "Dolci"].map((c, i) => (
                  <div key={c} className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
                    <span className="text-sm font-medium">{c}</span>
                    <span className="rounded-full px-2 py-0.5 text-xs text-white" style={{ background: s.branding.accentColor }}>
                      {[6, 14, 4][i]} piatti
                    </span>
                  </div>
                ))}
                {s.showPoweredBy && <p className="pt-2 text-center text-[11px] text-slate-400">Powered by {publicEnv.brandName}</p>}
              </div>
            </div>
          </div>
        )}

        {step === 6 && (
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Summary label="Locale" value={`${s.displayName} (${s.legalName})`} />
            <Summary label="Partita IVA" value={s.vatNumber || "—"} />
            <Summary label="Indirizzo" value={[s.address, s.postalCode, s.city, s.province].filter(Boolean).join(", ") || "—"} />
            <Summary label="Contatti" value={[s.phone, s.email].filter(Boolean).join(" · ") || "—"} />
            <Summary label="Menu pubblico" value={`/m/${s.slug}`} />
            <Summary label="Piano" value={selectedPlan ? `${selectedPlan.name} (${formatEuro(selectedPlan.priceMonthCents)}/mese)` : "Nessuno"} />
            <Summary label="Stato" value={s.status === "trial" ? `Prova di ${s.trialDays} giorni` : `Attivo fino al ${s.subscriptionEndsAt}`} />
            <Summary label="Moduli" value={s.modules.map((m) => MODULE_LABELS[m].label).join(", ") || "Nessuno"} />
            <Summary label="Modalità menu" value={MENU_MODE_LABELS[s.defaultMenuMode]} />
            <Summary
              label="Posizione"
              value={s.lat !== null && s.lng !== null ? `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)} · raggio ${s.geofenceRadiusM} m` : "Non impostata"}
            />
          </dl>
        )}

        {error && <p className="mt-5 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-between border-t border-slate-100 pt-5">
          <Button variant="ghost" onClick={() => setStep((x) => Math.max(0, x - 1))} disabled={step === 0 || pending}>
            Indietro
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>Avanti</Button>
          ) : (
            <Button onClick={submit} disabled={pending}>
              {pending ? "Creazione…" : "Crea cliente"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-900">{value}</dd>
    </div>
  );
}

function CreatedSummary({ created, name }: { created: Created; name: string }) {
  return (
    <Card className="mx-auto max-w-2xl p-6">
      <p className="text-sm font-semibold text-emerald-700">Cliente creato</p>
      <h2 className="mt-1 text-xl font-bold text-slate-900">{name}</h2>
      <Alert tone="warning" title="Copia ora questi dati">
        Il PIN del titolare non verrà più mostrato. Potrai sempre rivedere il link o rigenerare il PIN dalla scheda del
        cliente.
      </Alert>
      <div className="mt-5 space-y-4">
        <div>
          <p className="text-sm font-medium text-slate-700">Link segreto di gestione</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-slate-50 px-3 py-2 text-xs ring-1 ring-slate-200">{created.link}</code>
            <CopyButton value={created.link} />
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-700">PIN del titolare</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="rounded-lg bg-slate-50 px-4 py-2 font-mono text-2xl tracking-[0.4em] ring-1 ring-slate-200">{created.pin}</code>
            <CopyButton value={created.pin} />
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-700">Menu pubblico</p>
          <p className="text-sm text-slate-600">{publicEnv.appUrl}/m/{created.slug}</p>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={`/superadmin/clienti/${created.tenantId}`} className={buttonClass()}>
          Vai alla scheda cliente
        </Link>
        <Link href="/superadmin/clienti/nuovo" className={buttonClass("secondary")} onClick={() => location.reload()}>
          Crea un altro cliente
        </Link>
      </div>
    </Card>
  );
}
