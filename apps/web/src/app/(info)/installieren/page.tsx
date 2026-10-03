import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { install } from "@/copy/help";
import { InstalledHint } from "./InstalledHint";

export const metadata: Metadata = { title: install.title };

export default function InstallPage() {
  return (
    <div className="stack stack-lg">
      <PageHeader title={install.title} lead={install.lead} />
      <InstalledHint />
      <div className="grid-auto">
        <Card title={install.iosTitle} id="ios">
          <ol className="stack stack-sm">
            {install.ios.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <div className="notice notice--warning">
            <span className="notice__icon">
              <Icon name="info" />
            </span>
            <p>{install.iosNote}</p>
          </div>
        </Card>
        <Card title={install.androidTitle} id="android">
          <ol className="stack stack-sm">
            {install.android.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </Card>
        <Card title={install.desktopTitle} id="desktop" variant="sunk">
          <p className="soft">{install.desktop}</p>
        </Card>
      </div>
    </div>
  );
}
