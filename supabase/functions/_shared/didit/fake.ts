// Fake-Didit für lokal und Tests (DIDIT_MODE=fake). In production gesperrt (mod.ts).
// Ablauf lokal: verification-start liefert die Simulationsseite der Web-App; dort wählt man
// „bestätigen“, „ablehnen“ …; die Web-App schickt dann einen signierten Webhook wie Didit,
// dessen decision dieser Client als Entscheidung übernimmt.
import { parseDecision } from "./decision.ts";
import type { DiditClient, DiditDecision, DiditSession } from "./types.ts";

export class FakeDiditClient implements DiditClient {
  readonly mode = "fake" as const;
  /** Gelöschte Sitzungen (für Tests). */
  readonly deleted: string[] = [];
  /** Angelegte Sitzungen (für Tests). */
  readonly created: { sessionId: string; vendorData: string; callbackUrl: string }[] = [];
  failDelete = false;

  constructor(private appUrl: string) {}

  createSession(input: { vendorData: string; callbackUrl: string }): Promise<DiditSession> {
    const sessionId = `fake_${crypto.randomUUID()}`;
    this.created.push({ sessionId, ...input });
    const url = `${this.appUrl.replace(/\/$/, "")}/onboarding/ausweis/simulation?sitzung=${
      encodeURIComponent(sessionId)
    }`;
    return Promise.resolve({ sessionId, url });
  }

  getDecision(sessionId: string, webhookBody: unknown): Promise<DiditDecision> {
    const body = (typeof webhookBody === "object" && webhookBody !== null ? webhookBody : {}) as Record<
      string,
      unknown
    >;
    const decision = parseDecision(body.decision ?? body, sessionId);
    return Promise.resolve({
      ...decision,
      sessionId,
      outcome: decision.outcome ?? parseDecision(body, sessionId).outcome,
    });
  }

  deleteSession(sessionId: string): Promise<void> {
    if (this.failDelete) return Promise.reject(new Error("fake delete failed"));
    this.deleted.push(sessionId);
    return Promise.resolve();
  }
}
