// Umgebungsvariablen an einer Stelle. Geheimnisse kommen nie aus dem Code.
export type Environment = "production" | "staging" | "local" | "test" | "ci";

export function env(name: string, fallback?: string): string {
  const v = Deno.env.get(name);
  if (v !== undefined && v !== "") return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Umgebungsvariable fehlt: ${name}`);
}

export function optionalEnv(name: string): string | undefined {
  const v = Deno.env.get(name);
  return v === undefined || v === "" ? undefined : v;
}

export function environment(): Environment {
  return (optionalEnv("FERMATA_ENV") ?? "production") as Environment;
}

export function isProduction(): boolean {
  return environment() === "production";
}

/** Öffentliche Adressen, die Links in Mails bilden. */
export function siteUrl(): string {
  return env("FERMATA_SITE_URL", "http://localhost:4321").replace(/\/$/, "");
}
export function appUrl(): string {
  return env("FERMATA_APP_URL", "http://localhost:3000").replace(/\/$/, "");
}
