import type { ReactNode } from "react";
import { FocusShell } from "@/components/shell/Shells";
import { EmptyState } from "@/components/ui";
import { actions, errors } from "@/copy/common";
import { requireMember } from "@/lib/data";

export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  const { overview } = await requireMember("/onboarding");
  return (
    <FocusShell laterLabel={actions.later}>
      {overview.onboarding.has_account ? (
        children
      ) : (
        <EmptyState title={errors.noAccountTitle}>
          <p>{errors.noAccountText}</p>
        </EmptyState>
      )}
    </FocusShell>
  );
}
