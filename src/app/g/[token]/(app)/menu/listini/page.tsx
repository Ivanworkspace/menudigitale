import { requireStaffPage } from "@/server/auth/require-staff";
import { loadMenuData } from "@/server/menu/repo";
import { MenusEditor } from "./menus-editor";

export const metadata = { title: "Menu e listini" };

export default async function MenusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { permission: "menu.edit" });
  const data = await loadMenuData(ctx.tenant.id);
  return (
    <MenusEditor
      token={token}
      menus={data.menus}
      languages={ctx.modules.multilang ? ctx.tenant.settings.languages : ["it"]}
      ayceEnabled={ctx.modules.orders}
    />
  );
}
