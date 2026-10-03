// Fehler aus SQL-Funktionen (raise … using errcode, hint) in HTTP-Antworten übersetzen.
// Die Funktionen setzen einen maschinenlesbaren hint (z. B. consent_missing); den reichen wir weiter.
import { HttpError } from "./http.ts";

interface PgLike {
  code?: string;
  hint?: string;
}

const STATUS_BY_CODE: Record<string, number> = {
  "28000": 401, // nicht angemeldet
  "42501": 403, // keine Berechtigung / Einwilligung fehlt
  "22023": 422, // ungültige Angabe
  "23505": 409, // schon vorhanden
  P0002: 404, // nicht gefunden
};

export function isPgError(err: unknown): err is PgLike & Error {
  return typeof err === "object" && err !== null && "code" in err && typeof (err as PgLike).code === "string";
}

/** Wirft HttpError für bekannte SQL-Fehler, sonst den ursprünglichen Fehler. */
export function rethrowDbError(err: unknown, overrides: Record<string, number> = {}): never {
  if (isPgError(err)) {
    const code = err.code!;
    const hint = err.hint || undefined;
    const status = (hint && overrides[hint]) ?? STATUS_BY_CODE[code];
    if (status) throw new HttpError(status, hint ?? `db_${code}`);
  }
  throw err;
}
