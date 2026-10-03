// Auswahl des Didit-Clients: DIDIT_MODE=live (Standard) oder fake (nur außerhalb von production).
import { appUrl, env, environment, optionalEnv } from "../env.ts";
import { LiveDiditClient } from "./client.ts";
import { FakeDiditClient } from "./fake.ts";
import type { DiditClient } from "./types.ts";

export type { DiditClient, DiditDecision, DiditSession, VerificationOutcome } from "./types.ts";
export { mapStatus, parseDecision } from "./decision.ts";
export { signDiditBody, verifyDiditSignature } from "./signature.ts";
export { FakeDiditClient } from "./fake.ts";
export { LiveDiditClient } from "./client.ts";

let override: DiditClient | undefined;

/** Nur für Tests. */
export function setDidit(c: DiditClient | undefined): void {
  override = c;
}

export function diditMode(): "live" | "fake" {
  return optionalEnv("DIDIT_MODE") === "fake" ? "fake" : "live";
}

export function didit(): DiditClient {
  if (override) return override;
  if (diditMode() === "fake") {
    if (environment() === "production") throw new Error("DIDIT_MODE=fake ist in production gesperrt");
    return new FakeDiditClient(appUrl());
  }
  return new LiveDiditClient(env("DIDIT_API_KEY"), env("DIDIT_WORKFLOW_ID"), optionalEnv("DIDIT_API_BASE") ?? "https://verification.didit.me");
}

/** Webhook-Geheimnis. Im Fake-Modus gibt es einen festen Ersatz für lokal (nie in production). */
export function diditWebhookSecret(): string {
  const s = optionalEnv("DIDIT_WEBHOOK_SECRET");
  if (s) return s;
  if (diditMode() === "fake" && environment() !== "production") return "fermata-fake-didit-secret";
  throw new Error("DIDIT_WEBHOOK_SECRET fehlt");
}
