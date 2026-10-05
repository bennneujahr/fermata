import { assert, assertEquals, assertMatch } from "@std/assert";
import { cleanup, createMember, dbTest, onboard, req, setupWebTests } from "../_shared/web_test_utils.ts";
import handler, { exportFileName } from "./handler.ts";

const env = setupWebTests();
const DOMAIN = "export.deno.test";

Deno.test("Dateiname mit Datum in Europe/Berlin", () => {
  assertEquals(exportFileName(new Date("2026-10-02T23:30:00Z")), "fermata-datenexport-2026-10-03.json");
});

dbTest("account-export: ohne Anmeldung 401", async () => {
  assertEquals((await handler(req("account-export", { method: "GET" }))).status, 401);
  assertEquals((await handler(req("account-export", { method: "GET", token: "kaputt" }))).status, 401);
});

dbTest("account-export: eigene Daten als Datei, nichts über andere", async () => {
  await cleanup(env, DOMAIN);
  const anna = await createMember(env, `anna@${DOMAIN}`);
  const ben = await createMember(env, `ben@${DOMAIN}`);
  await onboard(env, anna.id, { first: "Anna", last: "Albers", birth: "1990-05-17" });
  await onboard(env, ben.id, { first: "Bernhard", last: "Brandtmeier", birth: "1988-01-01" });
  const res = await handler(req("account-export", { method: "GET", token: anna.token }));
  assertEquals(res.status, 200);
  assertMatch(
    res.headers.get("content-disposition") ?? "",
    /^attachment; filename="fermata-datenexport-\d{4}-\d{2}-\d{2}\.json"$/,
  );
  assertEquals(res.headers.get("cache-control"), "no-store");
  const data = await res.json();
  assertEquals(data.export.format, "fermata-datenexport");
  assertEquals(data.angaben.first_name, "Anna");
  assertEquals(data.besondere_angaben.geschlecht_und_suche.geschlecht, "frau");
  assertEquals(data.anmeldung.email, `anna@${DOMAIN}`);
  assert(data.einwilligungen.length >= 4);
  const text = JSON.stringify(data);
  assert(!text.includes(ben.id) && !text.includes("Bernhard") && !text.includes(`ben@${DOMAIN}`), "nichts über Ben");
  const [audit] = await env
    .sql`select count(*)::int as n from ops.audit_log where action = 'account.exported' and actor = ${anna.id}::uuid`;
  assertEquals(audit!.n, 1);
  await cleanup(env, DOMAIN);
});
