import type { MetadataRoute } from "next";
import { tokens } from "@fermata/tokens";
import { brand } from "@/copy/common";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/start",
    name: brand.name,
    short_name: brand.name,
    description: brand.description,
    lang: "de",
    dir: "ltr",
    start_url: "/start",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: tokens.color.light.paper,
    theme_color: tokens.color.light.paper,
    categories: ["lifestyle", "social"],
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
