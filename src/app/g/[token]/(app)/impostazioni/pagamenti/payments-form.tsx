"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/field";
import { useAction } from "@/components/staff/use-action";
import { FISCAL_WARNING, PAYMENT_LABELS, type PaymentMethod } from "@/domain/billing";
import { savePaymentMethods } from "../actions";

const TILL: PaymentMethod[] = ["cash", "card", "satispay", "paypal", "voucher", "other"];

export function PaymentsForm({ token, methods }: { token: string; methods: string[] }) {
  const [list, setList] = useState(methods);
  const m = useAction();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Metodi di pagamento in cassa" />
        <form className="space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); m.run(() => savePaymentMethods(token, list), { success: "Salvato." }); }}>
          {TILL.map((k) => (
            <Checkbox key={k} label={PAYMENT_LABELS[k]} checked={list.includes(k)} onChange={(e) => setList(e.target.checked ? [...list, k] : list.filter((x) => x !== k))} />
          ))}
          {m.msg && <Alert tone={m.msg.tone}>{m.msg.text}</Alert>}
          <Button type="submit" disabled={m.pending}>Salva</Button>
        </form>
      </Card>
      <div className="lg:col-span-2">
        <Alert tone="warning" title="Nota fiscale">
          {FISCAL_WARNING} Il collegamento ai registratori telematici (Epson FP-RT, Custom) è predisposto e verrà completato in una fase successiva.
        </Alert>
      </div>
    </div>
  );
}
