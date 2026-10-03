import Link from "next/link";
import { nav } from "@/copy/common";
import { Icon } from "@/components/ui/Icon";

/** Persönlicher Hilfe-Knopf: auf jeder Seite sichtbar, führt zu Notruf, Heimwegtelefon und Meldung. */
export function HelpButton() {
  return (
    <Link href="/hilfe" className="help-button" aria-label={nav.hilfeLang}>
      <Icon name="shield" size={18} />
      <span>{nav.hilfe}</span>
    </Link>
  );
}
