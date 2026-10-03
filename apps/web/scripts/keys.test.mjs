import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sign } from "./keys.mjs";

describe("lokale Schlüssel", () => {
  it("signiert HS256 wie Supabase", () => {
    const t = sign({ role: "anon" }, "geheim");
    const [h, p, s] = t.split(".");
    expect(JSON.parse(Buffer.from(p, "base64url").toString())).toEqual({ role: "anon" });
    expect(s).toBe(createHmac("sha256", "geheim").update(`${h}.${p}`).digest("base64url"));
  });
});
