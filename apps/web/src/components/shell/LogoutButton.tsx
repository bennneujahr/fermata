import { signOutAction } from "@/app/actions/auth";
import { nav } from "@/copy/common";

/** Abmelden als Formular (funktioniert ohne JavaScript). */
export function LogoutButton({ className = "header-link", label = nav.logout }: { className?: string; label?: string }) {
  return (
    <form action={signOutAction}>
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
