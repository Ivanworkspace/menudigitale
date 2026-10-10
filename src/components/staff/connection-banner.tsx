"use client";
import { useEffect, useState } from "react";

/** Warns staff when the device goes offline (orders will be retried). */
export function ConnectionBanner() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (online) return null;
  return (
    <div className="sticky top-0 z-40 bg-red-600 px-4 py-2 text-center text-sm font-medium text-white" role="alert">
      Connessione assente: le operazioni verranno inviate appena torna la rete.
    </div>
  );
}
