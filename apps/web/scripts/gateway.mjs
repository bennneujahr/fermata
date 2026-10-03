// Kleiner lokaler Ersatz für das Supabase-API-Gateway (nur Entwicklung und Tests):
//   /auth/v1/*      → GoTrue       (AUTH_PORT)
//   /rest/v1/*      → PostgREST    (REST_PORT)
//   /functions/v1/* → Edge Functions dev-server (FUNCTIONS_PORT)
//   /templates/*    → supabase/templates (Mail-Vorlagen für GoTrue)
// CORS nur für FERMATA_ALLOWED_ORIGINS.
import { createReadStream, existsSync } from "node:fs";
import http from "node:http";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.GATEWAY_PORT ?? 54345);
const routes = [
  { prefix: "/auth/v1", port: Number(process.env.AUTH_PORT ?? 54343), strip: true },
  { prefix: "/rest/v1", port: Number(process.env.REST_PORT ?? 54344), strip: true },
  { prefix: "/functions/v1", port: Number(process.env.FUNCTIONS_PORT ?? 54341), strip: false },
];
const origins = (process.env.FERMATA_ALLOWED_ORIGINS ?? "http://localhost:3041").split(",");
const templates = fileURLToPath(new URL("../../../supabase/templates/", import.meta.url));

function cors(req, headers) {
  const origin = req.headers.origin;
  for (const k of Object.keys(headers)) if (k.toLowerCase().startsWith("access-control-")) delete headers[k];
  if (origin && origins.includes(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-credentials"] = "true";
    headers["access-control-expose-headers"] = "content-range, x-supabase-api-version, content-disposition";
    headers["vary"] = "Origin";
  }
  return headers;
}

http
  .createServer((req, res) => {
    const url = req.url ?? "/";
    if (req.method === "OPTIONS") {
      res.writeHead(
        204,
        cors(req, {
          "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "access-control-allow-headers": req.headers["access-control-request-headers"] ?? "*",
          "access-control-max-age": "600",
        }),
      );
      res.end();
      return;
    }
    if (url.startsWith("/templates/")) {
      const file = normalize(join(templates, url.slice("/templates/".length).split("?")[0]));
      if (!file.startsWith(templates) || !existsSync(file)) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      createReadStream(file).pipe(res);
      return;
    }
    const route = routes.find((r) => url === r.prefix || url.startsWith(`${r.prefix}/`) || url.startsWith(`${r.prefix}?`));
    if (!route) {
      res.writeHead(404).end("not found");
      return;
    }
    const path = route.strip ? url.slice(route.prefix.length) || "/" : url;
    const upstream = http.request(
      { host: "127.0.0.1", port: route.port, method: req.method, path, headers: { ...req.headers, host: `127.0.0.1:${route.port}` } },
      (up) => {
        res.writeHead(up.statusCode ?? 502, cors(req, { ...up.headers }));
        up.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502, cors(req, { "content-type": "application/json" }));
      res.end(JSON.stringify({ error: "upstream_unavailable" }));
    });
    req.pipe(upstream);
  })
  .listen(port, "127.0.0.1", () => console.log(`Gateway auf http://localhost:${port}`));
