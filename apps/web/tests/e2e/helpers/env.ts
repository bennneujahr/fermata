import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Liest apps/web/.stack/env (geschrieben von scripts/stack.sh up). */
export function loadStackEnv(): Record<string, string> {
  const file = fileURLToPath(new URL("../../../.stack/env", import.meta.url));
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]!] = m[2]!;
  }
  for (const [k, v] of Object.entries(out)) process.env[k] ??= v;
  return out;
}

export const stack = loadStackEnv();
