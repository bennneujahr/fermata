/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Basisadresse der Edge Functions, z. B. https://<projekt>.supabase.co/functions/v1 */
  readonly PUBLIC_FUNCTIONS_URL?: string;
  /** Öffentliche Adresse der Landingpage (Frage A3) */
  readonly PUBLIC_SITE_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
