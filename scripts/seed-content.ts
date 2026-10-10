import type { Firestore } from "firebase-admin/firestore";
import { COL, SUB } from "../src/lib/firebase/paths";
import { randomToken } from "../src/lib/crypto-core";

const now = () => new Date().toISOString();

type P = {
  cat: string;
  it: string;
  en: string;
  de?: string;
  dIt?: string;
  dEn?: string;
  price: number;
  dep: "cucina" | "pizzeria" | "bar";
  vat?: number;
  allergens?: number[];
  tags?: string[];
  frozen?: boolean;
  groups?: string[];
  available?: boolean;
};

/** Demo menu for "Pizzeria Da Mario" (Phase 2) — extended by later phases. */
export async function seedDemoContent(db: Firestore, tenantId: string) {
  const t = db.collection(COL.tenants).doc(tenantId);
  const batch = db.batch();

  const deps = { cucina: t.collection(SUB.departments).doc(), pizzeria: t.collection(SUB.departments).doc(), bar: t.collection(SUB.departments).doc() };
  batch.set(deps.cucina, { name: "Cucina", sort: 0, printerId: null });
  batch.set(deps.pizzeria, { name: "Pizzeria", sort: 1, printerId: null });
  batch.set(deps.bar, { name: "Bar", sort: 2, printerId: null });

  const menus = { pranzo: t.collection(SUB.menus).doc(), cena: t.collection(SUB.menus).doc(), asporto: t.collection(SUB.menus).doc() };
  batch.set(menus.pranzo, { name: { it: "Pranzo", en: "Lunch", de: "Mittagessen" }, kind: "dine_in", active: true, sort: 0, schedule: { weekdays: [], from: "11:00", to: "16:00" }, createdAt: now() });
  batch.set(menus.cena, { name: { it: "Cena", en: "Dinner", de: "Abendessen" }, kind: "dine_in", active: true, sort: 1, schedule: { weekdays: [], from: "16:00", to: "23:59" }, createdAt: now() });
  batch.set(menus.asporto, { name: { it: "Asporto", en: "Takeaway", de: "Zum Mitnehmen" }, kind: "takeaway", active: true, sort: 2, schedule: null, createdAt: now() });

  const cat = (key: string, it: string, en: string, de: string, icon: string, sort: number, extra: Record<string, unknown> = {}) => {
    const ref = t.collection(SUB.categories).doc();
    batch.set(ref, {
      name: { it, en, de }, description: {}, parentId: null, icon, imagePath: null, sort, active: true,
      visibility: null, menuIds: [], createdAt: now(), updatedAt: now(), ...extra,
    });
    return [key, ref.id] as const;
  };
  const cats = Object.fromEntries([
    cat("colazioni", "Colazioni", "Breakfast", "Frühstück", "🥐", 0, { visibility: { weekdays: [], from: "07:00", to: "11:00" } }),
    cat("antipasti", "Antipasti", "Starters", "Vorspeisen", "🥗", 1),
    cat("pizze", "Pizze classiche", "Classic pizzas", "Klassische Pizzen", "🍕", 2),
    cat("speciali", "Pizze speciali", "Special pizzas", "Spezialpizzen", "⭐", 3),
    cat("primi", "Primi piatti", "Pasta", "Pasta", "🍝", 4, { menuIds: [menus.pranzo.id, menus.cena.id] }),
    cat("dolci", "Dolci", "Desserts", "Desserts", "🍰", 5),
    cat("bevande", "Bevande", "Drinks", "Getränke", "🥤", 6),
    cat("vini", "Vini", "Wines", "Weine", "🍷", 7, { menuIds: [menus.cena.id] }),
  ]);

  const g = (name: Record<string, string>, kind: string, min: number, max: number, options: [string, Record<string, string>, number][], sort: number) => {
    const ref = t.collection(SUB.modifierGroups).doc();
    batch.set(ref, {
      name, kind, minSelect: min, maxSelect: max, sort,
      options: options.map(([id, n, price]) => ({ id, name: n, priceDeltaCents: price, available: true })),
      createdAt: now(), updatedAt: now(),
    });
    return ref.id;
  };
  const groups = {
    impasto: g({ it: "Impasto", en: "Dough", de: "Teig" }, "variant", 1, 1, [
      ["classico", { it: "Classico", en: "Classic", de: "Klassisch" }, 0],
      ["integrale", { it: "Integrale", en: "Wholemeal", de: "Vollkorn" }, 150],
      ["senza_glutine", { it: "Senza glutine", en: "Gluten free", de: "Glutenfrei" }, 300],
    ], 0),
    aggiunte: g({ it: "Aggiunte", en: "Extra toppings", de: "Extra Belag" }, "addon", 0, 4, [
      ["bufala", { it: "Mozzarella di bufala", en: "Buffalo mozzarella", de: "Büffelmozzarella" }, 250],
      ["crudo", { it: "Prosciutto crudo", en: "Parma ham", de: "Parmaschinken" }, 200],
      ["funghi", { it: "Funghi", en: "Mushrooms", de: "Pilze" }, 100],
      ["nduja", { it: "'Nduja", en: "'Nduja", de: "'Nduja" }, 150],
      ["olive", { it: "Olive", en: "Olives", de: "Oliven" }, 80],
    ], 1),
    senza: g({ it: "Senza…", en: "Without…", de: "Ohne…" }, "removal", 0, 3, [
      ["no_origano", { it: "Senza origano", en: "No oregano", de: "Ohne Oregano" }, 0],
      ["no_basilico", { it: "Senza basilico", en: "No basil", de: "Ohne Basilikum" }, 0],
      ["no_aglio", { it: "Senza aglio", en: "No garlic", de: "Ohne Knoblauch" }, 0],
    ], 2),
    formato: g({ it: "Formato", en: "Size", de: "Größe" }, "variant", 1, 1, [
      ["piccola", { it: "Piccola 0,2 l", en: "Small 0.2 l", de: "Klein 0,2 l" }, 0],
      ["media", { it: "Media 0,4 l", en: "Medium 0.4 l", de: "Mittel 0,4 l" }, 200],
    ], 3),
  };

  const pizzaGroups = [groups.impasto, groups.aggiunte, groups.senza];
  const ingredientsRef = {
    farina: t.collection(SUB.ingredients).doc().id,
    mozzarella: t.collection(SUB.ingredients).doc().id,
    pomodoro: t.collection(SUB.ingredients).doc().id,
    bufala: t.collection(SUB.ingredients).doc().id,
    salame: t.collection(SUB.ingredients).doc().id,
  };
  const products: P[] = [
    { cat: "colazioni", it: "Cornetto", en: "Croissant", de: "Hörnchen", price: 150, dep: "bar", allergens: [1, 3, 7], frozen: true },
    { cat: "colazioni", it: "Cappuccino", en: "Cappuccino", de: "Cappuccino", price: 170, dep: "bar", allergens: [7] },
    { cat: "antipasti", it: "Bruschette al pomodoro", en: "Tomato bruschetta", de: "Tomaten-Bruschetta", dIt: "Pane casereccio, pomodorini, basilico e olio EVO", dEn: "Homemade bread, cherry tomatoes, basil, extra-virgin olive oil", price: 600, dep: "cucina", allergens: [1], tags: ["vegan"] },
    { cat: "antipasti", it: "Tagliere di salumi e formaggi", en: "Cold cuts & cheese board", de: "Wurst- und Käseplatte", dIt: "Selezione di salumi locali, formaggi stagionati e confetture", price: 1400, dep: "cucina", allergens: [7, 12], tags: ["recommended"] },
    { cat: "antipasti", it: "Frittura di calamari", en: "Fried calamari", de: "Frittierte Calamari", price: 1200, dep: "cucina", allergens: [1, 14], frozen: true },
    { cat: "pizze", it: "Margherita", en: "Margherita", de: "Margherita", dIt: "Pomodoro San Marzano, fiordilatte, basilico", dEn: "San Marzano tomato, fior di latte, basil", price: 700, dep: "pizzeria", allergens: [1, 7], tags: ["vegetarian"], groups: pizzaGroups },
    { cat: "pizze", it: "Marinara", en: "Marinara", de: "Marinara", dIt: "Pomodoro, aglio, origano, olio EVO", dEn: "Tomato, garlic, oregano, olive oil", price: 600, dep: "pizzeria", allergens: [1], tags: ["vegan"], groups: pizzaGroups },
    { cat: "pizze", it: "Diavola", en: "Diavola", de: "Diavola", dIt: "Pomodoro, fiordilatte, salame piccante", dEn: "Tomato, fior di latte, spicy salami", price: 850, dep: "pizzeria", allergens: [1, 7], tags: ["spicy"], groups: pizzaGroups },
    { cat: "pizze", it: "Quattro formaggi", en: "Four cheeses", de: "Vier Käse", dIt: "Fiordilatte, gorgonzola, fontina, parmigiano", price: 950, dep: "pizzeria", allergens: [1, 7], tags: ["vegetarian"], groups: pizzaGroups },
    { cat: "pizze", it: "Capricciosa", en: "Capricciosa", de: "Capricciosa", dIt: "Pomodoro, fiordilatte, prosciutto cotto, funghi, carciofi, olive", price: 1000, dep: "pizzeria", allergens: [1, 7], groups: pizzaGroups },
    { cat: "speciali", it: "Bufalina DOP", en: "Buffalo DOP", de: "Büffel DOP", dIt: "Pomodoro, mozzarella di bufala campana DOP, basilico", price: 1100, dep: "pizzeria", allergens: [1, 7], tags: ["recommended", "vegetarian"], groups: pizzaGroups },
    { cat: "speciali", it: "Mortadella e pistacchio", en: "Mortadella & pistachio", de: "Mortadella & Pistazie", dIt: "Fiordilatte, mortadella IGP, granella di pistacchio, stracciatella", price: 1300, dep: "pizzeria", allergens: [1, 7, 8], tags: ["new", "special"], groups: pizzaGroups },
    { cat: "speciali", it: "Tartufata", en: "Truffle pizza", de: "Trüffelpizza", price: 1500, dep: "pizzeria", allergens: [1, 7], groups: pizzaGroups, available: false },
    { cat: "primi", it: "Spaghetti alla carbonara", en: "Spaghetti carbonara", de: "Spaghetti Carbonara", dIt: "Guanciale, uovo, pecorino romano, pepe", price: 1200, dep: "cucina", allergens: [1, 3, 7] },
    { cat: "primi", it: "Risotto ai frutti di mare", en: "Seafood risotto", de: "Meeresfrüchte-Risotto", price: 1600, dep: "cucina", allergens: [2, 4, 9, 12, 14], tags: ["special"], frozen: true },
    { cat: "dolci", it: "Tiramisù della casa", en: "Homemade tiramisù", de: "Hausgemachtes Tiramisù", price: 550, dep: "cucina", allergens: [1, 3, 7], tags: ["recommended"] },
    { cat: "dolci", it: "Panna cotta ai frutti di bosco", en: "Berry panna cotta", de: "Panna cotta mit Waldbeeren", price: 500, dep: "cucina", allergens: [7], tags: ["gluten_free"] },
    { cat: "bevande", it: "Acqua naturale 0,75 l", en: "Still water 0.75 l", de: "Stilles Wasser 0,75 l", price: 250, dep: "bar", vat: 2200 },
    { cat: "bevande", it: "Coca-Cola", en: "Coca-Cola", de: "Coca-Cola", price: 350, dep: "bar", vat: 2200 },
    { cat: "bevande", it: "Birra alla spina", en: "Draught beer", de: "Bier vom Fass", price: 400, dep: "bar", vat: 2200, allergens: [1], groups: [groups.formato] },
    { cat: "vini", it: "Chianti Classico DOCG (calice)", en: "Chianti Classico DOCG (glass)", de: "Chianti Classico DOCG (Glas)", price: 600, dep: "bar", vat: 2200, allergens: [12] },
  ];

  // Ingredients are declared later in the batch but their ids exist already.
  const recipeFor = (name: string) => {
    const base = [{ ingredientId: ingredientsRef.farina, qty: 0.25 }, { ingredientId: ingredientsRef.pomodoro, qty: 0.08 }];
    if (name === "Marinara") return base;
    if (name.startsWith("Bufalina")) return [...base, { ingredientId: ingredientsRef.bufala, qty: 0.125 }];
    if (name === "Diavola") return [...base, { ingredientId: ingredientsRef.mozzarella, qty: 0.12 }, { ingredientId: ingredientsRef.salame, qty: 0.05 }];
    return [...base, { ingredientId: ingredientsRef.mozzarella, qty: 0.12 }];
  };
  const sortByCat: Record<string, number> = {};
  for (const p of products) {
    const ref = t.collection(SUB.products).doc();
    batch.set(ref, {
      categoryId: cats[p.cat],
      name: { it: p.it, en: p.en, ...(p.de ? { de: p.de } : {}) },
      description: { ...(p.dIt ? { it: p.dIt } : {}), ...(p.dEn ? { en: p.dEn } : {}) },
      priceCents: p.price,
      prices: p.dep === "pizzeria" ? { [menus.asporto.id]: p.price - 50 } : {},
      vatRateBp: p.vat ?? 1000,
      departmentId: deps[p.dep].id,
      allergens: p.allergens ?? [],
      tags: p.tags ?? [],
      isFrozen: p.frozen ?? false,
      available: p.available ?? true,
      hidden: false,
      images: [],
      sort: (sortByCat[p.cat] = (sortByCat[p.cat] ?? -1) + 1),
      modifierGroupIds: p.groups ?? [],
      recipe: p.dep === "pizzeria" ? recipeFor(p.it) : [],
      ayceIncluded: false,
      ayceMaxQty: null,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  // Rooms & tables (Phase 3)
  const rooms = { interna: t.collection(SUB.rooms).doc(), esterno: t.collection(SUB.rooms).doc() };
  batch.set(rooms.interna, { name: "Sala interna", sort: 0 });
  batch.set(rooms.esterno, { name: "Dehors", sort: 1 });
  const tableTokens: { label: string; token: string }[] = [];
  const addTable = (roomId: string, label: string, seats: number, shape: string, x: number, y: number, sort: number) => {
    const ref = t.collection(SUB.tables).doc();
    const token = randomToken(18);
    batch.set(ref, {
      roomId, label, seats, shape, x, y, w: shape === "rect" ? 160 : 100, h: 100, qrToken: token, active: true,
      status: "free", currentSessionId: null, mergedInto: null, sort,
    });
    batch.set(db.collection(COL.tableTokens).doc(token), { tenantId, tableId: ref.id });
    tableTokens.push({ label, token });
  };
  [1, 2, 3, 4, 5, 6].forEach((n, i) => addTable(rooms.interna.id, String(n), n % 3 === 0 ? 6 : 4, n % 3 === 0 ? "rect" : "square", 40 + (i % 3) * 200, 40 + Math.floor(i / 3) * 170, i));
  addTable(rooms.interna.id, "7", 2, "round", 640, 40, 6);
  addTable(rooms.interna.id, "8", 2, "round", 640, 210, 7);
  ["E1", "E2", "E3", "E4"].forEach((l, i) => addTable(rooms.esterno.id, l, 4, "round", 40 + i * 160, 60, i));

  // Phase 7: inventory, reservations, customers, promotions
  const ing = (key: keyof typeof ingredientsRef, name: string, unit: string, stock: number, minStock: number, cost: number) => {
    const ref = t.collection(SUB.ingredients).doc(ingredientsRef[key]);
    batch.set(ref, { name, unit, stock, minStock, costPerUnitCents: cost, active: true, createdAt: now() });
    return ref.id;
  };
  void {
    farina: ing("farina", "Farina 00", "kg", 25, 5, 90),
    mozzarella: ing("mozzarella", "Fiordilatte", "kg", 6, 2, 750),
    pomodoro: ing("pomodoro", "Pomodoro San Marzano", "kg", 10, 3, 320),
    bufala: ing("bufala", "Mozzarella di bufala", "kg", 1.5, 1, 1400),
    salame: ing("salame", "Salame piccante", "kg", 2, 0.5, 1800),
  };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  [
    { name: "Famiglia Bianchi", phone: "+393331112233", covers: 4, time: "20:00", status: "confirmed", source: "phone" },
    { name: "Laura Verdi", phone: "+393475556677", covers: 2, time: "20:30", status: "pending", source: "online" },
    { name: "Compleanno Rossi", phone: "+393209998877", covers: 8, time: "21:00", status: "confirmed", source: "phone" },
  ].forEach((r) =>
    batch.set(t.collection(SUB.reservations).doc(), {
      ...r, email: null, date: today, durationMin: 90, notes: "", tableId: null, customerId: null, manageCode: randomToken(12), createdAt: now(),
    }),
  );
  const cust = (name: string, phone: string, points: number, visits: number, spent: number, marketing: boolean) =>
    batch.set(t.collection(SUB.customers).doc(), {
      name, phone, email: null, birthday: null, notes: "", privacyConsentAt: now(), marketingConsent: marketing, marketingConsentAt: marketing ? now() : null,
      visits, totalSpentCents: spent, points, stamps: 0, lastVisitAt: now(), createdAt: now(),
      searchKeys: [...name.toLowerCase().split(" ").flatMap((w) => Array.from({ length: Math.min(w.length, 12) - 1 }, (_, i) => w.slice(0, i + 2))), phone.slice(-6)],
    });
  cust("Giovanni Esposito", "+393331234567", 85, 7, 31200, true);
  cust("Chiara Romano", "+393401112222", 140, 12, 52800, false);
  batch.set(t.collection(SUB.promotions).doc(), {
    name: "Benvenuto", kind: "code", code: "BENVENUTO10", mode: "percent", value: 1000, schedule: null, validFrom: null, validTo: null,
    maxUses: 100, uses: 0, minSpendCents: 2000, active: true, createdAt: now(),
  });
  batch.set(t.collection(SUB.promotions).doc(), {
    name: "Happy hour birre", kind: "happy_hour", code: null, mode: "percent", value: 2000, schedule: { weekdays: [], from: "18:00", to: "20:00" },
    validFrom: null, validTo: null, maxUses: null, uses: 0, minSpendCents: 0, active: true, createdAt: now(),
  });

  batch.update(t, {
    "settings.reservations": {
      onlineEnabled: true, autoConfirm: false, maxCoversPerSlot: 30, maxPartySize: 12, leadTimeMin: 60, maxDaysAhead: 60, durationMin: 90,
      slots: [
        { weekdays: [2, 3, 4, 5, 6, 7], from: "12:00", to: "14:00", intervalMin: 15 },
        { weekdays: [2, 3, 4, 5, 6, 7], from: "19:00", to: "22:30", intervalMin: 15 },
      ],
    },
    "settings.privacyText": "Titolare del trattamento: Da Mario S.r.l., Via Roma 12, Milano.\nIl menu digitale non raccoglie dati personali dei clienti. Vengono usati solo cookie tecnici.",
    menuVersion: now(),
  });
  await batch.commit();
  console.log(`✓ Menu demo: ${Object.keys(cats).length} categorie, ${products.length} prodotti, 4 gruppi di varianti, 3 menu`);
  console.log(`✓ Sala: 2 sale, ${tableTokens.length} tavoli`);
  return { tableTokens };
}
