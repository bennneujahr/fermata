// Mitglied mit fertigem Onboarding direkt in der Datenbank anlegen und per Anmeldelink anmelden.
import { expect, type Page } from "@playwright/test";
import { createAdmin, createInvitedMember, magicLinkPath, sql, uniqueEmail } from "./backend";

export async function onboardedMember(opts: { verified?: boolean; first?: string } = {}): Promise<{ id: string; email: string }> {
  const adminId = await createAdmin(uniqueEmail("admin"));
  const email = uniqueEmail(opts.first?.toLowerCase() ?? "mitglied");
  const id = await createInvitedMember(email, adminId);
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: id, role: "authenticated" })}, true)`;
    await tx`set local role authenticated`;
    for (const k of ["agb", "datenschutz_kenntnis", "art9_profile", "art9_religion", "biometrie"]) {
      await tx`select api.give_consent(${k}, (select d.version from api.legal_document(${k}) d))`;
    }
    await tx`select api.save_facts(${opts.first ?? "Mira"}, 'Mertens', '1988-03-04', '23966', null, '+49 170 1234567')`;
    await tx`select api.save_identity('frau', array['mann', 'frau'], null)`;
    await tx`select api.save_religion('evangelisch', 'etwas', false)`;
  });
  if (opts.verified !== false) {
    await sql`select ops.verification_begin(${id}::uuid)`;
    const [v] = await sql`select id from app.verifications where user_id = ${id}::uuid and status = 'started'`;
    await sql`select ops.verification_attach_session(${v!.id}::uuid, ${`fake_e2e_${id}`})`;
    await sql`select ops.verification_complete(${`fake_e2e_${id}`}, 'approved', ${opts.first ?? "Mira"}, 'Mertens', '1988-03-04', 'E2E1234')`;
    await sql`select ops.verification_session_deleted(${`fake_e2e_${id}`})`;
  }
  return { id, email };
}

export async function loginByLink(page: Page, email: string, expectUrl: RegExp = /\/start$/): Promise<void> {
  await page.goto(await magicLinkPath(email));
  await page.getByRole("button", { name: "Jetzt anmelden" }).click();
  await expect(page).toHaveURL(expectUrl);
}
