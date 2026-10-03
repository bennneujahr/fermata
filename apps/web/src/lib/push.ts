// Hilfen für Web-Push im Browser (und in Tests): Schlüssel umwandeln, Plattform erkennen, Adressen vergleichen.

/** VAPID-Schlüssel (base64url) → Bytes für pushManager.subscribe({applicationServerKey}). */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type Platform = "ios" | "android" | "desktop";

/** Grobe Plattform für die Liste der Geräte (iPadOS meldet sich als Mac mit Touch). */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

/** SHA-256 als Hex (um das eigene Abo in der Liste zu erkennen, ohne fremde Adressen zu zeigen). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type PushSupport = { ok: true } | { ok: false; problem: "unsupported" | "ios_browser" };

/** Kann dieser Browser Mitteilungen empfangen? iPhone/iPad nur als installierte Web-App (PLAN 5.2). */
export function pushSupport(env: { hasServiceWorker: boolean; hasPushManager: boolean; hasNotification: boolean; platform: Platform; standalone: boolean }): PushSupport {
  if (env.platform === "ios" && !env.standalone) return { ok: false, problem: "ios_browser" };
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return { ok: false, problem: "unsupported" };
  return { ok: true };
}
