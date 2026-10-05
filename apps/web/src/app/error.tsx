"use client";
import { Button, EmptyState } from "@/components/ui";
import { actions, errors } from "@/copy/common";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="inhalt" className="shell__main shell__main--narrow">
      <EmptyState title={errors.errorTitle} action={<Button onClick={reset}>{actions.retry}</Button>}>
        <p>{errors.errorText}</p>
      </EmptyState>
    </main>
  );
}
