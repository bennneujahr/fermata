import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui";
import { Fermate } from "@/components/ui/Icon";
import { login } from "@/copy/auth";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: login.title };

export default function LoginPage() {
  return (
    <div className="focus-card stack">
      <Fermate className="hero-mark" />
      <div className="stack stack-sm">
        <h1>{login.title}</h1>
        <p className="lead">{login.lead}</p>
      </div>
      <Card>
        <Suspense>
          <LoginForm />
        </Suspense>
      </Card>
      <p className="muted text-sm">{login.inviteOnly}</p>
    </div>
  );
}
