// Lokaler Server für alle Edge Functions unter /functions/v1/<name> (wie bei Supabase).
// Konvention: jede Function hat <name>/handler.ts (export default (req) => Promise<Response>)
// und <name>/index.ts (Deno.serve(handler)). Aufruf:
//   SUPABASE_DB_URL=postgres://postgres:postgres@localhost:54322/postgres FERMATA_ENV=local \
//   deno run --allow-net --allow-env --allow-read supabase/functions/dev-server.ts
const port = Number(Deno.env.get("FUNCTIONS_PORT") ?? "54321");
const base = new URL(".", import.meta.url);
type Handler = (req: Request) => Promise<Response>;
const cache = new Map<string, Handler>();

async function load(name: string): Promise<Handler | undefined> {
  if (!/^[a-z0-9-]+$/.test(name)) return undefined;
  if (cache.has(name)) return cache.get(name);
  try {
    const mod = await import(new URL(`./${name}/handler.ts`, base).href);
    cache.set(name, mod.default as Handler);
    return mod.default as Handler;
  } catch (err) {
    if (err instanceof TypeError && String(err).includes("Module not found")) return undefined;
    throw err;
  }
}

Deno.serve({ port }, async (req) => {
  const url = new URL(req.url);
  const m = /^\/functions\/v1\/([a-z0-9-]+)(\/.*)?$/.exec(url.pathname);
  if (!m) return new Response("not found", { status: 404 });
  const handler = await load(m[1]!);
  if (!handler) return new Response("function not found", { status: 404 });
  return handler(req);
});
console.log(`Edge Functions lokal auf http://localhost:${port}/functions/v1/<name>`);
