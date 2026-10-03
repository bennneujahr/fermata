import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PublicShell } from "@/components/shell/Shells";
import { Card } from "@/components/ui";
import { admin } from "@/copy/admin";
import { mfa } from "@/copy/auth";
import { assurance } from "../assurance";
import { Enrol } from "./Enrol";

export const metadata: Metadata = { title: mfa.enrolTitle };

export default async function MfaEnrolPage() {
  const a = await assurance();
  if (a.current === "aal2") redirect("/admin");
  if (a.next === "aal2") redirect("/admin/mfa/bestaetigen");
  return (
    <PublicShell tag={admin.area}>
      <div className="focus-card stack">
        <h1>{mfa.enrolTitle}</h1>
        <p className="lead">{mfa.enrolLead}</p>
        <Card>
          <Enrol />
        </Card>
      </div>
    </PublicShell>
  );
}
