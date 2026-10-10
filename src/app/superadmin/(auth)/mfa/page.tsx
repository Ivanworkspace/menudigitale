import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMfaState } from "../actions";
import { getAdminSession } from "@/server/auth/platform-admin";
import { MfaForm } from "./mfa-form";

export const metadata: Metadata = { title: "Verifica in due passaggi", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MfaPage() {
  const session = await getAdminSession();
  if (!session) redirect("/superadmin/login");
  if (session.data.mfa) redirect("/superadmin");
  const state = await getMfaState();
  if (state.kind === "none") redirect("/superadmin/login");
  return <MfaForm state={state} />;
}
