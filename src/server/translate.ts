import "server-only";

/**
 * Machine translation for menu texts. Providers (first configured wins):
 *  - DEEPL_API_KEY            (DeepL; free keys end with ":fx")
 *  - GOOGLE_TRANSLATE_API_KEY (Google Cloud Translation v2)
 * The result is only a proposal: staff review and edit it before saving.
 */
export function translationAvailable(): boolean {
  return !!(process.env.DEEPL_API_KEY || process.env.GOOGLE_TRANSLATE_API_KEY);
}

export async function translateTexts(texts: string[], target: string, source = "it"): Promise<string[]> {
  const items = texts.map((t) => t ?? "");
  if (items.every((t) => !t.trim())) return items;

  if (process.env.DEEPL_API_KEY) {
    const key = process.env.DEEPL_API_KEY;
    const host = key.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
    const res = await fetch(`${host}/v2/translate`, {
      method: "POST",
      headers: { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: items, source_lang: source.toUpperCase(), target_lang: deeplTarget(target) }),
    });
    if (!res.ok) throw new Error(`Traduzione non riuscita (${res.status})`);
    const json = (await res.json()) as { translations: { text: string }[] };
    return json.translations.map((t) => t.text);
  }

  if (process.env.GOOGLE_TRANSLATE_API_KEY) {
    const res = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${process.env.GOOGLE_TRANSLATE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: items, source, target, format: "text" }),
      },
    );
    if (!res.ok) throw new Error(`Traduzione non riuscita (${res.status})`);
    const json = (await res.json()) as { data: { translations: { translatedText: string }[] } };
    return json.data.translations.map((t) => t.translatedText);
  }

  throw new Error("Traduzione automatica non configurata.");
}

function deeplTarget(lang: string) {
  const map: Record<string, string> = { en: "EN-GB", pt: "PT-PT", zh: "ZH" };
  return map[lang] ?? lang.toUpperCase();
}
