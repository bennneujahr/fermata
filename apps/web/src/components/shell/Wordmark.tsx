import Link from "next/link";
import { brand, nav } from "@/copy/common";
import { Fermate } from "@/components/ui/Icon";

export function Wordmark({ href = "/", tag }: { href?: string; tag?: string }) {
  return (
    <Link href={href} className="wordmark" aria-label={tag ? `${brand.name} ${tag}` : nav.home}>
      <Fermate className="wordmark__mark" />
      <span aria-hidden="true">{brand.name}</span>
      {tag ? (
        <span className="wordmark__tag" aria-hidden="true">
          {tag}
        </span>
      ) : null}
    </Link>
  );
}
