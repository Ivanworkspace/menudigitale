"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

/**
 * Touch-friendly PIN keypad (tablet/phone). Also accepts the physical
 * keyboard. `onSubmit` returns an error message or null on success.
 */
export function PinPad({
  onSubmit,
  minLength = 4,
  maxLength = 8,
  disabled = false,
}: {
  onSubmit: (pin: string) => Promise<string | null>;
  minLength?: number;
  maxLength?: number;
  disabled?: boolean;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const busy = pending || disabled;

  const submit = useCallback(() => {
    if (pin.length < minLength || busy) return;
    start(async () => {
      const err = await onSubmit(pin);
      if (err) {
        setError(err);
        setPin("");
      }
    });
  }, [pin, minLength, busy, onSubmit]);

  const press = useCallback(
    (d: string) => {
      if (busy) return;
      setError(null);
      setPin((p) => (p.length < maxLength ? p + d : p));
    },
    [busy, maxLength],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      else if (e.key === "Enter") submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, submit]);

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const base =
    "flex h-16 items-center justify-center rounded-2xl text-2xl font-semibold shadow-sm ring-1 transition active:scale-95 disabled:opacity-50";
  const keyClass = cn(base, "bg-white text-slate-900 ring-slate-200 active:bg-slate-100");
  const okClass = cn(base, "bg-slate-900 text-base text-white ring-slate-900 active:bg-slate-700");

  return (
    <div className="mx-auto w-full max-w-xs">
      <div className="mb-2 flex h-6 items-center justify-center gap-3" aria-live="polite" aria-label={`${pin.length} cifre inserite`}>
        {Array.from({ length: Math.max(minLength, pin.length) }).map((_, i) => (
          <span
            key={i}
            className={cn("h-3.5 w-3.5 rounded-full transition", i < pin.length ? "bg-slate-900" : "bg-slate-300")}
          />
        ))}
      </div>
      <p className={cn("mb-4 min-h-5 text-center text-sm", error ? "text-red-600" : "text-slate-500")} role="alert">
        {error ?? `Inserisci il PIN (da ${minLength} a ${maxLength} cifre) e premi OK`}
      </p>
      <div className="grid grid-cols-3 gap-3">
        {keys.map((k) => (
          <button key={k} type="button" className={keyClass} onClick={() => press(k)} disabled={busy}>
            {k}
          </button>
        ))}
        <button
          type="button"
          className={cn(keyClass, "text-base")}
          onClick={() => setPin((p) => p.slice(0, -1))}
          disabled={busy}
          aria-label="Cancella"
        >
          <Icon name="backspace" className="h-6 w-6" />
        </button>
        <button type="button" className={keyClass} onClick={() => press("0")} disabled={busy}>
          0
        </button>
        <button
          type="button"
          className={okClass}
          onClick={submit}
          disabled={busy || pin.length < minLength}
        >
          {pending ? "…" : "OK"}
        </button>
      </div>
    </div>
  );
}
