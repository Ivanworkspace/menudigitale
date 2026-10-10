"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithCustomToken, signOut } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  type DocumentData,
  type QueryConstraint,
} from "firebase/firestore";
import { clientAuth, clientDb } from "@/lib/firebase/client";
import { getRealtimeToken } from "@/app/g/[token]/actions";

type Ctx = { ready: boolean; tenantId: string; online: boolean };
const RealtimeContext = createContext<Ctx>({ ready: false, tenantId: "", online: true });

/**
 * Signs the browser into Firebase with a custom token minted for this staff
 * session, so Firestore listeners (guarded by security rules) deliver
 * realtime updates. Re-validates the session every 10 minutes.
 */
export function RealtimeProvider({ token, tenantId, children }: { token: string; tenantId: string; children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const login = async () => {
      const custom = await getRealtimeToken(token);
      if (cancelled) return;
      if (!custom) {
        await signOut(clientAuth()).catch(() => {});
        router.replace(`/g/${token}`);
        return;
      }
      await signInWithCustomToken(clientAuth(), custom);
      if (!cancelled) setReady(true);
    };
    login().catch(() => setReady(false));
    const id = setInterval(() => login().catch(() => {}), 10 * 60_000);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [token, router]);

  const value = useMemo(() => ({ ready, tenantId, online }), [ready, tenantId, online]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export const useRealtime = () => useContext(RealtimeContext);

/** Live collection under tenants/{tenantId}/{name}, with optional constraints. */
export function useLiveCollection<T extends { id: string }>(
  name: string,
  constraints: QueryConstraint[] = [],
  key = "",
  initial: T[] = [],
): { data: T[]; loading: boolean } {
  const { ready, tenantId } = useRealtime();
  const [data, setData] = useState<T[]>(initial);
  const [loading, setLoading] = useState(true);
  const cRef = useRef(constraints);
  cRef.current = constraints;

  useEffect(() => {
    if (!ready || !name) return;
    const q = query(collection(clientDb(), "tenants", tenantId, name), ...cRef.current);
    return onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocumentData) }) as T));
        setLoading(false);
      },
      (err) => {
        console.error(`listener ${name}`, err);
        setLoading(false);
      },
    );
  }, [ready, tenantId, name, key]);

  return { data, loading };
}

export function useLiveDoc<T>(path: string | null): T | null {
  const { ready, tenantId } = useRealtime();
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!ready || !path) return;
    return onSnapshot(doc(clientDb(), "tenants", tenantId, path), (s) => setData(s.exists() ? ({ id: s.id, ...s.data() } as T) : null));
  }, [ready, tenantId, path]);
  return data;
}
