// Wege der Web-App. Eine Stelle für Navigation, Schutz und Weiterleitungen.

export const MEMBER_PREFIXES = ["/start", "/gespraech", "/abende", "/mitgliedschaft", "/konto", "/onboarding"] as const;

export function isMemberPath(path: string): boolean {
  return MEMBER_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export function isAdminPath(path: string): boolean {
  return path === "/admin" || path.startsWith("/admin/");
}

export function isMfaPath(path: string): boolean {
  return path.startsWith("/admin/mfa/");
}

/** Nur eigene, relative Ziele nach der Anmeldung (kein offener Redirect). */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (next.startsWith("/anmelden")) return fallback;
  return next;
}

export function loginRedirectTarget(pathWithSearch: string): string {
  return `/anmelden?weiter=${encodeURIComponent(safeNext(pathWithSearch, "/start"))}`;
}

export const ONBOARDING_STEPS = ["einwilligungen", "angaben", "identitaet", "ausweis"] as const;
export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number];

export function onboardingPath(step: string): string {
  return (ONBOARDING_STEPS as readonly string[]).includes(step) ? `/onboarding/${step}` : "/start";
}
