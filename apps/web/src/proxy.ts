// Proxy (früher Middleware): vor jeder Seite
// 1. Nonce und strenge Content-Security-Policy (keine 'unsafe-inline' für Skripte),
// 2. Sitzung auffrischen (Supabase-Auth-Cookie),
// 3. Wege schützen: Mitgliederbereich nur angemeldet, /admin nur mit Zwei-Faktor (aal2).
//    Ob jemand Admin ist, prüfen zusätzlich die Admin-Seiten und die Datenbank (app.is_admin()).
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, newNonce } from "@/lib/csp";
import { isAdminPath, isMemberPath, isMfaPath, loginRedirectTarget } from "@/lib/routes";

export async function proxy(request: NextRequest) {
  const nonce = newNonce();
  const csp = buildCsp({
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    dev: process.env.NODE_ENV === "development",
    extraConnect: (process.env.FERMATA_CSP_EXTRA_CONNECT ?? "").split(/\s+/).filter(Boolean),
    extraFrame: (process.env.FERMATA_CSP_EXTRA_FRAME ?? "").split(/\s+/).filter(Boolean),
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const cookieWrites: { name: string; value: string; options: Parameters<typeof response.cookies.set>[2] }[] = [];
  let cacheHeaders: Record<string, string> = {};

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          cookieWrites.push({ name, value, options });
        }
        cacheHeaders = headers ?? {};
        response = NextResponse.next({ request: { headers: requestHeaders } });
      },
    },
  });

  // getClaims() prüft das Token (lokal mit JWKS oder über Supabase Auth) und frischt die Sitzung auf.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string; aal?: string } | undefined;
  const path = request.nextUrl.pathname;

  const finish = (res: NextResponse) => {
    for (const c of cookieWrites) res.cookies.set(c.name, c.value, c.options);
    for (const [k, v] of Object.entries(cacheHeaders)) res.headers.set(k, v);
    res.headers.set("content-security-policy", csp);
    return res;
  };
  const redirect = (to: string) => finish(NextResponse.redirect(new URL(to, request.url), 303));

  if (!claims?.sub && (isMemberPath(path) || isAdminPath(path))) {
    return redirect(loginRedirectTarget(path + request.nextUrl.search));
  }
  if (claims?.sub && isAdminPath(path) && !isMfaPath(path) && claims.aal !== "aal2") {
    return redirect(`/admin/mfa/bestaetigen?weiter=${encodeURIComponent(path)}`);
  }
  if (claims?.sub && (path === "/anmelden" || path === "/anmelden/code")) {
    return redirect("/");
  }
  return finish(response);
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|brand/|sw\\.js|manifest\\.webmanifest|favicon\\.ico|robots\\.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
