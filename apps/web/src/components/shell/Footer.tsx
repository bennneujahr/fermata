import Link from "next/link";
import { footer } from "@/copy/common";
import { footerLinks } from "@/copy/rechtliches";

export function Footer() {
  return (
    <footer className="shell__footer">
      <div className="shell__footer-inner">
        <Link href="/rechtliches/impressum">{footer.imprint}</Link>
        <Link href="/rechtliches/datenschutz">{footer.privacy}</Link>
        <Link href="/rechtliches/agb">{footer.terms}</Link>
        <Link href="/rechtliches/ki_hinweis">{footer.ai}</Link>
        <Link href="/rechtliches/widerruf">{footerLinks.withdrawalPolicy}</Link>
        {/* § 312k BGB: Kündigungsknopf ständig verfügbar, auch ohne Anmeldung; § 356a BGB: Widerruf */}
        <Link href="/kuendigen">{footerLinks.cancel}</Link>
        <Link href="/widerrufen">{footerLinks.withdraw}</Link>
        <Link href="/installieren">{footer.install}</Link>
        <p className="shell__footer-note">{footer.note}</p>
      </div>
    </footer>
  );
}
