import { requireStaffPage } from "@/server/auth/require-staff";
import { LegalForm } from "./legal-form";

export const metadata = { title: "Testi legali" };

export default async function LegalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { tenant } = await requireStaffPage(token, { permission: "settings.manage" });
  return <LegalForm token={token} initial={{ privacyText: tenant.settings.privacyText ?? "", cookieText: tenant.settings.cookieText ?? "" }} />;
}
