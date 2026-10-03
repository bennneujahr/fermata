import { describe, expect, it } from "vitest";
import { parseSse, TextClient } from "./text-client";
import { atemStateFor, decodeDataPacket, parseViolaEvent } from "./types";

describe("Server-Sent Events", () => {
  it("zerlegt Nachrichten auch über Stückgrenzen", () => {
    const a = parseSse('event: sentence\ndata: {"text": "Danke."}\n\nevent: sent');
    expect(a.messages).toEqual([{ event: "sentence", data: '{"text": "Danke."}' }]);
    const b = parseSse(`${a.rest}ence\ndata: {"text": "Und?"}\n\nevent: done\ndata: {}\n\n`);
    expect(b.messages.map((m) => m.event)).toEqual(["sentence", "done"]);
    expect(b.rest).toBe("");
  });
  it("liest Satz für Satz und Ereignisse aus dem Strom", async () => {
    const body = [
      'event: sentence\ndata: {"text": "Danke."}\n\n',
      'event: sentence\ndata: {"text": "Was ist Ihnen wichtig?"}\n\nevent: event\ndata: {"type": "summary_proposed", "text": "Kurz", "partial": false}\n\n',
      'event: done\ndata: {"session_id": "s", "phase": "themen", "ended": false, "end_reason": null, "address_form": "sie", "remaining_seconds": 3000, "covered_blocks": []}\n\n',
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (const part of body) c.enqueue(new TextEncoder().encode(part));
        c.close();
      },
    });
    const fetcher = (async () => new Response(stream, { headers: { "content-type": "text/event-stream" } })) as typeof fetch;
    const client = new TextClient("http://viola.test/v1/text/sessions/s", "tok", fetcher);
    const sentences: string[] = [];
    const events: string[] = [];
    const state = await client.send("Hallo", { onSentence: (s) => sentences.push(s), onEvent: (e) => events.push(e.type) });
    expect(sentences).toEqual(["Danke.", "Was ist Ihnen wichtig?"]);
    expect(events).toEqual(["summary_proposed"]);
    expect(state.remaining_seconds).toBe(3000);
  });
  it("Fehler mit Code", async () => {
    const fetcher = (async () => new Response(JSON.stringify({ error: "not_started" }), { status: 409, headers: { "content-type": "application/json" } })) as typeof fetch;
    const client = new TextClient("http://viola.test/x", "tok", fetcher);
    await expect(client.send("Hallo", { onSentence: () => {}, onEvent: () => {} })).rejects.toMatchObject({ status: 409, code: "not_started" });
  });
});

describe("Ereignisse und Atem", () => {
  it("prüft Datenpakete", () => {
    expect(parseViolaEvent({ type: "ended", reason: "fertig", summary_pending: true })).toEqual({ type: "ended", reason: "fertig", summary_pending: true });
    expect(parseViolaEvent({ type: "unbekannt" })).toBeNull();
    expect(parseViolaEvent({ type: "summary_proposed" })).toBeNull();
    const bytes = new TextEncoder().encode(JSON.stringify({ type: "crisis_resources", lines: { notruf: "112" } }));
    expect(decodeDataPacket(bytes)).toEqual({ type: "crisis_resources", lines: { notruf: "112" } });
    expect(decodeDataPacket(new TextEncoder().encode("kein json"))).toBeNull();
  });
  it("lk.agent.state → Zustand von <fermata-atem>", () => {
    expect(atemStateFor("listening", false)).toBe("hoert");
    expect(atemStateFor("thinking", false)).toBe("denkt");
    expect(atemStateFor("speaking", false)).toBe("spricht");
    expect(atemStateFor("initializing", false)).toBe("ruhig");
    expect(atemStateFor("speaking", true)).toBe("pause");
  });
});
