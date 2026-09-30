import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { verificationCodeForAccount } from "../lib/bank-email-verification";

const notification = (recipient: string, vs: string) => `Zvýšení zůstatku na účtu Testovací dům
Dobrý den,
zůstatek na účtu Testovací dům číslo ${recipient} se zvýšil o částku 1,00 CZK. Dostupný zůstatek je 9 999,00 CZK.
Příchozí úhrada z účtu TEST PLATCE číslo 19-2000145399/0800
Částka: 1,00 CZK
Datum zaúčtování: 30.09.2026
Variabilní symbol: ${vs}
Vaše Air Bank`;

test("QR verification routes a trusted Air Bank test automatically, scoped queue remains visible, verified QR collapses", async ({ page }) => {
  if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Local/CI DB only");
  test.slow();
  const db = new PrismaClient();
  const token = randomUUID();
  try {
    const owner = await db.owner.create({ data: { name: `QR test ${token}` } });
    const property = await db.property.create({ data: { name: `QR house ${token}`, ownerId: owner.id, address: "Testovací 1", city: "Test" } });
    const other = await db.property.create({ data: { name: `Other QR house ${token}`, ownerId: owner.id, address: "Testovací 2", city: "Test" } });
    const account = await db.ownerBankAccount.create({ data: { ownerId: owner.id, accountNumber: "2000145399", bankCode: "3030" } });
    const pending = await db.ownerBankAccount.create({ data: { ownerId: owner.id, accountNumber: "19-2000145399", bankCode: "0800" } });
    const otherAccount = await db.ownerBankAccount.create({ data: { ownerId: owner.id, accountNumber: "1234567890", bankCode: "5500", propertyLinks: { create: { propertyId: other.id } } } });
    for (const [bank, label] of [[account, "1"], [pending, "2"]] as const) {
      await db.propertyPaymentAccount.create({ data: { propertyId: property.id, ownerBankAccountId: bank.id } });
      await db.unit.create({ data: { propertyId: property.id, label, ownerships: { create: { ownerId: owner.id, ownerBankAccountId: bank.id } } } });
    }
    const vs = verificationCodeForAccount(account.id);
    const rawExcerpt = notification("2000145399/3030", vs);
    const row = await db.inboxPayment.create({ data: { messageId: `QR-${token}`, subject: "QR Air Bank test", sender: "Air Bank <info@airbank.cz>", rawExcerpt, recipientAccount: "2000145399/3030", status: "UNMATCHED", variableSymbol: vs } });
    const unknown = await db.inboxPayment.create({ data: { messageId: `QR-unknown-${token}`, subject: "Unidentified", sender: "notice@example.invalid", rawExcerpt: "Unknown", status: "ERROR", variableSymbol: "99999123" } });
    const unrelated = await db.inboxPayment.create({ data: { messageId: `QR-other-${token}`, recipientAccount: `${otherAccount.accountNumber}/${otherAccount.bankCode}`, status: "UNMATCHED", variableSymbol: "99999456" } });
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test");
    await page.getByLabel("Heslo").fill(process.env.E2E_ADMIN_PASSWORD || "FlatCloud-E2E-Only-Password-2026");
    await page.getByRole("button", { name: "Přihlásit se" }).click();
    await expect(page).toHaveURL(/\/portfolio(?:\?|$)/);
    await page.goto(`/platby/nesparovane?properties=${property.id}`);
    await expect(page.locator(`a[href='/platby/nesparovane/email/${row.id}']`)).toBeVisible();
    await expect(page.locator(`a[href='/platby/nesparovane/email/${unknown.id}']`)).toBeVisible();
    await expect(page.locator(`a[href='/platby/nesparovane/email/${unrelated.id}']`)).toHaveCount(0);
    for (const [sender, testVs, currency] of [["info@airbank.cz.example.invalid", vs, "CZK"], ["info@airbank.cz", "1", "CZK"], ["info@airbank.cz", vs, "EUR"]]) {
      const negative = await db.inboxPayment.create({ data: { messageId: `QR-negative-${randomUUID()}`, sender, rawExcerpt: notification("2000145399/3030", testVs).replaceAll("CZK", currency), status: "ERROR" } });
      await page.goto(`/platby/nesparovane/email/${negative.id}`);
      await page.getByRole("button", { name: "Znovu zpracovat parserem / vrátit ke kontrole", exact: true }).click();
      await expect(page.getByRole("status")).toBeVisible();
      expect((await db.ownerBankAccount.findUniqueOrThrow({ where: { id: account.id } })).notificationVerifiedAt).toBeNull();
      expect((await db.inboxPayment.findUniqueOrThrow({ where: { id: negative.id } })).transactionId).toBeNull();
    }
    await page.goto(`/platby/nesparovane/email/${row.id}`);
    await page.getByRole("button", { name: "Znovu zpracovat parserem / vrátit ke kontrole", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Ověřovací platba 1 Kč");
    const saved = await db.inboxPayment.findUniqueOrThrow({ where: { id: row.id } });
    expect(saved.status).toBe("IGNORED");
    expect(saved.propertyId).toBe(property.id);
    expect(saved.transactionId).toBeNull();
    expect(saved.recipientAccount).toBe("2000145399/3030");
    expect(saved.counterpartyAccount).toBe("19-2000145399/0800");
    expect(saved.rawExcerpt).toBe(rawExcerpt);
    expect((await db.ownerBankAccount.findUniqueOrThrow({ where: { id: account.id } })).notificationVerifiedAt).not.toBeNull();
    expect((await db.ownerBankAccount.findUniqueOrThrow({ where: { id: pending.id } })).notificationVerifiedAt).toBeNull();
    await page.goto(`/nemovitosti/${property.id}/banka`);
    const verified = page.locator("details.verification-verified").filter({ hasText: "2000145399/3030" });
    await expect(verified.locator("summary")).toBeVisible();
    await expect(verified.locator("img")).toBeHidden();
    await expect(page.locator(".verification-box img")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("verified-and-pending-qr.png"), fullPage: true });
    await verified.locator("summary").click();
    await expect(verified.locator("img")).toBeVisible();
    // Parsing the existing row again still creates no rent transaction.
    await page.goto(`/platby/nesparovane/email/${row.id}`);
    await page.getByRole("button", { name: "Znovu zpracovat parserem / vrátit ke kontrole", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Ověřovací platba 1 Kč");
    expect((await db.inboxPayment.findUniqueOrThrow({ where: { id: row.id } })).transactionId).toBeNull();
  } finally { await db.$disconnect(); }
});
