// Direkter Datenbankzugang für Edge Functions (SUPABASE_DB_URL ist in Supabase Functions gesetzt).
// Regeln liegen in SQL-Funktionen (Schema api); die Functions rufen sie nur auf.
import postgres from "postgres";
import { env } from "./env.ts";

export type Sql = ReturnType<typeof postgres>;
let cached: Sql | undefined;

export function db(): Sql {
  if (!cached) {
    cached = postgres(env("SUPABASE_DB_URL", Deno.env.get("DATABASE_URL")), {
      prepare: false, // verträgt den Transaktions-Pooler
      max: 3,
      idle_timeout: 20,
      connection: { application_name: "fermata-edge" },
      onnotice: () => {},
    });
  }
  return cached;
}

/** Nur für Tests: eigene Verbindung setzen. */
export function setDb(sql: Sql | undefined): void {
  cached = sql;
}
