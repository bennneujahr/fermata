import { assertEquals } from "@std/assert";
import { dbTest, post, reset, setSetting, setup, teardown } from "../waitlist-signup/test_utils.ts";
import handler from "./handler.ts";

const { sql, mailer } = setup();
const hits = async () =>
  (await sql`select slug, count from public.link_hits order by slug`).map((r) => `${r.slug}=${r.count}`);

dbTest("Zählt je Kürzel und Tag, ohne weitere Daten", async () => {
  await reset(sql, mailer);
  for (const slug of ["pfaffenteich", "pfaffenteich", "Bahnhof"]) {
    assertEquals(await (await handler(post("link-hit", { slug }))).json(), { counted: true });
  }
  assertEquals(await (await handler(post("link-hit", { slug: "../../etc" }))).json(), { counted: false });
  assertEquals(await hits(), ["bahnhof=1", "pfaffenteich=2"]);
  const cols =
    await sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'link_hits' order by 1`;
  assertEquals(cols.map((c) => c.column_name), ["count", "day", "slug"]);
});

dbTest("Freigabeliste und Geheimnis", async () => {
  await reset(sql, mailer);
  await setSetting(sql, "landing.poster_codes", ["pfaffenteich"]);
  assertEquals(await (await handler(post("link-hit", { slug: "unbekannt" }))).json(), { counted: false });
  assertEquals(await (await handler(post("link-hit", { slug: "pfaffenteich" }))).json(), { counted: true });
  Deno.env.set("LINK_HIT_SECRET", "geheim-123");
  assertEquals((await handler(post("link-hit", { slug: "pfaffenteich" }))).status, 401);
  const ok = await handler(post("link-hit", { slug: "pfaffenteich" }, { "x-fermata-link-secret": "geheim-123" }));
  assertEquals(ok.status, 200);
  Deno.env.delete("LINK_HIT_SECRET");
  assertEquals(await hits(), ["pfaffenteich=2"]);
});

dbTest("Aufräumen", () => teardown(sql, mailer));
