// Prüfungen für Formulare. Die Datenbank prüft dasselbe noch einmal (api.save_facts); hier nur für schnelle Rückmeldung.
import { z } from "zod";

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const OTP_RE = /^[0-9]{6}$/;
export const PLZ_RE = /^[0-9]{5}$/;
export const PHONE_RE = /^\+?[0-9 ()/-]{6,24}$/;
export const NAME_FORBIDDEN_RE = /[0-9<>@#$%^&*_=+{}|\\/:;"!?[\]]/;

export function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

export function isEmail(v: string): boolean {
  const e = normalizeEmail(v);
  return e.length <= 254 && EMAIL_RE.test(e);
}

/** Code aus der Mail: Leerzeichen und Bindestriche erlaubt („123 456“). */
export function normalizeOtp(v: string): string {
  return v.replace(/[\s-]/g, "");
}

export function cleanName(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

/** Alter in vollen Jahren an einem Datum (beide als YYYY-MM-DD). */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age--;
  return age;
}

export function berlinToday(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(now);
}

export const factsSchema = z.object({
  first_name: z.string().transform(cleanName).pipe(z.string().min(1, "required").max(80, "invalid_name").refine((v) => !NAME_FORBIDDEN_RE.test(v), "invalid_name")),
  last_name: z.string().transform(cleanName).pipe(z.string().min(1, "required").max(80, "invalid_name").refine((v) => !NAME_FORBIDDEN_RE.test(v), "invalid_name")),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_birth_date"),
  postal_code: z.string().trim().regex(PLZ_RE, "invalid_postal_code"),
  city: z.string().transform(cleanName).pipe(z.string().max(80, "invalid_city")).optional(),
  phone: z.string().transform(cleanName).pipe(z.string().refine((v) => v === "" || PHONE_RE.test(v), "invalid_phone")).optional(),
  street: z.string().transform(cleanName).pipe(z.string().max(120, "invalid_street")).optional(),
});

export type FactsInput = z.infer<typeof factsSchema>;

/** Liefert Feld → Fehlerschlüssel (für copy.factsStep.errors). */
export function validateFacts(input: Record<string, unknown>, today = berlinToday(), minAge = 18): { data?: FactsInput; errors: Record<string, string> } {
  const parsed = factsSchema.safeParse(input);
  const errors: Record<string, string> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message === "required" || issue.code === "too_small" ? "required" : issue.message;
    }
    return { errors };
  }
  const d = parsed.data;
  const birth = new Date(`${d.birth_date}T00:00:00Z`);
  if (Number.isNaN(birth.getTime()) || d.birth_date < "1900-01-01" || d.birth_date > today) errors.birth_date = "invalid_birth_date";
  else if (ageOn(d.birth_date, today) < minAge) errors.birth_date = "too_young";
  return Object.keys(errors).length ? { errors } : { data: d, errors };
}
