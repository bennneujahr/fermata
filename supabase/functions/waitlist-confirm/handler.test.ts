import { assert, assertEquals, assertMatch, assertStringIncludes } from "@std/assert";
import signup from "../waitlist-signup/handler.ts";
import {
  confirmToken,
  dbTest,
  fragmentToken,
  post,
  reset,
  setup,
  signupBody,
  SITE,
  teardown,
} from "../waitlist-signup/test_utils.ts";
import status from "../waitlist-status/handler.ts";
import handler from "./handler.ts";

const { sql, mailer } = setup();

const confirmReq = (token: string, method = "GET") =>
  new Request(`http://localhost/functions/v1/waitlist-confirm?t=${token}`, { method });

async function signupAndConfirm(email: string, extra: Record<string, unknown> = {}) {
  const before = mailer.sent.length;
  assertEquals((await signup(post("waitlist-signup", signupBody({ email, ...extra })))).status, 202);
  const res = await handler(confirmReq(confirmToken(mailer.sent[before])));
  assertEquals(res.status, 303);
  return { location: res.headers.get("location")!, welcome: mailer.sent[mailer.sent.length - 1]! };
}

dbTest(
  "Bestätigung: Weiterleitung mit Statuslink im Fragment, Willkommens-Mail mit Platz, Einladung, Abmeldung",
  async () => {
    await reset(sql, mailer);
    const { location, welcome } = await signupAndConfirm("anna@example.org");
    assertMatch(location, new RegExp(`^${SITE}/willkommen#t=[A-Za-z0-9_-]{43}$`));
    assertEquals(welcome.template, "waitlist.welcome");
    assertStringIncludes(
      welcome.text,
      "Zum Zeitpunkt der Bestätigung haben Sie Platz 1 auf der Warteliste für Westmecklenburg.",
    );
    assertStringIncludes(welcome.text, "Gründungsmitglied");
    const [{ code }] = await sql`select code from public.waitlist_invites`;
    assertStringIncludes(welcome.text, `${SITE}/?e=${code}`);
    assertMatch(welcome.text, new RegExp(`Abmelden: ${SITE}/abmelden#u=[A-Za-z0-9_-]{43}`));
    assertStringIncludes(welcome.text, location, "Die Mail enthält denselben Statuslink");

    // Statusseite mit dem Token aus dem Fragment
    const res = await status(post("waitlist-status", { t: fragmentToken(location, "t") }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.place, 1);
    assertEquals(body.is_founding_member, true);
    assertEquals(body.founding_limit, 500);
    assertEquals(body.region_group, "westmecklenburg");
    assertEquals(body.invites, [{ code, used: false }]);
    assert(!("email" in body), "Die Statusseite gibt keine Mailadresse heraus");
  },
);

dbTest("Zweiter Klick, falscher und abgelaufener Link führen zur Seite „abgelaufen“", async () => {
  await reset(sql, mailer);
  await signup(post("waitlist-signup", signupBody({ email: "ben@example.org" })));
  const token = confirmToken(mailer.sent.at(-1));
  assertEquals((await handler(confirmReq(token, "HEAD"))).status, 405, "HEAD (Link-Vorschau) bestätigt nicht");
  assertEquals(
    (await handler(confirmReq(token))).headers.get("location"),
    `${SITE}/willkommen#t=${fragmentToken(mailer.sent.at(-1)!.text, "t")}`,
  );
  assertEquals((await handler(confirmReq(token))).headers.get("location"), `${SITE}/bestaetigung-abgelaufen`);
  assertEquals((await handler(confirmReq("kaputt"))).headers.get("location"), `${SITE}/bestaetigung-abgelaufen`);

  await signup(post("waitlist-signup", signupBody({ email: "spaet@example.org" })));
  const late = confirmToken(mailer.sent.at(-1));
  await sql`select ops.sim_clock_advance(interval '73 hours')`;
  assertEquals((await handler(confirmReq(late))).headers.get("location"), `${SITE}/bestaetigung-abgelaufen`);
  await sql`select ops.sim_clock_reset()`;
});

dbTest("Einladung: beide rücken vor, die Mail sagt es", async () => {
  await reset(sql, mailer);
  await signupAndConfirm("w1@example.org");
  await signupAndConfirm("w2@example.org");
  const { location: hostLoc } = await signupAndConfirm("w3@example.org");
  const [{ code }] =
    await sql`select i.code from public.waitlist_invites i join public.waitlist w on w.id = i.inviter_id where w.email = 'w3@example.org'`;
  const { welcome, location } = await signupAndConfirm("gast@example.org", {
    invite: code,
    region: "ludwigslust-parchim",
  });
  assertStringIncludes(welcome.text, "Sie wurden persönlich eingeladen.");
  assertStringIncludes(welcome.text, "Platz 2");
  const host = await (await status(post("waitlist-status", { t: fragmentToken(hostLoc, "t") }))).json();
  assertEquals([host.place, host.bonus_steps, host.invites[0].used], [1, 1, true]);
  const guest = await (await status(post("waitlist-status", { t: fragmentToken(location, "t") }))).json();
  assertEquals([guest.place, guest.bonus_steps], [2, 1]);
});

dbTest("Schon bestätigt: erneute Anmeldung schickt einen neuen Statuslink, der alte gilt nicht mehr", async () => {
  await reset(sql, mailer);
  const { location } = await signupAndConfirm("anna@example.org");
  await sql`select ops.sim_clock_advance(interval '11 minutes')`;
  const res = await signup(post("waitlist-signup", signupBody({ email: "anna@example.org" })));
  assertEquals(res.status, 202);
  assertEquals(await res.json(), { ok: true });
  const mail = mailer.sent.at(-1)!;
  assertEquals(mail.template, "waitlist.already");
  const fresh = fragmentToken(mail.text, "t");
  assertEquals((await status(post("waitlist-status", { t: fragmentToken(location, "t") }))).status, 404);
  assertEquals((await status(post("waitlist-status", { t: fresh }))).status, 200);
  await sql`select ops.sim_clock_reset()`;
});

dbTest("Statusabfrage: ungültige Anfragen", async () => {
  assertEquals((await status(post("waitlist-status", { t: "x".repeat(43) }))).status, 404);
  assertEquals((await status(post("waitlist-status", { t: "kurz" }))).status, 404);
  assertEquals((await status(post("waitlist-status", { falsch: 1 }))).status, 400);
  assertEquals(
    (await status(new Request("http://localhost/x?t=abc"))).status,
    405,
    "Kein GET mit Token in der Adresse",
  );
});

dbTest("Aufräumen", () => teardown(sql, mailer));
