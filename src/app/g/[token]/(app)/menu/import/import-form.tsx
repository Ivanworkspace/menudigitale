"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { useAction } from "@/components/staff/use-action";
import { importProductsCsv } from "../actions";

export function ImportForm({ token }: { token: string }) {
  const router = useRouter();
  const { pending, msg, run, setMsg } = useAction();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => importProductsCsv(token, fd), {
          onOk: (r) => {
            setMsg({ tone: "success", text: `Import completato: ${r.created} nuovi, ${r.updated} aggiornati.` });
            router.refresh();
          },
        });
      }}
    >
      <Input type="file" name="file" accept=".csv,text/csv" required />
      <Button type="submit" disabled={pending}>{pending ? "Importazione…" : "Importa"}</Button>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </form>
  );
}
