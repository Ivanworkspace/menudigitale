"use client";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { LANGUAGES, type I18n } from "@/domain/menu";
import { Input, Textarea } from "@/components/ui/field";

/**
 * Multilingual text input: one tab per active language, with an optional
 * "translate from Italian" helper (proposal, always editable).
 */
export function I18nField({
  label,
  value,
  onChange,
  languages,
  multiline,
  required,
  maxLength,
  onTranslate,
}: {
  label: string;
  value: I18n;
  onChange: (v: I18n) => void;
  languages: string[];
  multiline?: boolean;
  required?: boolean;
  maxLength?: number;
  onTranslate?: (text: string, target: string) => Promise<string | null>;
}) {
  const [lang, setLang] = useState(languages[0] ?? "it");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const current = value[lang] ?? "";
  const set = (v: string) => onChange({ ...value, [lang]: v });

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700">
          {label}
          {required && " *"}
        </span>
        {languages.length > 1 && (
          <div className="flex gap-1">
            {languages.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={cn(
                  "rounded-md px-2 py-0.5 text-xs font-medium",
                  l === lang ? "bg-slate-900 text-white" : value[l]?.trim() ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-700",
                )}
                title={LANGUAGES[l]?.label}
              >
                {LANGUAGES[l]?.flag ?? ""} {l.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>
      {multiline ? (
        <Textarea rows={3} value={current} maxLength={maxLength} onChange={(e) => set(e.target.value)} />
      ) : (
        <Input value={current} maxLength={maxLength} onChange={(e) => set(e.target.value)} />
      )}
      {lang !== "it" && onTranslate && value.it?.trim() && (
        <button
          type="button"
          disabled={pending}
          className="text-xs font-medium text-sky-700 hover:underline disabled:opacity-50"
          onClick={() =>
            start(async () => {
              setErr(null);
              const out = await onTranslate(value.it, lang);
              if (out === null) setErr("Traduzione non disponibile.");
              else set(out);
            })
          }
        >
          {pending ? "Traduzione…" : `Traduci dall'italiano`}
        </button>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
