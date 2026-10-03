import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PublicShell } from "@/components/shell/Shells";
import { Card } from "@/components/ui";
import { admin } from "@/copy/admin";
import { mfa } from "@/copy/auth";
import { assurance } from "../assurance";
import { Challenge } from "./Challenge";

export const metadata: Metadata = { title: mfa.challengeTitle };

export default async function MfaChallengePage() {
  const a = await assurance();
  if (a.current === "aal2") redirect("/admin");
  if (a.next !== "aal2") redirect("/admin/mfa/einrichten");
  return (
    <PublicShell tag={admin.area}>
      <div className="focus-card stack">
        <h1>{mfa.challengeTitle}</h1>
        <p className="lead">{mfa.challengeLead}</p>
        <Card>
          <Suspense>
            <Challenge />
          </Suspense>
        </Card>
      </div>
    </PublicShell>
  );
}
