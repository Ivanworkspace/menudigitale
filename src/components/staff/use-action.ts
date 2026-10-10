"use client";
import { useState, useTransition } from "react";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Runs a server action with pending state and a toast-like message. */
export function useAction() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  function run<T>(fn: () => Promise<Result<T>>, opts: { success?: string; onOk?: (data: T) => void } = {}) {
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) setMsg({ tone: "danger", text: r.error });
      else {
        if (opts.success) setMsg({ tone: "success", text: opts.success });
        opts.onOk?.(r.data);
      }
    });
  }
  return { pending, msg, setMsg, run };
}
