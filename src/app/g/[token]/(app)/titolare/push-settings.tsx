"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { useAction } from "@/components/staff/use-action";
import { DEFAULT_PUSH_TOPICS, PUSH_TOPIC_KEYS, PUSH_TOPICS, type PushTopic } from "@/domain/push";
import { pushStatus, subscribePush, testPush, unsubscribePush, updatePushTopics } from "./actions";

type Support = "checking" | "ok" | "ios_install" | "unsupported" | "denied";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function registration() {
  const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  return reg;
}

export function PushSettings({ token, serverReady, vapidKey, homePath }: { token: string; serverReady: boolean; vapidKey: string; homePath: string }) {
  const [support, setSupport] = useState<Support>("checking");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [topics, setTopics] = useState<PushTopic[]>(DEFAULT_PUSH_TOPICS);
  const [standalone, setStandalone] = useState(false);
  const { pending, msg, setMsg, run } = useAction();

  useEffect(() => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    setStandalone(isStandalone);
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setSupport(ios && !isStandalone ? "ios_install" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") setSupport("denied");
    else setSupport("ok");
    (async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      // Remember which panel to open when a notification is tapped.
      reg?.active?.postMessage({ type: "set-home", url: homePath });
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) return;
      setEndpoint(sub.endpoint);
      const r = await pushStatus(token, sub.endpoint);
      if (r.ok) {
        setSubscribed(r.data.subscribed);
        if (r.data.subscribed) setTopics(r.data.topics);
      }
    })().catch(() => {});
  }, [token, homePath]);

  const enable = () =>
    run(async () => {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setSupport(perm === "denied" ? "denied" : "ok");
        return { ok: false as const, error: "Permesso per le notifiche non concesso." };
      }
      const reg = await registration();
      reg.active?.postMessage({ type: "set-home", url: homePath });
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) }));
      const r = await subscribePush(token, sub.toJSON(), topics);
      if (r.ok) {
        setEndpoint(sub.endpoint);
        setSubscribed(true);
      }
      return r;
    }, { success: "Notifiche attivate su questo dispositivo." });

  const disable = () =>
    run(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      const r = endpoint ? await unsubscribePush(token, endpoint) : ({ ok: true, data: undefined } as const);
      setSubscribed(false);
      return r;
    }, { success: "Notifiche disattivate su questo dispositivo." });

  const toggle = (k: PushTopic) => {
    const next = topics.includes(k) ? topics.filter((x) => x !== k) : [...topics, k];
    setTopics(next);
    if (subscribed && endpoint) run(() => updatePushTopics(token, endpoint, next));
  };

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm font-semibold">🔔 Notifiche sul telefono</p>
      {!serverReady ? (
        <p className="mt-2 text-sm text-slate-600">Le notifiche push non sono ancora attive sul server: chiedi all&apos;assistenza di configurarle.</p>
      ) : support === "ios_install" ? (
        <div className="mt-2 space-y-1 text-sm text-slate-600">
          <p>Su iPhone le notifiche funzionano solo dall&apos;app installata:</p>
          <ol className="list-decimal space-y-0.5 pl-5">
            <li>apri questa pagina con <strong>Safari</strong>;</li>
            <li>tocca <strong>Condividi</strong> (il quadrato con la freccia) → <strong>Aggiungi alla schermata Home</strong>;</li>
            <li>apri l&apos;app «Titolare» dalla Home e torna qui.</li>
          </ol>
        </div>
      ) : support === "unsupported" ? (
        <p className="mt-2 text-sm text-slate-600">Questo browser non supporta le notifiche. Usa Chrome su Android o Safari su iPhone (iOS 16.4 o successivo).</p>
      ) : support === "denied" ? (
        <p className="mt-2 text-sm text-slate-600">Le notifiche sono bloccate per questo sito: riattivale dalle impostazioni del browser o del telefono, poi ricarica la pagina.</p>
      ) : (
        <div className="mt-3 space-y-3">
          <ul className="space-y-2">
            {PUSH_TOPIC_KEYS.map((k) => (
              <li key={k}>
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" className="mt-1 h-4 w-4" checked={topics.includes(k)} onChange={() => toggle(k)} disabled={pending} />
                  <span>
                    <span className="font-medium">{PUSH_TOPICS[k].label}</span>
                    <span className="block text-xs text-slate-500">{PUSH_TOPICS[k].description}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {subscribed ? (
              <>
                <Button variant="secondary" disabled={pending} onClick={() => endpoint && run(() => testPush(token, endpoint), { success: "Notifica di prova inviata." })}>Invia prova</Button>
                <Button variant="ghost" disabled={pending} onClick={disable}>Disattiva su questo dispositivo</Button>
              </>
            ) : (
              <Button disabled={pending || support === "checking"} onClick={enable}>Attiva notifiche su questo dispositivo</Button>
            )}
          </div>
          {!standalone && <p className="text-xs text-slate-500">Consiglio: installa questa pagina come app (menu del browser → «Installa app» o «Aggiungi alla schermata Home») per aprirla con un tocco.</p>}
        </div>
      )}
      {msg && <div className="mt-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {msg && <button className="sr-only" onClick={() => setMsg(null)}>Chiudi</button>}
    </div>
  );
}
