import { assert, assertEquals, assertRejects } from "@std/assert";
import { encodeBase64Url } from "@std/encoding";
import { decodeJwt, JwtError, signHs256, verifyHs256, verifyWithJwks } from "./jwt.ts";
import { createLiveKitToken } from "./livekit.ts";

const SECRET = "0123456789abcdef0123456789abcdef-secret";

Deno.test("HS256: signieren und prüfen", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await signHs256({ sub: "x", exp: now + 60 }, SECRET);
  const payload = await verifyHs256(token, SECRET);
  assertEquals(payload.sub, "x");
});

Deno.test("HS256: falsches Geheimnis, abgelaufen, fehlendes exp", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await signHs256({ sub: "x", exp: now + 60 }, SECRET);
  await assertRejects(() => verifyHs256(token, SECRET + "x"), JwtError);
  const old = await signHs256({ sub: "x", exp: now - 3600 }, SECRET);
  await assertRejects(() => verifyHs256(old, SECRET), JwtError);
  const noExp = await signHs256({ sub: "x" }, SECRET);
  await assertRejects(() => verifyHs256(noExp, SECRET), JwtError);
});

Deno.test("HS256: zu kurzes Geheimnis wird nicht verwendet", async () => {
  await assertRejects(() => signHs256({ sub: "x" }, "kurz"), Error);
});

Deno.test("ES256 über JWKS (neue Supabase-Signierschlüssel)", async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1", alg: "ES256" };
  const enc = new TextEncoder();
  const now = Math.floor(Date.now() / 1000);
  const head = encodeBase64Url(enc.encode(JSON.stringify({ alg: "ES256", typ: "JWT", kid: "k1" })));
  const body = encodeBase64Url(enc.encode(JSON.stringify({ sub: "abc", role: "authenticated", exp: now + 60 })));
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    pair.privateKey,
    enc.encode(`${head}.${body}`),
  );
  const token = `${head}.${body}.${encodeBase64Url(new Uint8Array(sig))}`;
  const fetcher = (() => Promise.resolve(new Response(JSON.stringify({ keys: [jwk] })))) as typeof fetch;
  const payload = await verifyWithJwks(token, "https://example.test/jwks-es256", 30, fetcher);
  assertEquals(payload.sub, "abc");
  const tampered = `${head}.${encodeBase64Url(enc.encode(JSON.stringify({ sub: "evil", exp: now + 60 })))}.${
    token.split(".")[2]
  }`;
  await assertRejects(() => verifyWithJwks(tampered, "https://example.test/jwks-es256", 30, fetcher), JwtError);
});

Deno.test("LiveKit-Token: Raum, nur Mikrofon, Agent-Auftrag, keine Aufnahme", async () => {
  const token = await createLiveKitToken({
    apiKey: "APIkey",
    apiSecret: SECRET,
    room: "sitzung-1",
    identity: "person-sitzung-1",
    ttlSeconds: 600,
    agentName: "viola",
    agentMetadata: { session_id: "sitzung-1" },
  });
  const payload = await verifyHs256(token, SECRET);
  const { header } = decodeJwt(token);
  assertEquals(header.alg, "HS256");
  assertEquals(payload.iss, "APIkey");
  assertEquals(payload.sub, "person-sitzung-1");
  const video = payload.video as Record<string, unknown>;
  assertEquals(video.room, "sitzung-1");
  assertEquals(video.roomJoin, true);
  assertEquals(video.canPublishSources, ["microphone"]);
  const roomConfig = payload.roomConfig as { agents: { agentName: string; metadata: string }[]; egress?: unknown };
  assertEquals(roomConfig.agents[0]!.agentName, "viola");
  assertEquals(JSON.parse(roomConfig.agents[0]!.metadata).session_id, "sitzung-1");
  assert(!("egress" in roomConfig), "keine Aufnahme konfiguriert");
});
