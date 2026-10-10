"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/ui/icon";
import { I18nField } from "@/components/staff/i18n-field";
import { SortableList } from "@/components/staff/sortable-list";
import { VisibilityEditor } from "@/components/staff/visibility-editor";
import { useAction } from "@/components/staff/use-action";
import type { Category, I18n, Menu, Visibility } from "@/domain/menu";
import { deleteCategory, reorder, saveCategory, translate } from "../actions";

type Draft = {
  id?: string;
  name: I18n;
  description: I18n;
  parentId: string | null;
  icon: string;
  active: boolean;
  visibility: Visibility | null;
  menuIds: string[];
};

const emptyDraft = (): Draft => ({ name: { it: "" }, description: {}, parentId: null, icon: "", active: true, visibility: null, menuIds: [] });

export function CategoriesEditor({
  token,
  categories,
  menus,
  counts,
  languages,
  canTranslate,
}: {
  token: string;
  categories: Category[];
  menus: Menu[];
  counts: Record<string, number>;
  languages: string[];
  canTranslate: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(categories);
  const [prev, setPrev] = useState(categories);
  if (prev !== categories) {
    setPrev(categories);
    setItems(categories);
  }
  const [draft, setDraft] = useState<Draft | null>(null);
  const { pending, msg, run } = useAction();
  const modal = useAction();

  const onTranslate = canTranslate
    ? async (text: string, target: string) => {
        const r = await translate(token, [text], target);
        return r.ok ? r.data[0] : null;
      }
    : undefined;

  const visLabel = (v: Visibility | null) => {
    if (!v) return null;
    const days = v.weekdays.length ? v.weekdays.map((d) => ["", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"][d]).join(" ") : "";
    return `${days} ${v.from ?? ""}–${v.to ?? ""}`.trim();
  };

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">Trascina per cambiare l&apos;ordine nel menu.</p>
        <Button size="sm" onClick={() => setDraft(emptyDraft())}>
          <Icon name="plus" className="h-4 w-4" /> Nuova categoria
        </Button>
      </div>
      {msg && <div className="mb-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <Card className="divide-y divide-slate-100">
        {items.length === 0 && <p className="px-5 py-10 text-center text-sm text-slate-500">Nessuna categoria.</p>}
        <SortableList
          items={items}
          onReorder={(ids) => {
            setItems(ids.map((id) => items.find((c) => c.id === id)!));
            run(() => reorder(token, "categories", ids));
          }}
          render={(c, handle) => (
            <div className="flex items-center gap-3 bg-white px-3 py-3">
              {handle}
              <span className="w-6 text-center text-lg">{c.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">
                  {c.parentId && <span className="text-slate-400">{items.find((x) => x.id === c.parentId)?.name.it} › </span>}
                  {c.name.it}
                </p>
                <p className="flex flex-wrap gap-1.5 text-xs text-slate-500">
                  {counts[c.id] ?? 0} prodotti
                  {!c.active && <Badge tone="red">Nascosta</Badge>}
                  {c.visibility && <Badge tone="sky">⏰ {visLabel(c.visibility)}</Badge>}
                  {c.menuIds.map((m) => (
                    <Badge key={m} tone="violet">{menus.find((x) => x.id === m)?.name.it}</Badge>
                  ))}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setDraft({
                    id: c.id, name: c.name, description: c.description ?? {}, parentId: c.parentId, icon: c.icon ?? "",
                    active: c.active, visibility: c.visibility, menuIds: c.menuIds ?? [],
                  })
                }
              >
                Modifica
              </Button>
            </div>
          )}
        />
      </Card>

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Modifica categoria" : "Nuova categoria"}
        footer={
          draft && (
            <>
              {draft.id && (
                <Button
                  variant="danger"
                  size="sm"
                  className="mr-auto"
                  disabled={modal.pending}
                  onClick={() => {
                    if (!confirm("Eliminare la categoria?")) return;
                    modal.run(() => deleteCategory(token, draft.id!), { onOk: () => { setDraft(null); router.refresh(); } });
                  }}
                >
                  Elimina
                </Button>
              )}
              <Button variant="ghost" onClick={() => setDraft(null)}>Annulla</Button>
              <Button
                disabled={modal.pending}
                onClick={() =>
                  modal.run(() => saveCategory(token, { ...draft, icon: draft.icon.trim() || null }), {
                    onOk: () => {
                      setDraft(null);
                      router.refresh();
                    },
                  })
                }
              >
                Salva
              </Button>
            </>
          )
        }
      >
        {draft && (
          <div className="space-y-4">
            <div className="grid grid-cols-[80px_1fr] gap-3">
              <Field label="Icona">
                <Input value={draft.icon} maxLength={4} placeholder="🍕" onChange={(e) => setDraft({ ...draft, icon: e.target.value })} />
              </Field>
              <I18nField label="Nome" required value={draft.name} onChange={(name) => setDraft({ ...draft, name })} languages={languages} onTranslate={onTranslate} />
            </div>
            <I18nField
              label="Descrizione"
              multiline
              value={draft.description}
              onChange={(description) => setDraft({ ...draft, description })}
              languages={languages}
              onTranslate={onTranslate}
            />
            <Field label="Sottocategoria di">
              <Select value={draft.parentId ?? ""} onChange={(e) => setDraft({ ...draft, parentId: e.target.value || null })}>
                <option value="">— Nessuna (categoria principale)</option>
                {items
                  .filter((c) => c.id !== draft.id && !c.parentId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name.it}</option>
                  ))}
              </Select>
            </Field>
            {menus.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Compare nei menu</p>
                <div className="flex flex-wrap gap-3">
                  {menus.map((m) => (
                    <Checkbox
                      key={m.id}
                      label={m.name.it}
                      checked={draft.menuIds.includes(m.id)}
                      onChange={(e) =>
                        setDraft({ ...draft, menuIds: e.target.checked ? [...draft.menuIds, m.id] : draft.menuIds.filter((x) => x !== m.id) })
                      }
                    />
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-500">Nessuna selezione = compare in tutti i menu.</p>
              </div>
            )}
            <VisibilityEditor value={draft.visibility} onChange={(visibility) => setDraft({ ...draft, visibility })} />
            <Checkbox label="Visibile nel menu" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
            {modal.msg && <Alert tone={modal.msg.tone}>{modal.msg.text}</Alert>}
          </div>
        )}
      </Modal>
      {pending && <span className="sr-only">Salvataggio…</span>}
    </>
  );
}
