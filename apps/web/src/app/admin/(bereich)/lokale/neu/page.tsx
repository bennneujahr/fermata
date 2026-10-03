import type { Metadata } from "next";
import Link from "next/link";
import { VenueForm } from "@/components/admin/VenueForm";
import { Card, Icon, PageHeader } from "@/components/ui";
import { adminVenues as c } from "@/copy/admin-lokale";

export const metadata: Metadata = { title: c.form.newTitle };

export default function NewVenuePage() {
  return (
    <>
      <p>
        <Link href="/admin/lokale" className="cluster">
          <Icon name="arrowLeft" size={18} />
          <span>{c.form.back}</span>
        </Link>
      </p>
      <PageHeader title={c.form.newTitle} />
      <Card>
        <VenueForm />
      </Card>
    </>
  );
}
