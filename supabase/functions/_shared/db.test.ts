// Enge Rolle der Edge Functions (FERMATA_DB_ROLE): Startparameter und – mit Datenbank – die tatsächliche Rolle.
// Die ganze Testreihe lässt sich mit FERMATA_DB_ROLE=fermata_edge (empfohlen) oder service_role ausführen; dann
// laufen alle Functions mit dieser Rolle, die Testdaten weiter als postgres (siehe docs/RUNBOOK.md Abschnitt 5).
import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import { connect, connectionParams, dbRole, dbUrl } from "./db.ts";

const URL_ = Deno.env.get("SUPABASE_DB_URL") ?? Deno.env.get("DATABASE_URL");

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const before: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    before[k] = Deno.env.get(k);
    if (v === undefined) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

Deno.test("db: FERMATA_DB_ROLE setzt die Rolle als Startparameter, ungültige Namen werden abgelehnt", () => {
  withEnv({ FERMATA_DB_ROLE: "fermata_edge" }, () => {
    assertEquals(dbRole(), "fermata_edge");
    assertEquals(connectionParams(), { application_name: "fermata-edge", options: "-c role=fermata_edge" });
  });
  withEnv({ FERMATA_DB_ROLE: undefined }, () => {
    assertEquals(dbRole(), undefined);
    assertEquals(connectionParams(), { application_name: "fermata-edge" });
  });
  withEnv({ FERMATA_DB_ROLE: "none" }, () => assertEquals(dbRole(), undefined));
  withEnv({ FERMATA_DB_ROLE: "x; drop table y" }, () => {
    assertThrows(() => dbRole(), Error, "ungültig");
  });
});

Deno.test("db: FERMATA_DB_URL (eigene Login-Rolle) geht vor SUPABASE_DB_URL", () => {
  withEnv({ FERMATA_DB_URL: "postgres://fermata_edge_login:x@db.example:5432/postgres", SUPABASE_DB_URL: "postgres://postgres:y@db.example/postgres" }, () => {
    assertEquals(dbUrl(), "postgres://fermata_edge_login:x@db.example:5432/postgres");
  });
  withEnv({ FERMATA_DB_URL: undefined, SUPABASE_DB_URL: "postgres://postgres:y@db.example/postgres" }, () => {
    assertEquals(dbUrl(), "postgres://postgres:y@db.example/postgres");
  });
});

Deno.test({
  name: "db: Verbindung läuft in der engen Rolle; fermata_edge liest weder Vault noch Art.-9-Daten noch auth.users",
  ignore: !URL_,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const before = Deno.env.get("FERMATA_DB_ROLE");
    Deno.env.set("FERMATA_DB_ROLE", "fermata_edge");
    const sql = connect(URL_!, { max: 1 });
    try {
      const [row] = await sql`select current_user as role, session_user as login`;
      assertEquals(row!.role, "fermata_edge");
      await assertRejects(() => sql`select count(*) from vault.decrypted_secrets`, Error, "permission denied");
      await assertRejects(() => sql`select count(*) from sensitive.profile_identity`, Error, "permission denied");
      await assertRejects(() => sql`select count(*) from auth.users`, Error, "permission denied");
      const [ok] = await sql`select ops.setting_text('site.app_url') as url`;
      assert(String(ok!.url).startsWith("https://"), "Fermata-Funktionen bleiben nutzbar");
      // Wie asUser: Wechsel in authenticated innerhalb einer Transaktion
      const [m] = await sql.begin(async (tx) => {
        await tx`set local role authenticated`;
        return await tx`select current_user as role`;
      });
      assertEquals(m!.role, "authenticated");
    } finally {
      await sql.end();
      if (before === undefined) Deno.env.delete("FERMATA_DB_ROLE");
      else Deno.env.set("FERMATA_DB_ROLE", before);
    }
  },
});

Deno.test({
  name: "db: Testreihe mit FERMATA_DB_ROLE – die Functions laufen wirklich in dieser Rolle",
  ignore: !URL_ || !Deno.env.get("FERMATA_DB_ROLE"),
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { setupWebTests } = await import("./web_test_utils.ts");
    setupWebTests();
    const { db } = await import("./db.ts");
    const [row] = await db()`select current_user as role`;
    assertEquals(row!.role, Deno.env.get("FERMATA_DB_ROLE"));
  },
});
