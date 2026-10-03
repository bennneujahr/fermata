// Sicherheits-Header aus vercel.json zusätzlich direkt in die Build-Ausgabe schreiben
// (.vercel/output/config.json), damit sie unabhängig davon gelten, wie Vercel vercel.json mit der
// Build Output API zusammenführt. Außerdem: Server-Funktion fest in Frankfurt (fra1).
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Pfadmuster aus vercel.json ("/(.*)") → Regex der Build Output API. */
function toSrc(source) {
  return "^" + source.replace(/\/\(\.\*\)/g, "(?:/(.*))?") + "$";
}

export function securityHeaders() {
  return {
    name: "fermata-security-headers",
    hooks: {
      "astro:build:done": ({ logger }) => {
        const root = fileURLToPath(new URL("..", import.meta.url));
        const vercelJson = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
        const outDir = join(root, ".vercel", "output");
        const configFile = join(outDir, "config.json");
        if (!existsSync(configFile)) return;
        const config = JSON.parse(readFileSync(configFile, "utf8"));
        const headerRoutes = (vercelJson.headers ?? []).map((h) => ({
          src: toSrc(h.source),
          headers: Object.fromEntries(h.headers.map((x) => [x.key, x.value])),
          continue: true,
        }));
        config.routes = [...headerRoutes, ...(config.routes ?? [])];
        writeFileSync(configFile, JSON.stringify(config, null, 2));

        // Region der Funktion(en) festlegen.
        const regions = vercelJson.regions ?? ["fra1"];
        const walk = (dir) => {
          for (const name of readdirSync(dir)) {
            const full = join(dir, name);
            if (statSync(full).isDirectory()) {
              if (name.endsWith(".func")) {
                const vc = join(full, ".vc-config.json");
                if (existsSync(vc)) {
                  const cfg = JSON.parse(readFileSync(vc, "utf8"));
                  cfg.regions = regions;
                  writeFileSync(vc, JSON.stringify(cfg, null, 2));
                }
              } else walk(full);
            }
          }
        };
        if (existsSync(join(outDir, "functions"))) walk(join(outDir, "functions"));
        logger.info(`${headerRoutes.length} Header-Regeln und Region ${regions.join(", ")} in die Build-Ausgabe geschrieben.`);
      },
    },
  };
}
