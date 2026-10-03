import { Badge } from "@/components/ui";
import { adminCommon } from "@/copy/admin-common";

const tone = (s: string) => (s === "akut" ? "danger" : s === "hoch" ? "wine" : s === "mittel" ? "warning" : undefined);

export function SeverityBadge({ severity }: { severity: string }) {
  return <Badge tone={tone(severity)}>{adminCommon.severity[severity] ?? severity}</Badge>;
}
