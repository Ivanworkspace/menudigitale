import { requireStaffPage } from "@/server/auth/require-staff";
import { ImportForm } from "./import-form";
import { Card, CardHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { ALLERGENS, PRODUCT_TAGS } from "@/domain/menu";

export const metadata = { title: "Importa / Esporta" };

export default async function ImportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { permission: "menu.edit" });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Esporta" description="Scarica tutti i prodotti in un file apribile con Excel" />
        <div className="p-5">
          <a href={`${ctx.basePath}/menu/export`} className={buttonClass("secondary")}>Scarica CSV</a>
          <p className="mt-3 text-xs text-slate-500">Puoi modificarlo e reimportarlo: le righe con «id» aggiornano i prodotti esistenti.</p>
        </div>
      </Card>
      <Card>
        <CardHeader title="Importa" description="Crea o aggiorna prodotti da file CSV (Excel: Salva come → CSV)" />
        <div className="p-5">
          <ImportForm token={token} />
        </div>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader title="Formato del file" />
        <div className="space-y-3 p-5 text-sm text-slate-600">
          <p>
            Prima riga con le intestazioni. Colonne obbligatorie: <code>categoria</code>, <code>nome_it</code>, <code>prezzo</code>.
            Facoltative: <code>id</code>, <code>descrizione_it</code>, <code>nome_en</code>, <code>descrizione_en</code> (e altre lingue),
            <code> iva</code> (4, 5, 10, 22), <code>reparto</code>, <code>allergeni</code>, <code>tag</code>, <code>surgelato</code>, <code>disponibile</code>.
          </p>
          <p>
            Allergeni: numeri separati da «|» —{" "}
            {ALLERGENS.map((a) => `${a.id} ${a.name.it}`).join(", ")}.
          </p>
          <p>Tag: {Object.keys(PRODUCT_TAGS).join(", ")} (separati da «|»). Le categorie mancanti vengono create automaticamente.</p>
        </div>
      </Card>
    </div>
  );
}
