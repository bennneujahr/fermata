// Web-Push versenden: verschlüsseln (RFC 8291), mit VAPID ausweisen (RFC 8292), an den Push-Dienst schicken.
// Push-Texte sind kurz und ohne Namen (PLAN 2.2, 5.2): sie laufen über Apple, Google oder Mozilla.
import { optionalEnv } from "../env.ts";
import { b64uDecode, encryptPushPayload } from "./ece.ts";
import { importVapid, type Vapid, vapidAuthorization } from "./vapid.ts";

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Inhalt, den der Service Worker der Web-App anzeigt. */
export interface PushMessage {
  title: string;
  body: string;
  /** Pfad in der Web-App, z. B. /abende/<id> */
  url: string;
  tag?: string;
  safety?: boolean;
}

export type PushOutcome = "sent" | "gone" | "failed";

export interface PushResult {
  status: number;
  outcome: PushOutcome;
  error?: string;
}

export interface PushOptions {
  ttl: number;
  urgency?: "very-low" | "low" | "normal" | "high";
  /** Höchstens 32 Zeichen base64url; ersetzt eine noch nicht zugestellte Nachricht mit gleichem Thema. */
  topic?: string;
}

export interface PushSender {
  send(target: PushTarget, message: PushMessage, opts: PushOptions): Promise<PushResult>;
}

export class WebPushSender implements PushSender {
  constructor(private vapid: Vapid, private fetchFn: typeof fetch = fetch) {}

  async send(target: PushTarget, message: PushMessage, opts: PushOptions): Promise<PushResult> {
    let body: Uint8Array;
    try {
      body = await encryptPushPayload(
        b64uDecode(target.p256dh),
        b64uDecode(target.auth),
        new TextEncoder().encode(JSON.stringify(message)),
      );
    } catch (err) {
      // Kaputte Schlüssel im Abo: wie „nicht mehr gültig“ behandeln.
      return { status: 410, outcome: "gone", error: `Schlüssel ungültig: ${(err as Error).message}` };
    }
    const headers: Record<string, string> = {
      authorization: await vapidAuthorization(this.vapid, target.endpoint),
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: String(Math.max(0, Math.floor(opts.ttl))),
      urgency: opts.urgency ?? "normal",
    };
    if (opts.topic && /^[A-Za-z0-9_-]{1,32}$/.test(opts.topic)) headers.topic = opts.topic;
    try {
      const res = await this.fetchFn(target.endpoint, { method: "POST", headers, body: body as BodyInit });
      await res.body?.cancel();
      if (res.status >= 200 && res.status < 300) return { status: res.status, outcome: "sent" };
      if (res.status === 404 || res.status === 410) return { status: res.status, outcome: "gone" };
      return { status: res.status, outcome: "failed", error: `Push-Dienst antwortet ${res.status}` };
    } catch (err) {
      return { status: 0, outcome: "failed", error: `Netzwerkfehler: ${(err as Error).message}` };
    }
  }
}

/** Sender aus der Umgebung, oder null, wenn VAPID nicht eingerichtet ist (dann nur E-Mail). */
export async function pushSenderFromEnv(fetchFn: typeof fetch = fetch): Promise<PushSender | null> {
  const pub = optionalEnv("VAPID_PUBLIC_KEY");
  const priv = optionalEnv("VAPID_PRIVATE_KEY");
  const subject = optionalEnv("VAPID_SUBJECT");
  if (!pub || !priv || !subject) return null;
  return new WebPushSender(await importVapid(pub, priv, subject), fetchFn);
}
