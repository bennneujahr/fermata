import { describe, expect, it } from "vitest";
import { buildCsp, newNonce, originOf } from "./csp";

describe("Content-Security-Policy", () => {
  const csp = buildCsp({ nonce: "abc", supabaseUrl: "https://xyz.supabase.co/" });
  it("Skripte nur mit Nonce, ohne unsafe-inline und unsafe-eval", () => {
    const script = /script-src ([^;]+)/.exec(csp)![1]!;
    expect(script).toContain("'nonce-abc'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("unsafe-inline");
    expect(script).not.toContain("unsafe-eval");
    expect(/style-src ([^;]+)/.exec(csp)![1]).not.toContain("unsafe-inline");
  });
  it("Verbindungen nur zur eigenen Seite und zu Supabase", () => {
    expect(/connect-src ([^;]+)/.exec(csp)![1]).toBe("'self' https://xyz.supabase.co wss://xyz.supabase.co");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });
  it("Erweiterungen für Stripe/LiveKit über Variablen", () => {
    const c = buildCsp({ nonce: "n", supabaseUrl: "https://x.supabase.co", extraConnect: ["https://api.stripe.com"], extraFrame: ["https://js.stripe.com"] });
    expect(c).toContain("https://api.stripe.com");
    expect(c).toContain("frame-src https://js.stripe.com");
  });
  it("lokal ohne upgrade-insecure-requests, in Entwicklung mit unsafe-eval", () => {
    expect(buildCsp({ nonce: "n", supabaseUrl: "http://localhost:54345" })).not.toContain("upgrade-insecure-requests");
    expect(buildCsp({ nonce: "n", supabaseUrl: "http://localhost:54345", dev: true })).toContain("'unsafe-eval'");
  });
  it("Nonce ist zufällig und Base64", () => {
    const a = newNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/=]{20,}$/);
    expect(newNonce()).not.toBe(a);
    expect(originOf("kaputt")).toBeNull();
  });
});
