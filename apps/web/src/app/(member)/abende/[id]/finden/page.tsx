import type { Metadata } from "next";
import Link from "next/link";
import "@/styles/gespraech-abende.css";
import { FindCard } from "@/components/abende/FindCard";
import { HintForm } from "@/components/abende/HintForm";
import { SafetyCard } from "@/components/abende/SafetyCard";
import { Card, Notice, PageHeader } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { abende } from "@/copy/abende";
import { titles } from "@/copy/titles";
import { formatWhen } from "@/lib/berlin";
import { requireMember } from "@/lib/data";
import { eveningLinks } from "@/lib/evening-links";
import { getDbNow, getEveningDetail, getFindInfo } from "@/lib/evenings";

export const metadata: Metadata = { title: titles.abende };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Finde-Fenster als eigene, ruhige Seite (Link aus der Erinnerung am Abend).
export default async function FindPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ form }, now] = await Promise.all([requireMember(`/abende/${id}/finden`), getDbNow()]);
  const c = abende(form);
  const d = UUID.test(id) ? await getEveningDetail(id) : null;
  const info = d ? await getFindInfo(id) : null;
  const links = eveningLinks(id);
  const opens = d?.find_window?.opens_at;
  return (
    <div className="stack stack-lg">
      <p>
        <Link href={links.detail} className="cluster back-link">
          <Icon name="arrowLeft" size={18} />
          {d ? c.withName(d.counterpart_first_name) : c.back}
        </Link>
      </p>
      <PageHeader title={c.findTitle} lead={c.findLead} />
      {info ? (
        <>
          <FindCard info={info} form={form} full />
          {d?.state === "confirmed" ? (
            <Card title={c.hintTitle} id="erkennungszeichen">
              <p className="soft">{c.hintLead(d.counterpart_first_name)}</p>
              <HintForm eveningId={id} form={form} initial={info.my_hint} />
            </Card>
          ) : null}
          <SafetyCard form={form} links={links} showCheckin showShare={false} />
        </>
      ) : (
        <Notice tone="info">{opens && new Date(opens).getTime() > now.getTime() ? c.findOpens(formatWhen(opens, now)) : c.findClosed}</Notice>
      )}
    </div>
  );
}
