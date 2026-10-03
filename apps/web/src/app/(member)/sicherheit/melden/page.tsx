// Etwas melden (api.report). Auch als Ziel für Links aus Abenden: /sicherheit/melden?abend=<id>.
import type { Metadata } from "next";
import Link from "next/link";
import { ReportForm, type ReportEveningOption } from "@/components/sicherheit/ReportForm";
import { Card, PageHeader } from "@/components/ui";
import { report as reportCopy, titles } from "@/copy/sicherheit";
import { requireMember } from "@/lib/data";
import { eveningLabel } from "@/lib/datetime";
import { getEvening, getHelpContacts, getMyEvenings } from "@/lib/safety";
import { reportableEvenings } from "@/lib/safety-rules";

export const metadata: Metadata = { title: titles.melden };

export default async function ReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const abend = typeof sp.abend === "string" ? sp.abend : null;
  const { form } = await requireMember(abend ? `/sicherheit/melden?abend=${encodeURIComponent(abend)}` : "/sicherheit/melden");
  const c = reportCopy(form);
  const [contacts, fixed, evenings] = await Promise.all([getHelpContacts(), abend ? getEvening(abend) : Promise.resolve(null), getMyEvenings()]);
  const evening: ReportEveningOption | null = fixed
    ? { id: fixed.evening_id, label: eveningLabel(fixed.starts_at, fixed.venue?.name), counterpartName: fixed.counterpart_first_name }
    : null;
  const options: ReportEveningOption[] = reportableEvenings(evenings ?? []).map((e) => ({
    id: e.evening_id,
    label: c.eveningOption(e.counterpart_first_name, eveningLabel(e.starts_at, e.venue?.name) || "–"),
    counterpartName: e.counterpart_first_name,
  }));
  return (
    <div className="stack stack-lg">
      <p>
        <Link href="/sicherheit">{titles.back}</Link>
      </p>
      <PageHeader title={c.title} lead={c.lead} />
      <Card>
        <ReportForm form={form} evening={evening} evenings={evening ? [] : options} police={contacts.police} />
      </Card>
    </div>
  );
}
