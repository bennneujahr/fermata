// Datenformen zwischen Datenbank (ops.notify_claim / ops.notification_context) und Versand.
import type { PushTarget } from "../push/send.ts";

export type AddressForm = "sie" | "du";

export interface Recipient {
  kind: "member" | "venue" | "admin";
  email: string;
  /** Mitglied: Vorname (Anzeigename); Lokal: Ansprechperson; Admin: null */
  name: string | null;
  address_form: AddressForm;
}

export interface VenuePublic {
  name: string;
  street: string;
  postal_code: string;
  city: string;
  public_transport: string | null;
  accessibility: string | null;
  description: string | null;
}

export interface EveningContext {
  id: string;
  state: string;
  starts_at: string | null;
  ends_at: string | null;
  venue: VenuePublic | null;
  reasons_text: string | null;
  /** Uhrzeiten, auf die die empfangende Person antworten soll */
  offered_times: string[];
  deadline_at: string | null;
  reservation_name: string;
  table_code: string | null;
  late_cancel_from: string | null;
  late_cancel_hours: number;
  find_before_minutes: number;
  feedback_until: string | null;
}

export interface ReservationContext {
  id: string;
  starts_at: string;
  table_code: string;
  persons: number;
  reservation_name: string;
  status: string;
  venue_confirmed_at: string | null;
  notes: string | null;
  token_expires_at: string;
  venue: {
    name: string;
    street: string;
    postal_code: string;
    city: string;
    contact_name: string | null;
    contact_phone: string | null;
    reservation_mode: string;
  };
}

export interface PeriodContext {
  id: string;
  starts_on: string;
  ends_on: string;
  answer_until: string;
}

export interface SafetyContext {
  emergency_number: string;
  heimwegtelefon_number: string;
  heimwegtelefon_hours: string;
}

export interface NotificationContext {
  id: number;
  template: string;
  payload: Record<string, unknown>;
  is_safety: boolean;
  has_deadline: boolean;
  recipient: Recipient;
  evening?: EveningContext;
  reservation?: ReservationContext;
  period?: PeriodContext;
  safety?: SafetyContext;
  skip?: string;
  defer?: boolean;
}

export interface ClaimedNotification {
  id: number;
  template: string;
  do_email: boolean;
  do_push: boolean;
  is_safety: boolean;
  user_id: string | null;
  context: NotificationContext;
  push_targets: PushTarget[];
}

/** Ergebnis je Kanal für ops.notify_complete */
export type ChannelResult = "sent" | "failed" | "skipped" | "gone";
