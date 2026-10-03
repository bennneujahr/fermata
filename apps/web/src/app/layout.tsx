import "@fermata/tokens/tokens.css";
import "@fermata/brand/fonts/fonts.css";
import "@fermata/brand/atem.css";
import "@/styles/base.css";
import "@/styles/components.css";
import "@/styles/shell.css";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { tokens } from "@fermata/tokens";
import { ServiceWorker } from "@/components/pwa/ServiceWorker";
import { ThemeScript } from "@/components/pwa/ThemeScript";
import { brand } from "@/copy/common";

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: brand.name, statusBarStyle: "default" },
  formatDetection: { telephone: false, email: false, address: false },
  robots: { index: false, follow: false },
  referrer: "same-origin",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: tokens.color.light.paper },
    { media: "(prefers-color-scheme: dark)", color: tokens.color.dark.paper },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <ThemeScript nonce={nonce} />
      </head>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
