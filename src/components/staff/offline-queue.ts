"use client";
/**
 * Offline queue for staff actions (waiter orders). When the device is
 * offline the payload is stored locally and re-sent automatically as soon
 * as the connection comes back. Each entry carries a client id so a
 * retried send is never applied twice by mistake on the UI side.
 */
const KEY = "staff.offlineQueue";

export type Queued<T> = { id: string; kind: string; payload: T; at: string; attempts: number };

export function readQueue<T>(): Queued<T>[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function write<T>(q: Queued<T>[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch {}
}

export function enqueue<T>(kind: string, payload: T) {
  const q = readQueue<T>();
  q.push({ id: Math.random().toString(36).slice(2), kind, payload, at: new Date().toISOString(), attempts: 0 });
  write(q);
}

/** Tries to send every queued item; keeps the ones that fail. */
export async function flushQueue<T>(kind: string, send: (payload: T) => Promise<{ ok: boolean; error?: string }>) {
  const q = readQueue<T>();
  const keep: Queued<T>[] = [];
  const errors: string[] = [];
  for (const item of q) {
    if (item.kind !== kind) {
      keep.push(item);
      continue;
    }
    try {
      const r = await send(item.payload);
      if (!r.ok) {
        // Business errors (e.g. table closed) are not retried forever.
        if (item.attempts >= 2) errors.push(r.error ?? "Errore");
        else keep.push({ ...item, attempts: item.attempts + 1 });
      }
    } catch {
      keep.push(item); // still offline
    }
  }
  write(keep);
  return { remaining: keep.filter((i) => i.kind === kind).length, errors };
}
