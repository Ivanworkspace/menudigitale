"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/ui/icon";
import { Toggle } from "@/components/ui/toggle";
import { I18nField } from "@/components/staff/i18n-field";
import { useAction } from "@/components/staff/use-action";
import { formatEuro, parseEuroToCents } from "@/lib/format";
import type { I18n, ModifierGroup } from "@/domain/menu";
import { deleteModifierGroup, saveModifierGroup, translate } from "../actions";

type OptDraft = { id: string; name: I18n; price: string; available: boolean };
type Draft = { id?: string; name: I18n; kind: ModifierGroup["kind"]; minSelect: number; maxSelect: number; options: OptDraft[] };

const KIND_LABEL = { variant: "Variante (es. formato)", addon: "Aggiunte a pagamento", removal: "Rimozioni (senza…)" };
const newOptId = () => Math.random().toString(36).slice(2, 10);

export function ModifiersEditor({
  token,
  groups,
  usage,
  languages,
  canTranslate,
}: {
  token: string;
  groups: ModifierGroup[];
  usage: Record<string, number>;
  languages: string[];
  canTranslate: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const modal = useAction();
  const onTranslate = canTranslate
    ? async (text: string, target: string) => {
        const r = await translate(token, [text], target);
        return r.ok ? r.data[0] : null;
      }
    : undefined;

  const open = (g?: ModifierGroup) =>
    setDraft(
      g
        ? {
            id: g.id, name: g.name, kind: g.kind, minSelect: g.minSelect, maxSelect: g.maxSelect,
            options: g.options.map((o) => ({
              id: o.id, name: o.name, available: o.available,
              price: o.priceDeltaCents ? (o.priceDeltaCents / 100).toFixed(2).replace(".", ",") : "",
            })),
          }
        : { name: { it: "" }, kind: "addon", minSelect: 0, maxSelect: 3, options: [{ id: newOptId(), name: { it: "" }, price: "", available: true }] },
    );

  const save = () => {
    if (!draft) return;
    const options: { id: string; name: I18n; priceDeltaCents: number; available: boolean }[] = [];
    for (const o of draft.options) {
      const neg = o.price.trim().startsWith("-");
      const cents = o.price.trim() ? parseEuroToCents(o.price.replace("-", "")) : 0;
      if (cents === null) return modal.setMsg({ tone: "danger", text: `Prezzo non valido per "${o.name.it}".` });
      options.push({ id: o.id, name: o.name, priceDeltaCents: neg ? -cents : cents, available: o.available });
    }
    modal.run(() => saveModifierGroup(token, { id: draft.id, name: draft.name, kind: draft.kind, minSelect: draft.minSelect, maxSelect: draft.maxSelect, options }), {
      onOk: () => {
        setDraft(null);
        router.refresh();
      },
    });
  };

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">Gruppi di opzioni riutilizzabili su più prodotti (formati, impasti, aggiunte, senza…).</p>
        <Button size="sm" onClick={() => open()}>
          <Icon name="plus" className="h-4 w-4" /> Nuovo gruppo
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {groups.length === 0 && <Card className="px-5 py-10 text-center text-sm text-slate-500 md:col-span-2">Nessun gruppo.</Card>}
        {groups.map((g) => (
          <Card key={g.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-slate-900">{g.name.it}</p>
                <p className="text-xs text-slate-500">
                  {KIND_LABEL[g.kind]} · scelta {g.minSelect}–{g.maxSelect} · usato da {usage[g.id] ?? 0} prodotti
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => open(g)}>Modifica</Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {g.options.map((o) => (
                <Badge key={o.id} tone={o.available ? "slate" : "red"}>
                  {o.name.it}
                  {o.priceDeltaCents ? ` ${o.priceDeltaCents > 0 ? "+" : ""}${formatEuro(o.priceDeltaCents)}` : ""}
                </Badge>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        wide
        title={draft?.id ? "Modifica gruppo" : "Nuovo gruppo"}
        footer={
          draft && (
            <>
              {draft.id && (
                <Button
                  variant="danger"
                  size="sm"
                  className="mr-auto"
                  onClick={() => {
                    if (!confirm("Eliminare il gruppo?")) return;
                    modal.run(() => deleteModifierGroup(token, draft.id!), { onOk: () => { setDraft(null); router.refresh(); } });
                  }}
                >
                  Elimina
                </Button>
              )}
              <Button variant="ghost" onClick={() => setDraft(null)}>Annulla</Button>
              <Button disabled={modal.pending} onClick={save}>Salva</Button>
            </>
          )
        }
      >
        {draft && (
          <div className="space-y-4">
            <I18nField label="Nome del gruppo" required value={draft.name} onChange={(name) => setDraft({ ...draft, name })} languages={languages} onTranslate={onTranslate} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Tipo">
                <Select
                  value={draft.kind}
                  onChange={(e) => {
                    const kind = e.target.value as Draft["kind"];
                    setDraft({ ...draft, kind, ...(kind === "variant" ? { minSelect: 1, maxSelect: 1 } : {}) });
                  }}
                >
                  {Object.entries(KIND_LABEL).map(([k, l]) => (
                    <option key={k} value={k}>{l}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Minimo da scegliere" hint="1 = obbligatorio">
                <Input type="number" min={0} max={20} value={draft.minSelect} onChange={(e) => setDraft({ ...draft, minSelect: Number(e.target.value) })} />
              </Field>
              <Field label="Massimo">
                <Input type="number" min={1} max={20} value={draft.maxSelect} onChange={(e) => setDraft({ ...draft, maxSelect: Number(e.target.value) })} />
              </Field>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700">Opzioni</p>
              {draft.options.map((o, i) => (
                <div key={o.id} className="grid grid-cols-[1fr_110px_auto_auto] items-end gap-2 rounded-lg bg-slate-50 p-3">
                  <I18nField
                    label={`Opzione ${i + 1}`}
                    value={o.name}
                    onChange={(name) => setDraft({ ...draft, options: draft.options.map((x) => (x.id === o.id ? { ...x, name } : x)) })}
                    languages={languages}
                    onTranslate={onTranslate}
                  />
                  <Field label="± Prezzo €">
                    <Input
                      inputMode="decimal"
                      placeholder="0,00"
                      value={o.price}
                      onChange={(e) => setDraft({ ...draft, options: draft.options.map((x) => (x.id === o.id ? { ...x, price: e.target.value } : x)) })}
                    />
                  </Field>
                  <div className="pb-2">
                    <Toggle
                      size="sm"
                      label="Disponibile"
                      checked={o.available}
                      onChange={(available) => setDraft({ ...draft, options: draft.options.map((x) => (x.id === o.id ? { ...x, available } : x)) })}
                    />
                  </div>
                  <button
                    type="button"
                    className="pb-2 text-slate-400 hover:text-red-600"
                    aria-label="Rimuovi opzione"
                    onClick={() => setDraft({ ...draft, options: draft.options.filter((x) => x.id !== o.id) })}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDraft({ ...draft, options: [...draft.options, { id: newOptId(), name: { it: "" }, price: "", available: true }] })}
              >
                + Aggiungi opzione
              </Button>
            </div>
            {modal.msg && <Alert tone={modal.msg.tone}>{modal.msg.text}</Alert>}
          </div>
        )}
      </Modal>
    </>
  );
}
