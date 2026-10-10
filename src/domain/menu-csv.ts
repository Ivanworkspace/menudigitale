/**
 * Product import/export format (opens directly in Excel: ";" + BOM).
 *
 * Columns: id | categoria | nome_it | descrizione_it | [nome_xx | descrizione_xx]… |
 *          prezzo | iva | reparto | allergeni | tag | surgelato | disponibile
 *  - prezzo: "8,50"   - iva: 4 | 5 | 10 | 22
 *  - allergeni: numbers 1–14 separated by "|"   - tag: keys separated by "|"
 *  - surgelato / disponibile: sì/no
 *  - id empty = new product; id present = update that product
 */
import { parseCsv, toCsv } from "./csv";
import { ALLERGEN_IDS, PRODUCT_TAG_KEYS, VAT_RATES_BP, type I18n, type Product, type ProductTag } from "./menu";

export type CsvProductRow = {
  id: string | null;
  category: string;
  name: I18n;
  description: I18n;
  priceCents: number;
  vatRateBp: number;
  department: string | null;
  allergens: number[];
  tags: ProductTag[];
  isFrozen: boolean;
  available: boolean;
};

const yes = (v: string) => /^(s[iì]|si|yes|y|1|true|x)$/i.test(v.trim());

function parsePrice(v: string): number | null {
  const s = v.trim().replace(/[€\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

export function parseProductsCsv(text: string): { rows: CsvProductRow[]; errors: string[] } {
  const table = parseCsv(text);
  const errors: string[] = [];
  if (table.length < 2) return { rows: [], errors: ["Il file è vuoto."] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  for (const required of ["categoria", "nome_it", "prezzo"]) {
    if (col(required) < 0) errors.push(`Colonna mancante: ${required}`);
  }
  if (errors.length) return { rows: [], errors };
  const langs = header.filter((h) => /^nome_[a-z]{2}$/.test(h)).map((h) => h.slice(5));

  const rows: CsvProductRow[] = [];
  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    const get = (name: string) => (col(name) >= 0 ? (r[col(name)] ?? "").trim() : "");
    const name: I18n = {};
    const description: I18n = {};
    for (const l of langs) {
      if (get(`nome_${l}`)) name[l] = get(`nome_${l}`).slice(0, 100);
      if (get(`descrizione_${l}`)) description[l] = get(`descrizione_${l}`).slice(0, 600);
    }
    if (!name.it) return errors.push(`Riga ${line}: nome_it mancante`);
    if (!get("categoria")) return errors.push(`Riga ${line}: categoria mancante`);
    const price = parsePrice(get("prezzo"));
    if (price === null) return errors.push(`Riga ${line}: prezzo non valido`);
    const vatPct = get("iva") ? Number(get("iva").replace("%", "").replace(",", ".")) : 10;
    const vatRateBp = Math.round(vatPct * 100);
    if (!(VAT_RATES_BP as readonly number[]).includes(vatRateBp)) return errors.push(`Riga ${line}: IVA non valida`);
    const allergens = get("allergeni")
      .split(/[|,\s]+/)
      .filter(Boolean)
      .map(Number);
    if (allergens.some((a) => !(ALLERGEN_IDS as number[]).includes(a))) return errors.push(`Riga ${line}: allergeni non validi (1–14)`);
    const tags = get("tag")
      .split(/[|,\s]+/)
      .filter(Boolean) as ProductTag[];
    if (tags.some((t) => !PRODUCT_TAG_KEYS.includes(t))) return errors.push(`Riga ${line}: tag non validi`);
    rows.push({
      id: get("id") || null,
      category: get("categoria").slice(0, 80),
      name,
      description,
      priceCents: price,
      vatRateBp,
      department: get("reparto") || null,
      allergens: [...new Set(allergens)],
      tags: [...new Set(tags)],
      isFrozen: yes(get("surgelato")),
      available: get("disponibile") === "" ? true : yes(get("disponibile")),
    });
  });
  return { rows, errors };
}

export function exportProductsCsv(
  products: Product[],
  categoryName: (id: string) => string,
  departmentName: (id: string | null) => string,
  langs: string[],
): string {
  const extra = langs.filter((l) => l !== "it");
  const header = [
    "id", "categoria", "nome_it", "descrizione_it",
    ...extra.flatMap((l) => [`nome_${l}`, `descrizione_${l}`]),
    "prezzo", "iva", "reparto", "allergeni", "tag", "surgelato", "disponibile",
  ];
  const rows = products.map((p) => [
    p.id,
    categoryName(p.categoryId),
    p.name.it ?? "",
    p.description.it ?? "",
    ...extra.flatMap((l) => [p.name[l] ?? "", p.description[l] ?? ""]),
    (p.priceCents / 100).toFixed(2).replace(".", ","),
    p.vatRateBp / 100,
    departmentName(p.departmentId),
    p.allergens.join("|"),
    p.tags.join("|"),
    p.isFrozen ? "sì" : "no",
    p.available ? "sì" : "no",
  ]);
  return toCsv([header, ...rows]);
}
