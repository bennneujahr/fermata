// Ports und Adressen der Testumgebung (siehe docs/bereiche/landing.md).
const dbPort = process.env.DB_PORT ?? "54322";
const functionsPort = Number(process.env.FUNCTIONS_PORT ?? "54331");
const sitePort = Number(process.env.SITE_PORT ?? "4331");
const siteUrl = `http://localhost:${sitePort}`;
const functionsUrl = `http://localhost:${functionsPort}/functions/v1`;

export const E2E = {
  dbUrl: process.env.DATABASE_URL ?? `postgres://postgres:${process.env.DB_PASSWORD ?? "postgres"}@localhost:${dbPort}/postgres`,
  functionsPort,
  functionsUrl,
  sitePort,
  siteUrl,
  get functionsEnv(): Record<string, string> {
    return {
      SUPABASE_DB_URL: this.dbUrl,
      FERMATA_ENV: "test",
      FUNCTIONS_PORT: String(functionsPort),
      FERMATA_SITE_URL: siteUrl,
      FERMATA_ALLOWED_ORIGINS: siteUrl,
      FERMATA_FUNCTIONS_URL: functionsUrl,
      FERMATA_FUNCTIONS_REGION: "none",
    };
  },
};
