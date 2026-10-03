// Ruhige Linien-Symbole (eigene Zeichnung, 24er-Raster, Strich 1.6). Dekorativ, außer label ist gesetzt.
import type { SVGProps } from "react";

const paths = {
  home: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z",
  voice: "M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3zM6 11.5a6 6 0 0 0 12 0M12 17.5V21M9 21h6",
  evening: "M6 3h12l-1.2 7.2A4.8 4.8 0 0 1 12.1 14h-.2a4.8 4.8 0 0 1-4.7-3.8zM12 14v6.5M8.5 21h7M6.6 7h10.8",
  membership: "M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5zM4 10h16M7.5 14.5h3",
  account: "M12 12.2a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c.9-3.6 3.9-5.8 7.5-5.8s6.6 2.2 7.5 5.8",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.6 9.3a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.8-.9 1.4v.6M12 16.6v.4",
  shield: "M12 3.5 5 6v5.5c0 4.3 2.9 7.9 7 9 4.1-1.1 7-4.7 7-9V6z M9 12l2 2 4-4.5",
  phone: "M6.6 3.8 9 3.5l1.6 4-2 1.3a10.5 10.5 0 0 0 6.6 6.6l1.3-2 4 1.6-.3 2.4a2 2 0 0 1-2.1 1.7A16 16 0 0 1 4.9 5.9 2 2 0 0 1 6.6 3.8z",
  check: "M5 12.5 10 17.5 19 7",
  checkCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.3l2.7 2.7L16 9.6",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.6v.4",
  warning: "M12 4 2.8 19.5h18.4zM12 10v4.5M12 17v.4",
  alert: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5v6M12 16.3v.4",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  arrowLeft: "M19 12H5M11 6l-6 6 6 6",
  download: "M12 4v11M7 10.5l5 5 5-5M5 20h14",
  trash: "M5 7h14M10 7V4.8h4V7M7 7l.8 12.2a1.2 1.2 0 0 0 1.2 1.1h6a1.2 1.2 0 0 0 1.2-1.1L17 7",
  logout: "M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 16l-4-4 4-4M6 12h10",
  mail: "M3.5 6.5h17v11h-17zM4 7l8 6 8-6",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  id: "M3.5 6h17v12h-17zM7 10.5a1.8 1.8 0 1 0 3.6 0 1.8 1.8 0 0 0-3.6 0M5.8 15.5c.4-1.4 1.5-2.2 3-2.2s2.6.8 3 2.2M14 10h4M14 13.5h3",
  share: "M12 3.5v11M8 7.5l4-4 4 4M6 11v8.5h12V11",
  plus: "M12 5v14M5 12h14",
  search: "M10.8 17.5a6.7 6.7 0 1 0 0-13.4 6.7 6.7 0 0 0 0 13.4zM15.8 15.8 20 20",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5l1.4.9-1.6 2.8-1.6-.6a7 7 0 0 1-1.7 1l-.3 1.7h-3.2l-.3-1.7a7 7 0 0 1-1.7-1l-1.6.6-1.6-2.8 1.4-.9a7 7 0 0 1 0-2l-1.4-.9 1.6-2.8 1.6.6a7 7 0 0 1 1.7-1l.3-1.7h3.2l.3 1.7a7 7 0 0 1 1.7 1l1.6-.6 1.6 2.8-1.4.9a7 7 0 0 1 0 2z",
  users: "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.8 19.5c.7-3 3.2-4.8 6.2-4.8s5.5 1.8 6.2 4.8M15.5 4.8a3.4 3.4 0 0 1 0 6.5M18 14.9c1.6.6 2.8 2.1 3.2 4.6",
  flag: "M5.5 21V4M5.5 4.5h11l-2 4 2 4h-11",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  send: "M4 12 20 4l-4 16-4.5-6.5zM11.5 13.5 20 4",
  sparkle: "M12 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5zM18.5 15.5c.3 1.6 1 2.3 2.5 2.5-1.5.2-2.2.9-2.5 2.5-.3-1.6-1-2.3-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5z",
  device: "M7.5 3h9A1.5 1.5 0 0 1 18 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19.5v-15A1.5 1.5 0 0 1 7.5 3zM10.5 18h3",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5.2l3.3 2",
  external: "M14 4h6v6M20 4l-9 9M18 14v5.5a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-13a.5.5 0 0 1 .5-.5H10",
  copy: "M9 9h10.5v11.5H9zM15 9V4.5H4.5V15H9",
  chart: "M4 20.5h16M7 17V11M12 17V6M17 17v-8",
  pin: "M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11zM12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, label, ...rest }: { name: IconName; size?: number; label?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable="false"
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  );
}

/** Die Fermate (graviert) als Zeichen. */
export function Fermate({ className, label }: { className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 120 72" className={className} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
      <path
        fill="currentColor"
        d="M3.2 64.6C3.4 28.6 28 5 60 5s56.6 23.6 56.8 59.6c0 1.3-1.9 1.4-2.1.1C110.6 36.2 88.8 15.4 60 15.4S9.4 36.2 5.3 64.7c-.2 1.3-2.1 1.2-2.1-.1Z"
      />
      <circle fill="currentColor" cx="60" cy="56" r="7.6" />
    </svg>
  );
}
