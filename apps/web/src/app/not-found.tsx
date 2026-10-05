import { PublicShell } from "@/components/shell/Shells";
import { ButtonLink, EmptyState } from "@/components/ui";
import { actions, errors } from "@/copy/common";

export default function NotFound() {
  return (
    <PublicShell>
      <EmptyState title={errors.notFoundTitle} headingLevel={2} action={<ButtonLink href="/">{actions.toStart}</ButtonLink>}>
        <h1 className="visually-hidden">{errors.notFoundTitle}</h1>
        <p>{errors.notFoundText}</p>
      </EmptyState>
    </PublicShell>
  );
}
