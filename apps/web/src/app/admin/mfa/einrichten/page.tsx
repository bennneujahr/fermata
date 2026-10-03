import type { Metadata } from "next";
import { PublicShell } from "@/components/shell/Shells";
import { Card } from "@/components/ui";
import { admin } from "@/copy/admin";
import { mfa } from "@/copy/auth";
import { Enrol } from "./Enrol";

export const metadata: Metadata = { title: mfa.enrolTitle };

export default function MfaEnrolPage() {
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
