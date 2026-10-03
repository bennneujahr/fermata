// Didit (Ausweisprüfung, PLAN 2.3 Nr. 3, 5.5). Nur die Felder, die Fermata zum Abgleich braucht.

/** Status in Fermatas Sprache (app.verifications.status ohne started/blocked). */
export type VerificationOutcome = "approved" | "declined" | "in_review" | "expired" | "error";

export interface DiditSession {
  sessionId: string;
  url: string;
}

/**
 * Was aus der Entscheidung von Didit gelesen wird. Die Werte werden nur verglichen bzw. gehasht
 * (ops.verification_complete) und nie gespeichert oder protokolliert.
 */
export interface DiditDecision {
  sessionId: string;
  outcome: VerificationOutcome | null;
  firstName: string | null;
  lastName: string | null;
  /** ISO-Datum YYYY-MM-DD */
  birthDate: string | null;
  documentNumber: string | null;
}

export interface DiditClient {
  readonly mode: "live" | "fake";
  createSession(input: { vendorData: string; callbackUrl: string }): Promise<DiditSession>;
  /** Entscheidung abrufen. Im Fake-Modus stammt sie aus dem (signierten) Webhook. */
  getDecision(sessionId: string, webhookBody: unknown): Promise<DiditDecision>;
  /** „Process and purge“: Sitzung samt Bildern bei Didit löschen. */
  deleteSession(sessionId: string): Promise<void>;
}
