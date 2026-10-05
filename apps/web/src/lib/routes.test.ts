import { describe, expect, it } from "vitest";
import { isAdminPath, isMemberPath, isMfaPath, loginRedirectTarget, onboardingPath, safeNext } from "./routes";

describe("Wege", () => {
  it("schützt Mitglieder- und Admin-Bereich", () => {
    expect(isMemberPath("/start")).toBe(true);
    expect(isMemberPath("/konto/loeschen")).toBe(true);
    expect(isMemberPath("/kontoxyz")).toBe(false);
    expect(isMemberPath("/hilfe")).toBe(false);
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/konten/1")).toBe(true);
    expect(isAdminPath("/administration")).toBe(false);
    expect(isMfaPath("/admin/mfa/einrichten")).toBe(true);
  });
  it("kein offener Redirect nach der Anmeldung", () => {
    expect(safeNext("/konto")).toBe("/konto");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext("/anmelden/code")).toBe("/");
    expect(safeNext(null, "/start")).toBe("/start");
    expect(loginRedirectTarget("/konto?x=1")).toBe("/anmelden?weiter=%2Fkonto%3Fx%3D1");
  });
  it("Onboarding-Schritte", () => {
    expect(onboardingPath("angaben")).toBe("/onboarding/angaben");
    expect(onboardingPath("fertig")).toBe("/start");
  });
});
