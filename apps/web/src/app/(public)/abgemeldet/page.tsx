import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui";
import { Fermate } from "@/components/ui/Icon";
import { logout } from "@/copy/auth";

export const metadata: Metadata = { title: logout.title };

export default async function LoggedOutPage({ searchParams }: { searchParams: Promise<{ grund?: string }> }) {
  const { grund } = await searchParams;
  const deleted = grund === "geloescht";
  return (
    <div className="focus-card stack">
      <Fermate className="hero-mark" />
      <h1>{deleted ? logout.deletedTitle : logout.title}</h1>
      <p className="lead">{deleted ? logout.deletedLead : logout.lead}</p>
      {!deleted ? (
        <div>
          <ButtonLink href="/anmelden" variant="secondary">
            {logout.again}
          </ButtonLink>
        </div>
      ) : null}
    </div>
  );
}
