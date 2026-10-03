"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Abmelden: Sitzung in Supabase Auth beenden und Cookie entfernen. */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/abgemeldet");
}
