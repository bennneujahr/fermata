// Neues VAPID-Schlüsselpaar erzeugen (einmal je Umgebung, Ergebnis als Secrets hinterlegen):
//   deno run supabase/functions/_shared/push/generate-vapid-keys.ts
// Der private Schlüssel gehört nur in die Secrets der Edge Functions, nie ins Repository.
import { generateVapidKeys } from "./vapid.ts";

if (import.meta.main) {
  const keys = await generateVapidKeys();
  console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
  console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
  console.log("VAPID_SUBJECT=mailto:hallo@fermata.example");
}
