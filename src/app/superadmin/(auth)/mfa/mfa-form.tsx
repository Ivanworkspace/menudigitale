"use client";
/* eslint-disable @next/next/no-img-element */
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { cancelAdminLogin, verifyAdminMfa, type MfaState } from "../actions";

export function MfaForm({ state }: { state: Exclude<MfaState, { kind: "none" }> }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const code = String(new FormData(e.currentTarget).get("code"));
        start(async () => setError(await verifyAdminMfa(code)));
      }}
    >
      <h1 className="text-lg font-semibold text-slate-900">Verifica in due passaggi</h1>
      {state.kind === "enroll" ? (
        <div className="space-y-3 text-sm text-slate-600">
          <p>Primo accesso: inquadra il codice con un&apos;app di autenticazione (Google Authenticator, 1Password, Authy…).</p>
          <img src={state.qr} alt="Codice QR per l'autenticazione" className="mx-auto h-44 w-44" />
          <p className="break-all rounded bg-slate-50 p-2 text-center font-mono text-xs">{state.secret}</p>
        </div>
      ) : (
        <p className="text-sm text-slate-600">Inserisci il codice a 6 cifre generato dalla tua app di autenticazione.</p>
      )}
      <Field label="Codice" htmlFor="code">
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          autoFocus
          className="text-center font-mono text-lg tracking-widest"
        />
      </Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Verifica…" : "Verifica"}
      </Button>
      <button type="button" onClick={() => start(() => cancelAdminLogin())} className="w-full text-center text-xs text-slate-500 hover:text-slate-700">
        Annulla ed esci
      </button>
    </form>
  );
}
