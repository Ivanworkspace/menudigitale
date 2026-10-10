"use client";
/* eslint-disable @next/next/no-img-element */
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { CopyButton } from "@/components/ui/copy-button";
import { LocationPicker } from "@/components/maps/location-picker";
import { MODULE_KEYS, MODULE_LABELS, MENU_MODE_LABELS, type MenuMode } from "@/domain/modules";
import { FONT_OPTIONS } from "@/domain/tenant-input";
import { formatEuro, parseEuroToCents } from "@/lib/format";
import { publicEnv } from "@/lib/env";
import type { Tenant, Branding } from "@/server/db/types";
import type { Plan } from "@/server/superadmin/queries";
import {
  impersonateTenant,
  reactivateTenant,
  renewSubscription,
  resetOwnerPin,
  revealAccessLink,
  rotateAccessToken,
  setModule,
  suspendTenant,
  updateBranding,
  updateTenant,
} from "../../actions";

function useAction() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) setMsg({ tone: "danger", text: r.error ?? "Errore" });
      else if (success) setMsg({ tone: "success", text: success });
    });
  return { pending, msg, run, setMsg };
}

// ---------------------------------------------------------------------------

export function AccessPanel({ tenantId, tokenHint, rotatedAt }: { tenantId: string; tokenHint: string; rotatedAt: string }) {
  const { pending, msg, run } = useAction();
  const [link, setLink] = useState<string | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [impOpen, setImpOpen] = useState(false);

  return (
    <Card>
      <CardHeader title="Accesso al pannello" description={`Link attuale …${tokenHint} · aggiornato il ${rotatedAt}`} />
      <div className="space-y-4 p-5">
        {link && (
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-slate-50 px-3 py-2 text-xs ring-1 ring-slate-200">{link}</code>
            <CopyButton value={link} />
          </div>
        )}
        {pin && (
          <Alert tone="warning" title="Nuovo PIN del titolare (mostrato solo ora)">
            <div className="mt-1 flex items-center gap-3">
              <code className="font-mono text-2xl tracking-[0.4em]">{pin}</code>
              <CopyButton value={pin} />
            </div>
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const r = await revealAccessLink(tenantId);
                if (r.ok) setLink(r.data.link);
                return r;
              })
            }
          >
            Mostra link
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (!confirm("Il link attuale smetterà di funzionare e tutte le sessioni verranno chiuse. Continuare?")) return;
              run(async () => {
                const r = await rotateAccessToken(tenantId);
                if (r.ok) setLink(r.data.link);
                return r;
              }, "Nuovo link generato. Comunicalo al cliente.");
            }}
          >
            Rigenera link
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (!confirm("Generare un nuovo PIN per il titolare? Quello attuale non funzionerà più.")) return;
              run(async () => {
                const r = await resetOwnerPin(tenantId);
                if (r.ok) setPin(r.data.pin);
                return r;
              });
            }}
          >
            Reset PIN titolare
          </Button>
          <Button size="sm" disabled={pending} onClick={() => setImpOpen(!impOpen)}>
            Accedi come cliente
          </Button>
        </div>
        {impOpen && (
          <form
            className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => impersonateTenant(tenantId, reason));
            }}
          >
            <Input
              placeholder="Motivo dell'accesso (registrato nel log)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
            />
            <Button type="submit" disabled={pending}>
              Entra
            </Button>
          </form>
        )}
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function SubscriptionPanel({
  tenantId,
  status,
  defaultEnd,
  planPrice,
}: {
  tenantId: string;
  status: Tenant["status"];
  defaultEnd: string;
  planPrice: number | null;
}) {
  const { pending, msg, run } = useAction();
  const [end, setEnd] = useState(defaultEnd);
  const [amount, setAmount] = useState(planPrice ? (planPrice / 100).toFixed(2).replace(".", ",") : "");
  const [note, setNote] = useState("");

  return (
    <Card>
      <CardHeader title="Rinnovo e stato" />
      <div className="space-y-4 p-5">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                renewSubscription(tenantId, {
                  periodEnd: end,
                  amountCents: amount ? parseEuroToCents(amount) : null,
                  note,
                }),
              "Abbonamento rinnovato.",
            );
          }}
        >
          <Field label="Nuova scadenza">
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </Field>
          <Field label="Importo incassato (€)">
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
          </Field>
          <Button type="submit" disabled={pending}>
            Rinnova
          </Button>
          <Field label="Nota" className="sm:col-span-3">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Es. bonifico del 10/10" />
          </Field>
        </form>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {status === "suspended" ? (
            <Button variant="secondary" disabled={pending} onClick={() => run(() => reactivateTenant(tenantId), "Cliente riattivato.")}>
              Riattiva
            </Button>
          ) : (
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => {
                const reason = prompt("Motivo della sospensione (visibile solo a te):");
                if (reason === null) return;
                run(() => suspendTenant(tenantId, reason), "Cliente sospeso.");
              }}
            >
              Sospendi
            </Button>
          )}
        </div>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function ModulesPanel({ tenantId, modules }: { tenantId: string; modules: Record<string, boolean> }) {
  const [state, setState] = useState(modules);
  const { pending, msg, run } = useAction();
  return (
    <Card>
      <CardHeader title="Moduli" description="Funzionalità attive per questo locale" />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        {MODULE_KEYS.map((m) => (
          <Checkbox
            key={m}
            label={MODULE_LABELS[m].label}
            description={MODULE_LABELS[m].description}
            checked={!!state[m]}
            disabled={pending}
            onChange={(e) => {
              const enabled = e.target.checked;
              setState((s) => ({ ...s, [m]: enabled }));
              run(async () => {
                const r = await setModule(tenantId, m, enabled);
                if (!r.ok) setState((s) => ({ ...s, [m]: !enabled }));
                return r;
              });
            }}
          />
        ))}
      </div>
      {msg && <div className="px-5 pb-5"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function DetailsPanel({ tenant, plans }: { tenant: Tenant; plans: Plan[] }) {
  const { pending, msg, run } = useAction();
  const [v, setV] = useState({
    legalName: tenant.legalName,
    displayName: tenant.displayName,
    vatNumber: tenant.vatNumber ?? "",
    address: tenant.address ?? "",
    city: tenant.city ?? "",
    postalCode: tenant.postalCode ?? "",
    province: tenant.province ?? "",
    phone: tenant.phone ?? "",
    email: tenant.email ?? "",
    contactName: tenant.contactName ?? "",
    planId: tenant.planId,
    graceDays: tenant.graceDays,
    lat: tenant.lat,
    lng: tenant.lng,
    geofenceRadiusM: tenant.geofenceRadiusM,
    defaultMenuMode: tenant.defaultMenuMode,
    showPoweredBy: tenant.showPoweredBy,
  });
  const set = (k: keyof typeof v, value: unknown) => setV((p) => ({ ...p, [k]: value }));
  const text = (k: keyof typeof v, label: string, cls = "") => (
    <Field label={label} className={cls}>
      <Input value={String(v[k] ?? "")} onChange={(e) => set(k, e.target.value)} />
    </Field>
  );

  return (
    <Card>
      <CardHeader title="Dati del locale" />
      <form
        className="space-y-6 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => updateTenant(tenant.id, v), "Dati salvati.");
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {text("legalName", "Ragione sociale")}
          {text("displayName", "Nome del locale")}
          {text("vatNumber", "Partita IVA")}
          {text("contactName", "Referente")}
          {text("address", "Indirizzo", "sm:col-span-2")}
          {text("city", "Città")}
          <div className="grid grid-cols-2 gap-3">
            {text("postalCode", "CAP")}
            {text("province", "Provincia")}
          </div>
          {text("phone", "Telefono")}
          {text("email", "Email")}
          <Field label="Piano">
            <Select value={v.planId ?? ""} onChange={(e) => set("planId", e.target.value || null)}>
              <option value="">Nessun piano</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {formatEuro(p.priceMonthCents)}/mese
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Giorni di tolleranza">
            <Input type="number" min={0} max={90} value={v.graceDays} onChange={(e) => set("graceDays", Number(e.target.value))} />
          </Field>
          <Field label="Modalità menu predefinita">
            <Select value={v.defaultMenuMode} onChange={(e) => set("defaultMenuMode", e.target.value as MenuMode)}>
              {(Object.keys(MENU_MODE_LABELS) as MenuMode[]).map((m) => (
                <option key={m} value={m}>
                  {MENU_MODE_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox
              label={`Mostra "Powered by ${publicEnv.brandName}"`}
              checked={v.showPoweredBy}
              onChange={(e) => set("showPoweredBy", e.target.checked)}
            />
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Posizione e raggio per gli ordini</p>
          <LocationPicker
            lat={v.lat}
            lng={v.lng}
            radius={v.geofenceRadiusM}
            defaultQuery={[v.address, v.city].filter(Boolean).join(", ")}
            onChange={({ lat, lng, radius }) => setV((p) => ({ ...p, lat, lng, geofenceRadiusM: radius }))}
          />
        </div>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Salvataggio…" : "Salva dati"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function BrandingPanel({ tenantId, branding, logoUrl }: { tenantId: string; branding: Branding; logoUrl: string | null }) {
  const { pending, msg, run } = useAction();
  return (
    <Card>
      <CardHeader title="Branding" />
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => updateBranding(tenantId, fd), "Branding aggiornato.");
        }}
      >
        <div className="flex items-center gap-4">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-16 w-16 rounded-xl bg-slate-50 object-contain ring-1 ring-slate-200" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400">Logo</div>
          )}
          <Input type="file" name="logo" accept="image/png,image/jpeg,image/webp" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              ["primaryColor", "Principale"],
              ["accentColor", "Accento"],
              ["backgroundColor", "Sfondo"],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <input type="color" name={k} defaultValue={branding[k]} className="h-10 w-full cursor-pointer rounded-lg ring-1 ring-slate-300" />
            </Field>
          ))}
        </div>
        <Field label="Font">
          <Select name="fontFamily" defaultValue={branding.fontFamily}>
            {FONT_OPTIONS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </Select>
        </Field>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            Salva branding
          </Button>
        </div>
      </form>
    </Card>
  );
}
