"use client";
import { useState, useTransition } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { clientAuth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { startAdminLogin } from "../actions";

export function LoginForm({ initialError }: { initialError: string | null }) {
  const [error, setError] = useState<string | null>(initialError);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          setError(null);
          const auth = clientAuth();
          try {
            const cred = await signInWithEmailAndPassword(auth, String(fd.get("email")), String(fd.get("password")));
            const idToken = await cred.user.getIdToken();
            await signOut(auth); // the server session takes over from here
            const err = await startAdminLogin(idToken);
            if (err) setError(err);
          } catch (e) {
            const code = (e as { code?: string }).code ?? "";
            setError(
              code === "auth/too-many-requests"
                ? "Troppi tentativi. Riprova più tardi."
                : code.startsWith("auth/")
                  ? "Email o password non corretti."
                  : "Accesso non riuscito.",
            );
          }
        });
      }}
    >
      <h1 className="text-lg font-semibold text-slate-900">Accedi</h1>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Accesso in corso…" : "Continua"}
      </Button>
    </form>
  );
}
