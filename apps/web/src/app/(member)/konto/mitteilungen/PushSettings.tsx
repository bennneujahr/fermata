"use client";
// Mitteilungen auf diesem Gerät ein- und ausschalten (Service Worker /sw.js, VAPID-Schlüssel aus push-key).
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { deletePushByIdAction, deletePushSubscriptionAction, savePushSubscriptionAction, vapidKeyAction } from "@/app/actions/push";
import { Badge, Button, Notice } from "@/components/ui";
import { brand } from "@/copy/common";
import type { AddressForm } from "@/copy/form";
import { push as pushCopy } from "@/copy/push";
import { formatDate } from "@/lib/format";
import { detectPlatform, pushSupport, sha256Hex, urlBase64ToUint8Array, type Platform } from "@/lib/push";

export interface DeviceRow {
  id: string;
  platform: string | null;
  created_at: string;
  last_success_at: string | null;
  endpoint_hash: string;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  // Der Service Worker meldet sich beim ersten Laden an; notfalls hier.
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 8000))]);
}

export function PushSettings({ form, devices, sampleBody }: { form: AddressForm; devices: DeviceRow[]; sampleBody: string }) {
  const c = pushCopy(form);
  const router = useRouter();
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [support, setSupport] = useState<ReturnType<typeof pushSupport> | null>(null);
  const [mineHash, setMineHash] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    void (async () => {
      const p = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      const s = pushSupport({
        hasServiceWorker: "serviceWorker" in navigator,
        hasPushManager: "PushManager" in window,
        hasNotification: "Notification" in window,
        platform: p,
        standalone,
      });
      setPlatform(p);
      setSupport(s);
      if (!s.ok) return;
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        setEndpoint(sub.endpoint);
        setMineHash(await sha256Hex(sub.endpoint));
      }
    })();
  }, []);

  const mine = mineHash ? devices.find((d) => d.endpoint_hash === mineHash) : undefined;
  const onHere = Boolean(endpoint && mine);

  const enable = () => {
    setProblem(null);
    setDone(null);
    start(async () => {
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") {
        setProblem(permission === "denied" ? "denied" : "dismissed");
        return;
      }
      const key = await vapidKeyAction();
      if (!key.ok) {
        setProblem(key.error === "push_not_configured" ? "push_not_configured" : "generic");
        return;
      }
      const reg = await registration();
      if (!reg) {
        setProblem("no_worker");
        return;
      }
      let sub: PushSubscription;
      try {
        sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key.key) }));
      } catch {
        setProblem("subscribe_failed");
        return;
      }
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const res = await savePushSubscriptionAction({ endpoint: json.endpoint ?? sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "", platform });
      if (!res.ok) {
        setProblem(res.error);
        return;
      }
      setEndpoint(sub.endpoint);
      setMineHash(await sha256Hex(sub.endpoint));
      setDone(c.enabledHere);
      router.refresh();
    });
  };

  const disableHere = () => {
    setProblem(null);
    setDone(null);
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      const ep = sub?.endpoint ?? endpoint;
      await sub?.unsubscribe().catch(() => false);
      if (ep) await deletePushSubscriptionAction(ep);
      setEndpoint(null);
      setMineHash(null);
      setDone(c.notHere);
      router.refresh();
    });
  };

  const removeDevice = (id: string) => {
    setProblem(null);
    setDone(null);
    start(async () => {
      const res = await deletePushByIdAction(id);
      if (!res.ok) {
        setProblem(res.error);
        return;
      }
      setDone(c.removed);
      router.refresh();
    });
  };

  const showSample = async () => {
    const reg = await navigator.serviceWorker.getRegistration("/");
    await reg?.showNotification(brand.name, { body: sampleBody, icon: "/brand/icon-192.png", badge: "/brand/badge-96.png", tag: "fermata-beispiel", data: { url: "/konto/mitteilungen" } });
  };

  return (
    <div className="stack">
      {support === null ? <p className="muted">{c.checking}</p> : null}
      {support && !support.ok ? <Notice tone="info">{c.problems[support.problem]}</Notice> : null}
      {support?.ok ? (
        <div className="stack stack-sm push-device" data-on={onHere || undefined}>
          <p className="cluster">
            <Badge tone={onHere ? "success" : undefined}>{onHere ? c.enabledHere : c.notHere}</Badge>
          </p>
          <div className="cluster">
            {onHere ? (
              <>
                <Button variant="secondary" onClick={disableHere} loading={pending}>
                  {c.disable}
                </Button>
                <Button variant="quiet" onClick={() => void showSample()}>
                  {c.test}
                </Button>
              </>
            ) : (
              <Button onClick={enable} loading={pending} icon="sparkle">
                {pending ? c.enabling : c.enable}
              </Button>
            )}
          </div>
        </div>
      ) : null}
      {problem ? (
        <Notice tone="warning" live="assertive">
          {c.problems[problem] ?? c.problems.generic}
        </Notice>
      ) : null}
      {done ? (
        <p role="status" className="muted text-sm">
          {done}
        </p>
      ) : null}

      <section className="stack stack-sm" aria-labelledby="geraete-titel">
        <h3 id="geraete-titel">{c.devicesTitle}</h3>
        {devices.length ? (
          <ul className="list-plain list-divided device-list">
            {devices.map((d) => {
              const name = c.platform[d.platform ?? ""] ?? c.platformUnknown;
              const here = d.endpoint_hash === mineHash;
              return (
                <li key={d.id} className="device-list__item">
                  <div>
                    <p>
                      <strong>{name}</strong> {here ? <Badge tone="brass">{c.thisDevice}</Badge> : null}
                    </p>
                    <p className="muted text-sm">
                      {c.since(formatDate(d.created_at))}
                      {d.last_success_at ? ` · ${c.lastSuccess(formatDate(d.last_success_at))}` : ""}
                    </p>
                  </div>
                  {!here ? (
                    <Button variant="quiet" size="sm" onClick={() => removeDevice(d.id)} disabled={pending} aria-label={c.removeLabel(name, formatDate(d.created_at))}>
                      {c.remove}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">{c.devicesEmpty}</p>
        )}
      </section>
    </div>
  );
}
