import type { AddressForm } from "@/copy/form";
import { getOverview, getSession } from "@/lib/data";

/** Anrede der angemeldeten Person, sonst „Sie“. */
export async function currentForm(): Promise<AddressForm> {
  const { claims } = await getSession();
  if (!claims?.sub) return "sie";
  try {
    return (await getOverview()).onboarding.address_form ?? "sie";
  } catch {
    return "sie";
  }
}
