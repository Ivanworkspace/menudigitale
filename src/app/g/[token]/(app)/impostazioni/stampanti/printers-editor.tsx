"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { CopyButton } from "@/components/ui/copy-button";
import { useAction } from "@/components/staff/use-action";
import { formatRelative } from "@/lib/format";
import type { Printer } from "@/server/printing";
import type { Department } from "@/domain/menu";
import { deletePrinter, generatePrintKey, savePrintNodeKey, savePrinter, testPrinter } from "../actions";

type Draft = Omit<Printer, "id"> & { id?: string };
const empty = (): Draft => ({ name: "", transport: "network", host: "", port: 9100, printNodeId: null, departmentIds: [], width: 42, active: true });

export function PrintersEditor(props: {
  token: string;
  printers: Printer[];
  departments: Department[];
  hasKey: boolean;
  lastSeenAt: string | null;
  hasPrintNode: boolean;
  failedJobs: { id: string; error: string; createdAt: string }[];
}) {
  const { token } = props;
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [pnKey, setPnKey] = useState("");
  const { pending, msg, run } = useAction();
  const modal = useAction();
  const online = props.lastSeenAt && Date.now() - new Date(props.lastSeenAt).getTime() < 60_000;
  const dep = new Map(props.departments.map((d) => [d.id, d.name]));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">Ogni stampante riceve le comande dei reparti assegnati.</p>
          <Button size="sm" onClick={() => setDraft(empty())}>+ Stampante</Button>
        </div>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        {props.printers.length === 0 && <Card className="px-5 py-10 text-center text-sm text-slate-500">Nessuna stampante: le comande appaiono solo sullo schermo della cucina.</Card>}
        {props.printers.map((p) => (
          <Card key={p.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="flex-1">
              <p className="font-medium">
                🖨️ {p.name} {!p.active && <Badge tone="red">Disattiva</Badge>}
              </p>
              <p className="text-xs text-slate-500">
                {p.transport === "network" ? `${p.host}:${p.port}` : `PrintNode #${p.printNodeId}`} · {p.width === 32 ? "58 mm" : "80 mm"} ·{" "}
                {p.departmentIds.map((d) => dep.get(d)).filter(Boolean).join(", ") || "nessun reparto"}
              </p>
            </div>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => testPrinter(token, p.id), { success: "Stampa di prova in coda." })}>
              Prova
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft({ ...p })}>Modifica</Button>
          </Card>
        ))}
        {props.failedJobs.length > 0 && (
          <Alert tone="warning" title="Stampe non riuscite">
            {props.failedJobs.map((j) => `${new Date(j.createdAt).toLocaleTimeString("it-IT")}: ${j.error}`).join(" · ")}
          </Alert>
        )}
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Print server locale" description="Per stampanti di rete (Ethernet/Wi-Fi) ESC/POS" />
          <div className="space-y-3 p-5 text-sm">
            <p>
              Stato:{" "}
              {props.lastSeenAt ? (
                <Badge tone={online ? "green" : "amber"}>{online ? "Collegato" : `Ultimo contatto ${formatRelative(props.lastSeenAt)}`}</Badge>
              ) : (
                <Badge>Mai collegato</Badge>
              )}
            </p>
            {key ? (
              <Alert tone="warning" title="Chiave del print server (mostrata solo ora)">
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 break-all text-xs">{key}</code>
                  <CopyButton value={key} />
                </div>
              </Alert>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => (!props.hasKey || confirm("La chiave attuale smetterà di funzionare. Continuare?")) && run(() => generatePrintKey(token), { onOk: (r) => setKey(r.key) })}
              >
                {props.hasKey ? "Rigenera chiave" : "Genera chiave"}
              </Button>
            )}
            <p className="text-xs text-slate-500">Avvia sul computer del locale: <code>APP_URL=… PRINT_KEY=… node index.mjs</code> (cartella print-server).</p>
          </div>
        </Card>
        <Card>
          <CardHeader title="PrintNode (opzionale)" description="Stampa in cloud senza computer locale" />
          <form className="space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); run(() => savePrintNodeKey(token, pnKey), { success: "Chiave salvata.", onOk: () => setPnKey("") }); }}>
            <Input type="password" value={pnKey} onChange={(e) => setPnKey(e.target.value)} placeholder={props.hasPrintNode ? "•••••••• (configurata)" : "API key PrintNode"} autoComplete="off" />
            <Button size="sm" variant="secondary" type="submit" disabled={pending}>Salva</Button>
          </form>
        </Card>
      </div>

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Modifica stampante" : "Nuova stampante"}
        footer={
          draft && (
            <>
              {draft.id && (
                <Button variant="danger" size="sm" className="mr-auto" onClick={() => confirm("Eliminare la stampante?") && modal.run(() => deletePrinter(token, draft.id!), { onOk: () => { setDraft(null); router.refresh(); } })}>
                  Elimina
                </Button>
              )}
              <Button variant="ghost" onClick={() => setDraft(null)}>Annulla</Button>
              <Button disabled={modal.pending} onClick={() => modal.run(() => savePrinter(token, { ...draft, host: draft.host ?? "" }), { onOk: () => { setDraft(null); router.refresh(); } })}>
                Salva
              </Button>
            </>
          )
        }
      >
        {draft && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Cucina" /></Field>
              <Field label="Collegamento">
                <Select value={draft.transport} onChange={(e) => setDraft({ ...draft, transport: e.target.value as Draft["transport"] })}>
                  <option value="network">Rete locale (print server)</option>
                  <option value="printnode">PrintNode</option>
                </Select>
              </Field>
              {draft.transport === "network" ? (
                <>
                  <Field label="Indirizzo IP"><Input value={draft.host ?? ""} onChange={(e) => setDraft({ ...draft, host: e.target.value })} placeholder="192.168.1.50" /></Field>
                  <Field label="Porta"><Input type="number" value={draft.port} onChange={(e) => setDraft({ ...draft, port: Number(e.target.value) })} /></Field>
                </>
              ) : (
                <Field label="ID stampante PrintNode"><Input type="number" value={draft.printNodeId ?? ""} onChange={(e) => setDraft({ ...draft, printNodeId: e.target.value ? Number(e.target.value) : null })} /></Field>
              )}
              <Field label="Carta">
                <Select value={draft.width} onChange={(e) => setDraft({ ...draft, width: Number(e.target.value) as Draft["width"] })}>
                  <option value={42}>80 mm</option>
                  <option value={32}>58 mm</option>
                  <option value={48}>80 mm (font piccolo)</option>
                </Select>
              </Field>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Reparti</p>
              <div className="flex flex-wrap gap-3">
                {props.departments.map((d) => (
                  <Checkbox
                    key={d.id}
                    label={d.name}
                    checked={draft.departmentIds.includes(d.id)}
                    onChange={(e) => setDraft({ ...draft, departmentIds: e.target.checked ? [...draft.departmentIds, d.id] : draft.departmentIds.filter((x) => x !== d.id) })}
                  />
                ))}
              </div>
            </div>
            <Checkbox label="Attiva" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
            {modal.msg && <Alert tone={modal.msg.tone}>{modal.msg.text}</Alert>}
          </div>
        )}
      </Modal>
    </div>
  );
}
