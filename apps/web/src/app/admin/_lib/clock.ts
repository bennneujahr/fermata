// Aktuelle Zeit für Server Components (Fristen, Zeitfenster). Eigene Funktion, damit die Seiten rein bleiben.
export function nowMs(): number {
  return Date.now();
}

export function inDays(days: number): Date {
  return new Date(nowMs() + days * 24 * 3600 * 1000);
}
