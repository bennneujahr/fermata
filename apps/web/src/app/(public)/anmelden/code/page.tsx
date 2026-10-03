import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui";
import { Fermate } from "@/components/ui/Icon";
import { code } from "@/copy/auth";
import { CodeForm } from "./CodeForm";

export const metadata: Metadata = { title: code.title };

export default function CodePage() {
  return (
    <div className="focus-card stack">
      <Fermate className="hero-mark" />
      <h1>{code.title}</h1>
      <Card>
        <Suspense>
          <CodeForm />
        </Suspense>
      </Card>
    </div>
  );
}
