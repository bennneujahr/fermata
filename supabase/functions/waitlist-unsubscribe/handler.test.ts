import { assertEquals } from "@std/assert";
import confirm from "../waitlist-confirm/handler.ts";
import signup from "../waitlist-signup/handler.ts";
import { confirmToken, dbTest, fragmentToken, post, reset, setup, signupBody, teardown } from "../waitlist-signup/test_utils.ts";
import handler from "./handler.ts";

const { sql, mailer } = setup();

async function confirmed(email: string): Promise<{ u: string; t: string }> {
  await signup(post("waitlist-signup", signupBody({ email })));
  const res = await confirm(new Request(`http://localhost/x?t=${confirmToken(mailer.sent.at(-1))}`));
  return { u: fragmentToken(mailer.sent.at(-1)!.text, "u"), t: fragmentToken(res.headers.get("location")!, "t") };
}
const count = async () => (await sql`select count(*)::int as n from public.waitlist`)[0]!.n;

dbTest("Abmeldung über den Link aus der Mail löscht den Eintrag", async () => {
  await reset(sql, mailer);
  const { u } = await confirmed("anna@example.org");
  assertEquals(await count(), 1);
  const res = await handler(post("waitlist-unsubscribe", { t: u }));
  assertEquals([res.status, await res.json()], [200, { ok: true }]);
  assertEquals(await count(), 0);
  assertEquals((await sql`select count(*)::int as n from public.waitlist_invites`)[0]!.n, 0, "Einladungscodes verfallen mit");
});

dbTest("Abmeldung über den Statuslink; unbekannte Links bekommen dieselbe Antwort", async () => {
  await reset(sql, mailer);
  const { t } = await confirmed("ben@example.org");
  assertEquals((await handler(post("waitlist-unsubscribe", { t }))).status, 200);
  assertEquals(await count(), 0);
  const unknown = await handler(post("waitlist-unsubscribe", { t: "y".repeat(43) }));
  assertEquals([unknown.status, await unknown.json()], [200, { ok: true }]);
  assertEquals((await handler(new Request("http://localhost/x"))).status, 405, "GET meldet niemanden ab");
});

dbTest("Aufräumen", () => teardown(sql, mailer));
