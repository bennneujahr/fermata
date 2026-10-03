import { redirect } from "next/navigation";
import { requireMember } from "@/lib/data";
import { onboardingPath } from "@/lib/routes";

export default async function OnboardingIndex() {
  const { overview } = await requireMember("/onboarding");
  const next = overview.onboarding.next_step;
  redirect(next && next !== "fertig" ? onboardingPath(next) : "/start");
}
