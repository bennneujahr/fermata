import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui";
import { Fermate } from "@/components/ui/Icon";
import { confirm } from "@/copy/auth";
import { ConfirmLink } from "./ConfirmLink";

export const metadata: Metadata = { title: confirm.title };

export default function ConfirmPage() {
  return (
    <div className="focus-card stack">
      <Fermate className="hero-mark" />
      <h1>{confirm.title}</h1>
      <Card>
        <Suspense>
          <ConfirmLink />
        </Suspense>
      </Card>
    </div>
  );
}
