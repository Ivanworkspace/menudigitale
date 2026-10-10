export const MODULE_KEYS = [
  "orders", "kds", "billing", "payments", "reservations",
  "loyalty", "inventory", "advanced_stats", "multilang",
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_LABELS: Record<ModuleKey, { label: string; description: string }> = {
  orders: { label: "Ordini", description: "Ordini al tavolo da QR e dal cameriere, modalità AYCE" },
  kds: { label: "Cucina e bar (KDS)", description: "Schermi di reparto, stati comande, stampa" },
  billing: { label: "Conti", description: "Preconto, conti separati, alla romana, sconti" },
  payments: { label: "Pagamenti", description: "Incassi in cassa: contanti, carta, Satispay, pagamenti misti" },
  reservations: { label: "Prenotazioni", description: "Calendario e prenotazione online" },
  loyalty: { label: "Clienti e fidelity", description: "Anagrafica, punti, promozioni, codici sconto" },
  inventory: { label: "Magazzino", description: "Ingredienti, ricette, scorte, esaurimento automatico" },
  advanced_stats: { label: "Statistiche avanzate", description: "Analisi, confronti, export" },
  multilang: { label: "Multilingua", description: "Menu in più lingue con traduzione assistita" },
};

export type ModuleFlags = Record<ModuleKey, boolean>;

export function toModuleFlags(rows: { module: string; enabled: boolean }[]): ModuleFlags {
  const flags = Object.fromEntries(MODULE_KEYS.map((k) => [k, false])) as ModuleFlags;
  for (const r of rows) if ((MODULE_KEYS as readonly string[]).includes(r.module)) flags[r.module as ModuleKey] = r.enabled;
  return flags;
}

export const MENU_MODE_LABELS = {
  static: "Menu statico (solo consultazione)",
  table_orders: "Ordini al tavolo",
  ayce: "All you can eat",
} as const;
export type MenuMode = keyof typeof MENU_MODE_LABELS;
