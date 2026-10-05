// Rahmen der Web-App. AppShell: Mitglieder (Navigation oben/unten), PublicShell: ohne Anmeldung,
// FocusShell: Onboarding (ohne Ablenkung), AdminShell: Admin-Bereich.
import type { ReactNode } from "react";
import { admin as adminCopy } from "@/copy/admin";
import { nav } from "@/copy/common";
import { Footer } from "./Footer";
import { HelpButton } from "./HelpButton";
import { LogoutButton } from "./LogoutButton";
import { SideNav, TabBar, TopNav, type NavItem } from "./NavLinks";
import { Wordmark } from "./Wordmark";

export const memberNav: NavItem[] = [
  { href: "/start", label: nav.start, icon: "home" },
  { href: "/gespraech", label: nav.gespraech, icon: "voice" },
  { href: "/abende", label: nav.abende, icon: "evening" },
  { href: "/mitgliedschaft", label: nav.mitgliedschaft, icon: "membership" },
  { href: "/konto", label: nav.konto, icon: "account" },
];

export const adminNav: NavItem[] = [
  { href: "/admin", label: adminCopy.nav.overview, icon: "grid" },
  { href: "/admin/auswahl", label: adminCopy.nav.runs, icon: "sparkle" },
  { href: "/admin/sicherheit", label: adminCopy.nav.safety, icon: "shield" },
  { href: "/admin/lokale", label: adminCopy.nav.venues, icon: "pin" },
  { href: "/admin/warteliste", label: adminCopy.nav.waitlist, icon: "clock" },
  { href: "/admin/mitgliedschaft", label: adminCopy.nav.membership, icon: "membership" },
  { href: "/admin/konten", label: adminCopy.nav.accounts, icon: "users" },
  { href: "/admin/einladen", label: adminCopy.nav.invite, icon: "send" },
  { href: "/admin/pruefungen", label: adminCopy.nav.verifications, icon: "id" },
  { href: "/admin/einstellungen", label: adminCopy.nav.settings, icon: "settings" },
];

function SkipLink() {
  return (
    <a className="skip-link" href="#inhalt">
      {nav.skip}
    </a>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell shell--app">
      <SkipLink />
      <header className="shell__header">
        <div className="shell__bar">
          <Wordmark href="/start" />
          <div className="shell__spacer" />
          <TopNav items={memberNav} label={nav.label} />
          <div className="shell__spacer" />
          <LogoutButton />
          <HelpButton />
        </div>
      </header>
      <main id="inhalt" className="shell__main" tabIndex={-1}>
        {children}
      </main>
      <Footer />
      <TabBar items={memberNav} label={nav.label} />
    </div>
  );
}

export function PublicShell({ children, narrow = true, tag }: { children: ReactNode; narrow?: boolean; tag?: string }) {
  return (
    <div className="shell shell--public">
      <SkipLink />
      <header className="shell__header">
        <div className="shell__bar">
          <Wordmark href="/" tag={tag} />
          <div className="shell__spacer" />
          <HelpButton />
        </div>
      </header>
      <main id="inhalt" className={["shell__main", narrow && "shell__main--narrow"].filter(Boolean).join(" ")} tabIndex={-1}>
        {children}
      </main>
      <Footer />
    </div>
  );
}

export function FocusShell({ children, laterHref = "/start", laterLabel }: { children: ReactNode; laterHref?: string; laterLabel: string }) {
  return (
    <div className="shell shell--focus">
      <SkipLink />
      <header className="shell__header">
        <div className="shell__bar">
          <Wordmark href="/start" />
          <div className="shell__spacer" />
          <a className="header-link" href={laterHref}>
            {laterLabel}
          </a>
          <HelpButton />
        </div>
      </header>
      <main id="inhalt" className="shell__main shell__main--narrow" tabIndex={-1}>
        {children}
      </main>
      <Footer />
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell shell--admin">
      <SkipLink />
      <header className="shell__header">
        <div className="shell__bar">
          <Wordmark href="/admin" tag={adminCopy.area} />
          <div className="shell__spacer" />
          <a className="header-link" href="/start">
            {adminCopy.toApp}
          </a>
          <LogoutButton />
        </div>
      </header>
      <main id="inhalt" className="shell__main" tabIndex={-1}>
        <div className="admin-layout">
          <SideNav items={adminNav} label={adminCopy.navLabel} />
          <div className="stack">{children}</div>
        </div>
      </main>
    </div>
  );
}
