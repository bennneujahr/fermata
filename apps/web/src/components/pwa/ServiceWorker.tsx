"use client";
import { useEffect } from "react";

/** Meldet den Service Worker an (Offline-Seite, Empfang von Web-Push). In der Entwicklung nur mit NEXT_PUBLIC_SW_DEV=1. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_SW_DEV !== "1") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* ohne Service Worker funktioniert alles außer Offline-Seite und Push */
    });
  }, []);
  return null;
}
