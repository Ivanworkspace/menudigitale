"use client";
import { useEffect, useRef, useState } from "react";
import { orderBy, where, limit } from "firebase/firestore";
import { cn } from "@/lib/cn";
import { useLiveCollection, useRealtime } from "./realtime";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  departmentId: string | null;
  urgent: boolean;
  createdAt: string;
};

/** Which notification types each role cares about. */
const ROLE_TYPES: Record<string, string[]> = {
  owner: ["new_order", "order_pending", "order_ready", "call_waiter", "request_bill", "order_blocked", "stock_low", "product_sold_out", "message"],
  manager: ["new_order", "order_pending", "order_ready", "call_waiter", "request_bill", "order_blocked", "stock_low", "product_sold_out", "message"],
  waiter: ["order_pending", "order_ready", "call_waiter", "request_bill", "order_blocked", "message"],
  cashier: ["request_bill", "message"],
  kitchen: ["new_order", "message", "product_sold_out"],
  bar: ["new_order", "message", "product_sold_out"],
};

let audioCtx: AudioContext | null = null;
/** Short beep via WebAudio (no asset needed). Urgent = two tones. */
export function beep(urgent = false) {
  try {
    audioCtx ??= new AudioContext();
    const tones = urgent ? [880, 1175] : [880];
    tones.forEach((f, i) => {
      const o = audioCtx!.createOscillator();
      const g = audioCtx!.createGain();
      o.frequency.value = f;
      o.type = "sine";
      g.gain.setValueAtTime(0.0001, audioCtx!.currentTime + i * 0.22);
      g.gain.exponentialRampToValueAtTime(0.3, audioCtx!.currentTime + i * 0.22 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx!.currentTime + i * 0.22 + 0.2);
      o.connect(g).connect(audioCtx!.destination);
      o.start(audioCtx!.currentTime + i * 0.22);
      o.stop(audioCtx!.currentTime + i * 0.22 + 0.22);
    });
  } catch {}
}

export function NotificationCenter({ role }: { role: string }) {
  const { ready } = useRealtime();
  const [since] = useState(() => new Date().toISOString());
  const { data } = useLiveCollection<Notification>("notifications", [where("createdAt", ">", since), orderBy("createdAt", "desc"), limit(20)], since);
  const [toasts, setToasts] = useState<Notification[]>([]);
  const seen = useRef(new Set<string>());
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    try {
      setSoundOn(localStorage.getItem("staff.sound") !== "off");
    } catch {}
  }, []);

  useEffect(() => {
    const allowed = ROLE_TYPES[role] ?? [];
    const fresh = data.filter((n) => !seen.current.has(n.id) && allowed.includes(n.type));
    data.forEach((n) => seen.current.add(n.id));
    if (!fresh.length) return;
    if (soundOn) beep(fresh.some((n) => n.urgent));
    if (navigator.vibrate) navigator.vibrate(fresh.some((n) => n.urgent) ? [200, 100, 200] : 150);
    setToasts((t) => [...fresh, ...t].slice(0, 4));
    fresh.forEach((n) => setTimeout(() => setToasts((t) => t.filter((x) => x.id !== n.id)), n.urgent ? 15_000 : 7000));
  }, [data, role, soundOn]);

  if (!ready) return null;
  return (
    <>
      <button
        onClick={() => {
          const v = !soundOn;
          setSoundOn(v);
          try {
            localStorage.setItem("staff.sound", v ? "on" : "off");
          } catch {}
          if (v) beep();
        }}
        className="fixed bottom-4 right-4 z-40 rounded-full bg-white px-3 py-2 text-sm shadow-lg ring-1 ring-slate-200"
        aria-label={soundOn ? "Disattiva suoni" : "Attiva suoni"}
        title={soundOn ? "Suoni attivi" : "Suoni disattivati"}
      >
        {soundOn ? "🔔" : "🔕"}
      </button>
      <div className="pointer-events-none fixed right-4 top-16 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((n) => (
          <div
            key={n.id}
            className={cn(
              "pointer-events-auto rounded-xl px-4 py-3 text-sm shadow-lg ring-1",
              n.urgent ? "bg-amber-50 text-amber-950 ring-amber-300" : "bg-white text-slate-900 ring-slate-200",
            )}
            role="alert"
            onClick={() => setToasts((t) => t.filter((x) => x.id !== n.id))}
          >
            <p className="font-semibold">{n.title}</p>
            {n.body && <p className="mt-0.5 text-slate-600">{n.body}</p>}
          </div>
        ))}
      </div>
    </>
  );
}
