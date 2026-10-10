"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { I18nField } from "@/components/staff/i18n-field";
import { useAction } from "@/components/staff/use-action";
import { cn } from "@/lib/cn";
import { formatEuro, parseEuroToCents } from "@/lib/format";
import { assetUrl } from "@/lib/assets";
import {
  ALLERGENS,
  PRODUCT_TAGS,
  PRODUCT_TAG_KEYS,
  VAT_RATES_BP,
  type Category,
  type Department,
  type I18n,
  type Menu,
  type ModifierGroup,
  type Product,
  type ProductTag,
} from "@/domain/menu";
import { saveProduct, translate } from "../../actions";

const centsToInput = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

export function ProductForm(props: {
  token: string;
  basePath: string;
  product: Product | null;
  defaultCategoryId: string;
  categories: Category[];
  menus: Menu[];
  modifierGroups: ModifierGroup[];
  departments: Department[];
  languages: string[];
  canTranslate: boolean;
  ayceEnabled: boolean;
}) {
  const { token, basePath, product: p, categories, menus, modifierGroups, departments, languages } = props;
  const router = useRouter();
  const { pending, msg, run, setMsg } = useAction();

  const [name, setName] = useState<I18n>(p?.name ?? { it: "" });
  const [description, setDescription] = useState<I18n>(p?.description ?? {});
  const [categoryId, setCategoryId] = useState(p?.categoryId ?? props.defaultCategoryId);
  const [price, setPrice] = useState(centsToInput(p?.priceCents));
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(p?.prices ?? {}).map(([k, v]) => [k, centsToInput(v)])),
  );
  const [vat, setVat] = useState(p?.vatRateBp ?? 1000);
  const [departmentId, setDepartmentId] = useState<string | null>(p?.departmentId ?? departments[0]?.id ?? null);
  const [allergens, setAllergens] = useState<number[]>(p?.allergens ?? []);
  const [tags, setTags] = useState<ProductTag[]>(p?.tags ?? []);
  const [isFrozen, setFrozen] = useState(p?.isFrozen ?? false);
  const [available, setAvailable] = useState(p?.available ?? true);
  const [hidden, setHidden] = useState(p?.hidden ?? false);
  const [groupIds, setGroupIds] = useState<string[]>(p?.modifierGroupIds ?? []);
  const [ayceIncluded, setAyceIncluded] = useState(p?.ayceIncluded ?? false);
  const [ayceMax, setAyceMax] = useState(p?.ayceMaxQty?.toString() ?? "");
  const [images, setImages] = useState<string[]>(p?.images ?? []);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const previews = useMemo(() => newFiles.map((f) => URL.createObjectURL(f)), [newFiles]);

  const onTranslate = props.canTranslate
    ? async (text: string, target: string) => {
        const r = await translate(token, [text], target);
        return r.ok ? r.data[0] : null;
      }
    : undefined;

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const submit = () => {
    const priceCents = parseEuroToCents(price || "0");
    if (priceCents === null) return setMsg({ tone: "danger", text: "Prezzo non valido." });
    const pricesCents: Record<string, number> = {};
    for (const [k, v] of Object.entries(prices)) {
      if (!v.trim()) continue;
      const c = parseEuroToCents(v);
      if (c === null) return setMsg({ tone: "danger", text: "Prezzo di listino non valido." });
      pricesCents[k] = c;
    }
    const fd = new FormData();
    fd.set(
      "payload",
      JSON.stringify({
        id: p?.id,
        categoryId,
        name,
        description,
        priceCents,
        prices: pricesCents,
        vatRateBp: vat,
        departmentId,
        allergens,
        tags,
        isFrozen,
        available,
        hidden,
        images,
        modifierGroupIds: groupIds,
        ayceIncluded,
        ayceMaxQty: ayceMax ? Number(ayceMax) : null,
      }),
    );
    newFiles.forEach((f) => fd.append("newImages", f));
    run(() => saveProduct(token, fd), {
      onOk: () => {
        router.push(`${basePath}/menu`);
        router.refresh();
      },
    });
  };

  return (
    <form
      className="grid gap-6 lg:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader title={p ? "Modifica prodotto" : "Nuovo prodotto"} />
          <div className="space-y-4 p-5">
            <I18nField label="Nome" value={name} onChange={setName} languages={languages} required maxLength={100} onTranslate={onTranslate} />
            <I18nField
              label="Descrizione"
              value={description}
              onChange={setDescription}
              languages={languages}
              multiline
              maxLength={600}
              onTranslate={onTranslate}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Categoria *">
                <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.parentId ? "— " : ""}
                      {c.name.it}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Prezzo (€) *">
                <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" required />
              </Field>
              <Field label="IVA">
                <Select value={vat} onChange={(e) => setVat(Number(e.target.value))}>
                  {VAT_RATES_BP.map((v) => (
                    <option key={v} value={v}>
                      {v / 100}%
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Reparto" hint="Dove arriva la comanda">
                <Select value={departmentId ?? ""} onChange={(e) => setDepartmentId(e.target.value || null)}>
                  <option value="">Nessuno</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {menus.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Prezzi per listino (opzionali)</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {menus.map((m) => (
                    <Field key={m.id} label={m.name.it}>
                      <Input
                        inputMode="decimal"
                        placeholder={price || "come base"}
                        value={prices[m.id] ?? ""}
                        onChange={(e) => setPrices({ ...prices, [m.id]: e.target.value })}
                      />
                    </Field>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Allergeni" description="Reg. UE 1169/2011 — seleziona tutti quelli presenti" />
          <div className="grid grid-cols-1 gap-2 p-5 sm:grid-cols-2">
            {ALLERGENS.map((a) => (
              <label
                key={a.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ring-1",
                  allergens.includes(a.id) ? "bg-amber-50 ring-amber-300" : "ring-slate-200 hover:bg-slate-50",
                )}
              >
                <input
                  type="checkbox"
                  className="accent-amber-600"
                  checked={allergens.includes(a.id)}
                  onChange={() => setAllergens(toggle(allergens, a.id).sort((x, y) => x - y))}
                />
                <span className="w-6 text-center">{a.icon}</span>
                <span className="text-sm">
                  <span className="mr-1 font-semibold tabular-nums">{a.id}.</span>
                  {a.name.it}
                </span>
              </label>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Varianti e aggiunte" description="Gruppi di opzioni collegati al prodotto" />
          <div className="space-y-2 p-5">
            {modifierGroups.length === 0 && (
              <p className="text-sm text-slate-500">
                Nessun gruppo. <Link className="underline" href={`${basePath}/menu/varianti`}>Crea varianti e aggiunte</Link>.
              </p>
            )}
            {modifierGroups.map((g) => (
              <Checkbox
                key={g.id}
                label={g.name.it}
                description={`${g.kind === "variant" ? "Variante" : g.kind === "addon" ? "Aggiunte" : "Rimozioni"} · ${g.options
                  .map((o) => `${o.name.it}${o.priceDeltaCents ? ` (${o.priceDeltaCents > 0 ? "+" : ""}${formatEuro(o.priceDeltaCents)})` : ""}`)
                  .join(", ")}`}
                checked={groupIds.includes(g.id)}
                onChange={() => setGroupIds(toggle(groupIds, g.id))}
              />
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Foto" description="Fino a 6, ottimizzate automaticamente" />
          <div className="space-y-3 p-5">
            <div className="grid grid-cols-3 gap-2">
              {images.map((img, i) => (
                <div key={img} className="group relative">
                  <img src={assetUrl(img)!} alt="" className="aspect-square w-full rounded-lg object-cover" />
                  {i === 0 && <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">Principale</span>}
                  <button
                    type="button"
                    onClick={() => setImages(images.filter((x) => x !== img))}
                    className="absolute right-1 top-1 rounded-full bg-white/90 px-1.5 text-xs shadow"
                    aria-label="Rimuovi foto"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {previews.map((src, i) => (
                <div key={src} className="relative">
                  <img src={src} alt="" className="aspect-square w-full rounded-lg object-cover opacity-80" />
                  <button
                    type="button"
                    onClick={() => setNewFiles(newFiles.filter((_, j) => j !== i))}
                    className="absolute right-1 top-1 rounded-full bg-white/90 px-1.5 text-xs shadow"
                    aria-label="Rimuovi foto"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            {images.length + newFiles.length < 6 && (
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []).slice(0, 6 - images.length - newFiles.length);
                  setNewFiles([...newFiles, ...files]);
                  e.target.value = "";
                }}
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Etichette e stato" />
          <div className="space-y-3 p-5">
            <div className="flex flex-wrap gap-2">
              {PRODUCT_TAG_KEYS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTags(toggle(tags, t))}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium ring-1",
                    tags.includes(t) ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-300",
                  )}
                >
                  {PRODUCT_TAGS[t].icon} {PRODUCT_TAGS[t].label.it}
                </button>
              ))}
            </div>
            <Checkbox
              label="Surgelato / abbattuto"
              description="Mostra l'asterisco e la nota obbligatoria"
              checked={isFrozen}
              onChange={(e) => setFrozen(e.target.checked)}
            />
            <Checkbox label="Disponibile" description="Se disattivo appare come Esaurito" checked={available} onChange={(e) => setAvailable(e.target.checked)} />
            <Checkbox label="Nascosto nel menu pubblico" description="Ordinabile solo dal personale" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          </div>
        </Card>

        {props.ayceEnabled && (
          <Card>
            <CardHeader title="All you can eat" />
            <div className="space-y-3 p-5">
              <Checkbox
                label="Incluso nel prezzo AYCE"
                description="Se non incluso è un extra a pagamento"
                checked={ayceIncluded}
                onChange={(e) => setAyceIncluded(e.target.checked)}
              />
              <Field label="Quantità massima per tavolo" hint="Vuoto = nessun limite">
                <Input type="number" min={1} max={99} value={ayceMax} onChange={(e) => setAyceMax(e.target.value)} />
              </Field>
            </div>
          </Card>
        )}

        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending} className="flex-1">
            {pending ? "Salvataggio…" : "Salva prodotto"}
          </Button>
          <Link href={`${basePath}/menu`} className={buttonClass("secondary")}>
            Annulla
          </Link>
        </div>
      </div>
    </form>
  );
}
