import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { hashPasswordResetToken } from "../lib/self-service-password-reset";

test("jednorázový odkaz obnoví heslo a zneplatní staré relace", async ({ page, request }) => {
  const prisma = new PrismaClient();
  const email = `reset-${randomBytes(6).toString("hex")}@flatcloud.test`;
  const oldPassword = "Old-Test-Password-2026";
  const newPassword = "New-Test-Password-2026";
  const token = randomBytes(32).toString("base64url");
  const user = await prisma.user.create({ data: { email, name: "Reset E2E", passwordHash: await bcrypt.hash(oldPassword,12), active: true, isTestIdentity: true } });
  try {
    const unknown = await request.post("/api/auth/password-reset/request", { form: { email: "unknown-reset@flatcloud.test" } });
    const testIdentity = await request.post("/api/auth/password-reset/request", { form: { email } });
    expect(unknown.url()).toContain("/zapomenute-heslo?sent=1");
    expect(testIdentity.url()).toContain("/zapomenute-heslo?sent=1");
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(0);
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashPasswordResetToken(token), expiresAt: new Date(Date.now()+30*60_000) } });
    await page.goto(`/obnovit-heslo/${token}`);
    await expect(page.getByRole("heading", { name: "Nové heslo" })).toBeVisible();
    await page.getByLabel("Nové heslo").fill(newPassword);
    await page.getByLabel("Potvrdit heslo").fill(newPassword);
    await page.getByRole("button", { name: "Uložit nové heslo" }).click();
    await expect(page).toHaveURL(/\/login\?reset=1/);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.sessionVersion).toBe(1);
    expect(await bcrypt.compare(oldPassword,updated.passwordHash)).toBe(false);
    expect(await bcrypt.compare(newPassword,updated.passwordHash)).toBe(true);
    await page.goto(`/obnovit-heslo/${token}`);
    await expect(page.getByRole("heading", { name: "Odkaz už není platný" })).toBeVisible();
    const replay = await request.post("/api/auth/password-reset/confirm", { form: { token, password: "Yet-Another-Password-2026", confirmation: "Yet-Another-Password-2026" } });
    expect(replay.url()).toContain("/zapomenute-heslo?sent=1");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion).toBe(1);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
