import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { rpc } from "@/app/admin/_lib/rpc";
import { CopyButton } from "@/components/admin/CopyButton";
import { Icon, Notice, PageHeader } from "@/components/ui";
import { adminSafety as c } from "@/copy/admin-sicherheit";

export const metadata: Metadata = { title: c.police.title };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PoliceTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const res = await rpc<string>("admin_police_report_template", { p_report_id: id });
  if (res.error?.hint === "report_not_found") notFound();
  if (res.error) throw new Error(res.error.message);
  return (
    <>
      <p>
        <Link href={`/admin/sicherheit/meldungen/${id}`} className="cluster">
          <Icon name="arrowLeft" size={18} />
          <span>{c.police.back}</span>
        </Link>
      </p>
      <PageHeader title={c.police.title} />
      <Notice tone="warning" title={c.police.decide}>
        {c.police.draft}
      </Notice>
      <CopyButton targetId="polizeivorlage" label={c.police.copy} />
      <div className="table-wrap scroll-box" role="region" aria-label={c.police.textLabel} tabIndex={0}>
        <pre className="template" id="polizeivorlage">
          {res.data}
        </pre>
      </div>
      <p className="muted text-sm">{c.police.logged}</p>
    </>
  );
}
