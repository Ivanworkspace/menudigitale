import { requireStaffPage } from "@/server/auth/require-staff";
import { PageHeader } from "@/components/ui/card";
import { Tabs } from "@/components/staff/tabs";

export default async function MenuLayout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { permission: "menu.edit" });
  const base = `${ctx.basePath}/menu`;
  return (
    <>
      <PageHeader title="Menu" description="Categorie, prodotti, varianti, listini e QR. Le modifiche sono subito visibili nel menu pubblico." />
      <Tabs
        items={[
          { href: base, label: "Prodotti", exact: true },
          { href: `${base}/categorie`, label: "Categorie" },
          { href: `${base}/varianti`, label: "Varianti e aggiunte" },
          { href: `${base}/listini`, label: "Menu e listini" },
          { href: `${base}/import`, label: "Importa / Esporta" },
          { href: `${base}/qr`, label: "QR del menu" },
        ]}
      />
      {children}
    </>
  );
}
