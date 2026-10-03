import { assert, assertEquals, assertRejects } from "@std/assert";
import { hmacSha256Hex } from "../crypto.ts";
import {
  FakeDiditClient,
  LiveDiditClient,
  mapStatus,
  parseDecision,
  signDiditBody,
  verifyDiditSignature,
} from "./mod.ts";

Deno.test("Status von Didit → Fermata", () => {
  assertEquals(mapStatus("Approved"), "approved");
  assertEquals(mapStatus("Declined"), "declined");
  assertEquals(mapStatus("In Review"), "in_review");
  assertEquals(mapStatus("IN_REVIEW"), "in_review");
  assertEquals(mapStatus("Abandoned"), "expired");
  assertEquals(mapStatus("Expired"), "expired");
  assertEquals(mapStatus("Not Started"), null);
  assertEquals(mapStatus("In Progress"), null);
  assertEquals(mapStatus(undefined), null);
});

Deno.test("Entscheidung lesen: id_verification, id_verifications[] und kyc", () => {
  const v2 = parseDecision({
    session_id: "s1",
    status: "Approved",
    id_verification: {
      first_name: "Anna Maria",
      last_name: "Albers",
      date_of_birth: "1990-05-17",
      document_number: "L01X00T47",
      portrait_image: "https://x",
    },
  });
  assertEquals(v2, {
    sessionId: "s1",
    outcome: "approved",
    firstName: "Anna Maria",
    lastName: "Albers",
    birthDate: "1990-05-17",
    documentNumber: "L01X00T47",
  });
  const v3 = parseDecision({
    session_id: "s2",
    status: "Declined",
    id_verifications: [{ full_name: "Ben Elias Brandt", date_of_birth: "1991-02-03" }],
  });
  assertEquals(v3.firstName, "Ben Elias");
  assertEquals(v3.lastName, "Brandt");
  assertEquals(v3.outcome, "declined");
  const v1 = parseDecision({
    status: "Approved",
    kyc: { first_name: "Eva", last_name: "Ernst", date_of_birth: "1985-13-01" },
  }, "s3");
  assertEquals(v1.sessionId, "s3");
  assertEquals(v1.birthDate, null, "ungültiges Datum wird verworfen");
  assertEquals(parseDecision(null).outcome, null);
});

Deno.test("Webhook-Signatur: gültig, falsch, veraltet, fehlend", async () => {
  const body = JSON.stringify({ session_id: "s1", status: "Approved" });
  const now = 1_800_000_000;
  const headers = new Headers(await signDiditBody(body, "geheim", now));
  assertEquals(headers.get("x-signature"), await hmacSha256Hex("geheim", body));
  assertEquals(await verifyDiditSignature(body, headers, "geheim", now + 10), { ok: true });
  assertEquals(await verifyDiditSignature(body + " ", headers, "geheim", now), { ok: false, reason: "mismatch" });
  assertEquals(await verifyDiditSignature(body, headers, "anderes", now), { ok: false, reason: "mismatch" });
  assertEquals(await verifyDiditSignature(body, headers, "geheim", now + 301), { ok: false, reason: "stale" });
  assertEquals(await verifyDiditSignature(body, headers, "geheim", now - 301), { ok: false, reason: "stale" });
  assertEquals(await verifyDiditSignature(body, new Headers(), "geheim", now), { ok: false, reason: "missing" });
  const upper = new Headers(headers);
  upper.set("x-signature", headers.get("x-signature")!.toUpperCase());
  assertEquals(await verifyDiditSignature(body, upper, "geheim", now), { ok: true }, "Groß/klein im Hex egal");
});

Deno.test("Fake-Didit: Sitzung, Entscheidung aus dem Webhook, Löschung", async () => {
  const fake = new FakeDiditClient("http://localhost:3041/");
  const s = await fake.createSession({
    vendorData: "v1",
    callbackUrl: "http://localhost:3041/onboarding/ausweis/zurueck",
  });
  assert(s.sessionId.startsWith("fake_"));
  assertEquals(s.url, `http://localhost:3041/onboarding/ausweis/simulation?sitzung=${s.sessionId}`);
  const d = await fake.getDecision(s.sessionId, {
    session_id: s.sessionId,
    status: "Approved",
    decision: {
      status: "Approved",
      id_verification: { first_name: "Anna", last_name: "Albers", date_of_birth: "1990-05-17", document_number: "X1" },
    },
  });
  assertEquals(d.firstName, "Anna");
  assertEquals(d.outcome, "approved");
  await fake.deleteSession(s.sessionId);
  assertEquals(fake.deleted, [s.sessionId]);
  fake.failDelete = true;
  await assertRejects(() => fake.deleteSession("x"));
});

Deno.test("Live-Client: Pfade, Header und Löschen", async () => {
  const calls: { url: string; method: string; key: string | null; body?: string }[] = [];
  const fetchMock: typeof fetch = (input, init) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? "GET",
      key: new Headers(init?.headers).get("x-api-key"),
      body: init?.body as string | undefined,
    });
    if (url.endsWith("/v2/session/")) {
      return Promise.resolve(Response.json({ session_id: "abc", url: "https://verify.didit.me/session/abc" }));
    }
    if (url.endsWith("/decision/")) {
      return Promise.resolve(
        Response.json({
          session_id: "abc",
          status: "Approved",
          id_verification: { first_name: "A", last_name: "B", date_of_birth: "2000-01-01" },
        }),
      );
    }
    if (url.endsWith("/delete/")) return Promise.resolve(new Response(null, { status: 404 }));
    return Promise.resolve(new Response("", { status: 500 }));
  };
  const c = new LiveDiditClient("key-1", "wf-1", "https://verification.didit.me", fetchMock);
  const s = await c.createSession({ vendorData: "ver-1", callbackUrl: "https://app/x" });
  assertEquals(s, { sessionId: "abc", url: "https://verify.didit.me/session/abc" });
  assertEquals(JSON.parse(calls[0]!.body!), { workflow_id: "wf-1", vendor_data: "ver-1", callback: "https://app/x" });
  assertEquals(calls[0]!.key, "key-1");
  assertEquals((await c.getDecision("abc")).birthDate, "2000-01-01");
  await c.deleteSession("abc"); // 404 gilt als gelöscht
  assertEquals(calls[2]!.method, "DELETE");
  assertEquals(calls[2]!.url, "https://verification.didit.me/v2/session/abc/delete/");
});
