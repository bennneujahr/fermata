// Direkter Datenbankzugang für Edge Functions (SUPABASE_DB_URL ist in Supabase Functions gesetzt).
// Regeln liegen in SQL-Funktionen (Schema api); die Functions rufen sie nur auf.
//
// Enge Rolle (Härtung, DSFA M-1): Mit FERMATA_DB_ROLE=service_role wechselt jede Verbindung gleich beim Aufbau in
// diese Rolle (Startparameter options=-c role=…). service_role liest weder sensitive.* noch Vault noch auth.users;
// alles Nötige läuft über security-definer-Funktionen. Mit FERMATA_DB_URL lässt sich eine eigene Login-Rolle
// (fermata_edge, nur Mitglied von service_role, authenticated und fermata_agent) statt postgres verwenden –
// Supabase erlaubt keine eigenen Geheimnisse mit dem Präfix SUPABASE_. Einrichtung: docs/RUNBOOK.md Abschnitt 5.
import postgres from "postgres";
import { env, optionalEnv } from "./env.ts";

export type Sql = ReturnType<typeof postgres>;
let cached: Sql | undefined;

const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

/** Rolle, in die jede Verbindung wechselt (oder undefined = Login-Rolle behalten). */
export function dbRole(): string | undefined {
  const role = optionalEnv("FERMATA_DB_ROLE");
  if (!role || role === "none") return undefined;
  if (!ROLE_NAME.test(role)) throw new Error(`FERMATA_DB_ROLE ungültig: ${role}`);
  return role;
}

/** Verbindungsadresse: FERMATA_DB_URL (eigene Login-Rolle) vor SUPABASE_DB_URL vor DATABASE_URL. */
export function dbUrl(): string {
  return optionalEnv("FERMATA_DB_URL") ?? env("SUPABASE_DB_URL", Deno.env.get("DATABASE_URL"));
}

/** Startparameter jeder Verbindung (Name für pg_stat_activity, ggf. Rollenwechsel). */
export function connectionParams(applicationName = "fermata-edge"): Record<string, string> {
  const role = dbRole();
  return role ? { application_name: applicationName, options: `-c role=${role}` } : { application_name: applicationName };
}

/** Neue Verbindung mit denselben Regeln wie db() (auch für Tests, die eine eigene Verbindung brauchen). */
export function connect(url = dbUrl(), opts: { max?: number; applicationName?: string } = {}): Sql {
  return postgres(url, {
    prepare: false, // verträgt den Transaktions-Pooler
    max: opts.max ?? 3,
    idle_timeout: 20,
    connection: connectionParams(opts.applicationName),
    onnotice: () => {},
  });
}

export function db(): Sql {
  if (!cached) cached = connect();
  return cached;
}

/** Nur für Tests: eigene Verbindung setzen. */
export function setDb(sql: Sql | undefined): void {
  cached = sql;
}
