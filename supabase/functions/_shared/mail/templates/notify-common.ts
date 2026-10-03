// Gemeinsame Bausteine der Nachrichten zu Abenden und Zeitenabfrage (M5).
// Ruhiger Ton, keine Ausrufezeichen, kein Druck, keine Versprechen. Sie- oder Du-Form nach app.accounts.address_form.
// Push-Texte: kurz und ohne Namen von Personen (sie laufen über Apple, Google oder Mozilla).
import type { MailMessage } from "../types.ts";
import type { AddressForm, NotificationContext, VenuePublic } from "../../notify/types.ts";
import type { PushMessage } from "../../push/send.ts";

export type Draft = Omit<MailMessage, "to">;

export interface Rendered {
  mail: Draft | null;
  push: PushMessage | null;
}

export interface RenderOptions {
  /** Basisadresse der Web-App ohne Schrägstrich am Ende */
  appUrl: string;
  /** Bestätigungslink für das Lokal (venue-confirm), falls eingerichtet */
  venueConfirmUrl?: string | null;
}

/** Wählt den Text in der gewünschten Anrede. */
export function form(f: AddressForm): (sie: string, du: string) => string {
  return (sie, du) => (f === "du" ? du : sie);
}

export function greeting(f: AddressForm, name: string | null): string {
  if (f === "du") return name ? `Hallo ${name},` : "Hallo,";
  return name ? `Guten Tag, ${name},` : "Guten Tag,";
}

export function memberFooter(f: AddressForm): string[] {
  return [
    form(f)(
      "Fermata · Sie bekommen diese Nachricht, weil Sie bei Fermata Mitglied sind.",
      "Fermata · Du bekommst diese Nachricht, weil du bei Fermata Mitglied bist.",
    ),
  ];
}

export function venueLine(v: VenuePublic | null | undefined): string {
  if (!v) return "im Lokal";
  return `${v.name}, ${v.street}, ${v.postal_code} ${v.city}`;
}

/** Pfade der Web-App (Vertrag mit der Oberfläche, docs/bereiche/abende.md). */
export const paths = {
  evening: (id: string) => `/abende/${id}`,
  find: (id: string) => `/abende/${id}/finden`,
  checkin: (id: string) => `/abende/${id}/check-in`,
  feedback: (id: string) => `/abende/${id}/rueckmeldung`,
  contact: (id: string) => `/abende/${id}/kontakt`,
  debrief: (id: string) => `/abende/${id}/nachbesprechung`,
  availability: (periodId: string) => `/zeiten/${periodId}`,
};

export function pushMessage(ctx: NotificationContext, body: string, url: string, tag: string): PushMessage {
  return { title: "Fermata", body, url, tag, ...(ctx.is_safety ? { safety: true } : {}) };
}
