// Fermata Landingpage (PLAN 2.5): statisch, genau eine Server-Funktion (/s/[slug], Plakat-Zähler).
// Strenge CSP ohne 'unsafe-inline': alle Skripte und Styles als eigene Dateien.
import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import node from "@astrojs/node";
import { securityHeaders } from "./scripts/security-headers.mjs";

// Tests und Lighthouse brauchen `astro preview`; das Vercel-Paket kann das nicht.
// FERMATA_ADAPTER=node baut deshalb dieselben Seiten mit @astrojs/node.
const useNode = process.env.FERMATA_ADAPTER === "node";

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || "https://fermata.example",
  output: "static",
  trailingSlash: "never",
  adapter: useNode ? node({ mode: "standalone" }) : vercel({ maxDuration: 5 }),
  integrations: useNode ? [] : [securityHeaders()],
  build: {
    inlineStylesheets: "never",
    format: "file",
  },
  compressHTML: true,
  devToolbar: { enabled: false },
  server: { port: 4331, host: "localhost" },
  vite: {
    build: {
      assetsInlineLimit: 0,
      cssCodeSplit: true,
    },
  },
});
