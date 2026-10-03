// Datenexport als Datei (Art. 15/20 DSGVO). Holt die Daten über die Edge Function account-export.
import { NextResponse } from "next/server";
import { callFunction } from "@/lib/functions";

export const dynamic = "force-dynamic";

export async function GET() {
  const res = await callFunction<unknown>("account-export", { method: "GET" });
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: res.status === 401 ? 401 : 502, headers: { "cache-control": "no-store" } });
  }
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  return new NextResponse(JSON.stringify(res.data, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="fermata-datenexport-${date}.json"`,
      "cache-control": "no-store",
    },
  });
}
