// GET|POST /functions/v1/account-export – Datenexport (Art. 15 und 20 DSGVO) als JSON-Datei.
// Läuft als die angemeldete Person (asUser) und nutzt api.my_export(): nur eigene Daten, nie Daten über andere.
import { asUser, requireUser } from "../_shared/auth.ts";
import { db } from "../_shared/db.ts";
import { rethrowDbError } from "../_shared/dberror.ts";
import { handler, json } from "../_shared/http.ts";

export function exportFileName(now = new Date()): string {
  const d = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(now);
  return `fermata-datenexport-${d}.json`;
}

export default handler(["GET", "POST"], async (req) => {
  const user = await requireUser(req);
  let data: unknown;
  try {
    data = await asUser(db(), user, async (tx) => {
      const [row] = await tx`select api.my_export() as j`;
      return row!.j;
    });
  } catch (err) {
    rethrowDbError(err);
  }
  return json(req, data, 200, {
    "content-disposition": `attachment; filename="${exportFileName()}"`,
  });
});
