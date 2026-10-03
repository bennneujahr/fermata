// Anrede: Fermata spricht Menschen mit „Sie“ an; wer möchte, wechselt zu „Du“ (app.accounts.address_form).
export type AddressForm = "sie" | "du";

/** Wählt den Text passend zur Anrede. */
export function af(form: AddressForm | null | undefined, sie: string, du: string): string {
  return form === "du" ? du : sie;
}
