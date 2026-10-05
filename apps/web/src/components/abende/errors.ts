import type { abende } from "@/copy/abende";

/** Text zu einer Fehlerkennung (hint) aus den Abend-Funktionen. */
export function errorText(c: ReturnType<typeof abende>, code: string, max = 3): string {
  const v = c.errors[code] ?? c.errors.generic!;
  return typeof v === "function" ? v(max) : v;
}
