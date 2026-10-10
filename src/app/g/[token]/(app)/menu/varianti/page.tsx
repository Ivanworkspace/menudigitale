import { requireStaffPage } from "@/server/auth/require-staff";
import { loadMenuData } from "@/server/menu/repo";
import { translationAvailable } from "@/server/translate";
import { ModifiersEditor } from "./modifiers-editor";

export const metadata = { title: "Varianti e aggiunte" };

export default async function ModifiersPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { permission: "menu.edit" });
  const data = await loadMenuData(ctx.tenant.id);
  const usage: Record<string, number> = {};
  for (const p of data.products) for (const g of p.modifierGroupIds) usage[g] = (usage[g] ?? 0) + 1;
  return (
    <ModifiersEditor
      token={token}
      groups={data.modifierGroups}
      usage={usage}
      languages={ctx.modules.multilang ? ctx.tenant.settings.languages : ["it"]}
      canTranslate={ctx.modules.multilang && translationAvailable()}
    />
  );
}
