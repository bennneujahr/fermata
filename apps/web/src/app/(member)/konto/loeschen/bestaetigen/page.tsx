import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { deletion } from "@/copy/member";
import { requireMember } from "@/lib/data";
import { DeleteForm } from "./DeleteForm";
import { titles } from "@/copy/titles";

export const metadata: Metadata = { title: titles.loeschen };

// Löschung, Schritt 2: ausdrücklich bestätigen.
export default async function DeleteConfirmPage() {
  const { form } = await requireMember("/konto/loeschen/bestaetigen");
  const c = deletion(form);
  return (
    <div className="stack stack-lg">
      <PageHeader eyebrow={c.step2} title={c.confirmTitle} lead={c.lead} />
      <Card variant="accent">
        <DeleteForm form={form} />
      </Card>
    </div>
  );
}
