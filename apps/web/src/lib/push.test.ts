import { describe, expect, it } from "vitest";
import { detectPlatform, pushSupport, sha256Hex, urlBase64ToUint8Array } from "./push";

describe("Web-Push-Hilfen", () => {
  it("VAPID-Schlüssel (base64url) in Bytes", () => {
    const bytes = urlBase64ToUint8Array("BD-uB9JZEOflvYIU6VuHLfP1639B9dNR8mk491RHxynClkGh8HzINhOnRV5iMCv7nXcAYcd3ngjsnH1-oZqNVkI");
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4);
  });
  it("Plattform", () => {
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 15; Pixel 9)")).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("desktop");
  });
  it("iPhone nur als installierte Web-App", () => {
    const base = { hasServiceWorker: true, hasPushManager: true, hasNotification: true, standalone: false };
    expect(pushSupport({ ...base, platform: "ios" })).toEqual({ ok: false, problem: "ios_browser" });
    expect(pushSupport({ ...base, platform: "ios", standalone: true })).toEqual({ ok: true });
    expect(pushSupport({ ...base, platform: "desktop", hasPushManager: false })).toEqual({ ok: false, problem: "unsupported" });
  });
  it("SHA-256", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
