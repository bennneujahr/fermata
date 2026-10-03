"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Fragt bis zu 90 Sekunden lang alle 3 Sekunden nach dem Ergebnis (Seite neu vom Server). */
export function Poll({ waiting, stillWaiting }: { waiting: string; stillWaiting: string }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (tries >= 30) return;
    const t = setTimeout(() => {
      setTries((n) => n + 1);
      router.refresh();
    }, 3000);
    return () => clearTimeout(t);
  }, [tries, router]);
  return (
    <p role="status" aria-live="polite" className="soft">
      {tries >= 30 ? stillWaiting : waiting}
    </p>
  );
}
