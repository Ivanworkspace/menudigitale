"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { I18nField } from "@/components/staff/i18n-field";
import { SortableList } from "@/components/staff/sortable-list";
import { VisibilityEditor } from "@/components/staff/visibility-editor";
import { useAction } from "@/components/staff/use-action";
import type { I18n, Menu, Visibility } from "@/domain/menu";
import { deleteMenu, reorder, saveMenu } from "../actions";

type Draft = { id?: string; name: I18n; kind: Menu["kind"]; active: boolean; schedule: Visibility | null };
const KIND = { dine_in: "Al tavolo", ayce: "All you can eat", takeaway: "Asporto" };

export function MenusEditor({ token, menus, languages, ayceEnabled }: { token: string; menus: Menu[]; languages: string[]; ayceEnabled: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const { msg, run } = useAction();
  const modal = useAction();

  return (
    <>
      <Alert tone="info" title="Come funzionano">
        Ogni menu (es. Pranzo, Cena, Asporto) può avere un proprio listino: nella scheda prodotto puoi indicare un prezzo diverso per
        ciascun menu. Nelle categorie scegli in quali menu compaiono. Con l&apos;orario, il menu giusto viene proposto automaticamente.
      </Alert>
      <div className="my-4 flex justify-end">
        <Button size="sm" onClick={() => setDraft({ name: { it: "" }, kind: "dine_in", active: true, schedule: null })}>
          + Nuovo menu
        </Button>
      </div>
      {msg && <div className="mb-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <Card className="divide-y divide-slate-100">
        {menus.length === 0 && <p className="px-5 py-10 text-center text-sm text-slate-500">Un unico menu per tutto il giorno. Aggiungine se ti servono listini diversi.</p>}
        <SortableList
          items={menus}
          onReorder={(ids) => run(() => reorder(token, "menus", ids), { onOk: () => router.refresh() })}
          render={(m, handle) => (
            <div className="flex items-center gap-3 bg-white px-3 py-3">
              {handle}
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900">{m.name.it}</p>
                <p className="flex flex-wrap gap-1.5 text-xs text-slate-500">
                  {KIND[m.kind]}
                  {!m.active && <Badge tone="red">Non attivo</Badge>}
                  {m.schedule && <Badge tone="sky">⏰ {m.schedule.from}–{m.schedule.to}</Badge>}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setDraft({ id: m.id, name: m.name, kind: m.kind, active: m.active, schedule: m.schedule })}>
                Modifica
              </Button>
            </div>
          )}
        />
      </Card>
      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Modifica menu" : "Nuovo menu"}
        footer={
          draft && (
            <>
              {draft.id && (
                <Button
                  variant="danger"
                  size="sm"
                  className="mr-auto"
                  onClick={() => {
                    if (!confirm("Eliminare il menu? I prezzi di listino collegati verranno rimossi.")) return;
                    modal.run(() => deleteMenu(token, draft.id!), { onOk: () => { setDraft(null); router.refresh(); } });
                  }}
                >
                  Elimina
                </Button>
              )}
              <Button variant="ghost" onClick={() => setDraft(null)}>Annulla</Button>
              <Button disabled={modal.pending} onClick={() => modal.run(() => saveMenu(token, draft), { onOk: () => { setDraft(null); router.refresh(); } })}>
                Salva
              </Button>
            </>
          )
        }
      >
        {draft && (
          <div className="space-y-4">
            <I18nField label="Nome" required value={draft.name} onChange={(name) => setDraft({ ...draft, name })} languages={languages} />
            <Field label="Tipo">
              <Select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Menu["kind"] })}>
                {Object.entries(KIND)
                  .filter(([k]) => k !== "ayce" || ayceEnabled)
                  .map(([k, l]) => (
                    <option key={k} value={k}>{l}</option>
                  ))}
              </Select>
            </Field>
            <VisibilityEditor label="Proponi automaticamente in questa fascia" value={draft.schedule} onChange={(schedule) => setDraft({ ...draft, schedule })} />
            <Checkbox label="Attivo" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
            {modal.msg && <Alert tone={modal.msg.tone}>{modal.msg.text}</Alert>}
          </div>
        )}
      </Modal>
    </>
  );
}
