// Farbton der Abzeichen je Stand (Text steht immer dabei, Farbe trägt nichts allein).
type Tone = "brass" | "success" | "danger" | "warning" | "wine" | undefined;

export function runTone(status: string): Tone {
  return status === "review" ? "brass" : status === "failed" ? "danger" : status === "approved" || status === "partially_approved" ? "success" : undefined;
}

export function reportTone(status: string): Tone {
  return status === "open" ? "danger" : status === "in_review" ? "brass" : status === "resolved" ? "success" : undefined;
}

export function sanctionTone(kind: string): Tone {
  return kind === "ausschluss" ? "danger" : kind === "sperre" || kind === "vorlaeufige_sperre" ? "wine" : "warning";
}
