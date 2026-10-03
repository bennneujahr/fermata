"""Prüft die sicherheitsrelevanten Werte in supabase/config.toml (läuft in `pnpm checks` und in CI)."""
import sys
import tomllib
from pathlib import Path

config = tomllib.loads((Path(__file__).parent.parent / "supabase" / "config.toml").read_text())
problems = []


def expect(path: str, want) -> None:
    node = config
    for key in path.split("."):
        if not isinstance(node, dict) or key not in node:
            problems.append(f"{path} fehlt")
            return
        node = node[key]
    if node != want:
        problems.append(f"{path} = {node!r}, erwartet {want!r}")


expect("api.schemas", ["public", "graphql_public", "app", "billing", "api"])
expect("auth.enable_signup", False)
expect("auth.email.enable_signup", False)
expect("auth.email.otp_length", 6)
expect("auth.mfa.totp.enroll_enabled", True)
expect("auth.mfa.totp.verify_enabled", True)
expect("auth.enable_anonymous_sign_ins", False)

# Functions mit eigener Prüfung (Signatur, Geheimnis, öffentliche Seite) laufen ohne Supabase-JWT.
for name in [
    "waitlist-signup", "waitlist-confirm", "waitlist-status", "waitlist-unsubscribe", "link-hit",
    "verification-webhook", "interview-agent", "notify-dispatch", "venue-confirm", "push-key",
    "stripe-webhook", "billing-cancel", "billing-withdraw", "billing-extend", "trust-view", "safety-dispatch",
]:
    expect(f"functions.{name}.verify_jwt", False)

if problems:
    print("supabase/config.toml:\n  " + "\n  ".join(problems))
    sys.exit(1)
print("supabase/config.toml: sicherheitsrelevante Werte stimmen.")
