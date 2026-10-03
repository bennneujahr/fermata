"use client";
import { useEffect, useState } from "react";
import { Notice } from "@/components/ui";
import { install } from "@/copy/help";

export function InstalledHint() {
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- erst im Browser bekannt
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true);
  }, []);
  return standalone ? <Notice tone="success">{install.installed}</Notice> : null;
}
