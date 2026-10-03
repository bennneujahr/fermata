import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/Shells";
import { ButtonLink, EmptyState, Notice } from "@/components/ui";
import { errors } from "@/copy/common";
import { start } from "@/copy/member";
import { titles as safetyTitles } from "@/copy/sicherheit";
import { getAdminStatus, requireMember } from "@/lib/data";

export default async function MemberLayout({ children }: { children: ReactNode }) {
  const { overview } = await requireMember();
  if (!overview.onboarding.has_account) {
    const admin = await getAdminStatus();
    return (
      <AppShell>
        <EmptyState title={errors.noAccountTitle} action={admin.is_admin_user ? <ButtonLink href="/admin">{start("sie").toAdmin}</ButtonLink> : undefined}>
          <p>{errors.noAccountText}</p>
        </EmptyState>
      </AppShell>
    );
  }
  const suspended = overview.onboarding.status === "suspended" || overview.sanctions_active;
  const sanctionsLink = safetyTitles.sanktionen;
  return (
    <AppShell>
      {suspended ? (
        <div className="stack">
          <Notice tone="warning" title={errors.suspendedTitle}>
            <p>{errors.suspendedText}</p>
            <p>
              <Link href="/sicherheit/sanktionen">{sanctionsLink}</Link>
            </p>
          </Notice>
        </div>
      ) : null}
      {children}
    </AppShell>
  );
}
