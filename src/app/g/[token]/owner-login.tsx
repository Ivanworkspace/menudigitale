"use client";
import { LoginScreen } from "./login-screen";
import { loginOwner } from "./actions";

export function OwnerLogin({ token, name, logoUrl, ownerApp = false }: { token: string; name: string; logoUrl: string | null; ownerApp?: boolean }) {
  return (
    <LoginScreen
      title={name}
      subtitle="Inserisci il PIN del titolare"
      logoUrl={logoUrl}
      onSubmit={(pin) => loginOwner(token, pin, ownerApp ? "titolare" : "dashboard")}
      footer={{ href: `/g/${token}/staff`, label: "Accesso personale →" }}
    />
  );
}
