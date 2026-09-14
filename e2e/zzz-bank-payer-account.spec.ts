import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { parseBankNotification } from "../lib/inbound-bank/bank-email";

// Synthetic accounts only; preserve the field names seen in the reported ČS template.
const payer = "123456-9876543210/6210";
const recipient = "1234567890/0800";
const source = ["Informace o transakci", "Datum a čas platby: 14. 9. 2026 03:21", "Směr platby: příchozí", `Číslo účtu: ${recipient}`, `Číslo účtu protistrany: ${payer}`, "Částka v měně transakce: 12 500,00 Kč", "Variabilní symbol: 987654", "Zpráva pro příjemce: R24_AGENT_QA_2026_09 BANK-PAYER-01"].join("\n");

test("BANK-PAYER-01 parses explicit counterparty field including prefix", () => {
  const parsed = parseBankNotification({ text: source, from: "notice@csas.cz", subject: "Přišla platba" });
  expect(parsed.counterpartyAccount).toBe(payer);
  expect(parsed.counterpartyName).toBeUndefined();
  expect(parsed.amountCents).toBe(1250000);
  expect(parsed.variableSymbol).toBe("987654");
  for (const label of ["Číslo účtu protistrany", "Cislo uctu protistrany", "Účet protistrany", "Ucet protistrany"]) {
    for (const text of [`${label}: ${payer}\nNa účet: ${recipient}`, `<p>Na účet: ${recipient}</p><p>${label}: ${payer}</p>`]) {
      const row = parseBankNotification({ text });
      expect(row.counterpartyAccount).toBe(payer);
      expect(row.recipientAccount).toBe(recipient);
    }
  }
});

test("BANK-PAYER-01 does not substitute recipient or weaken source checks", () => {
  const text = `Na účet: ${recipient}\nČástka: 500,00 Kč\nČíslo účtu protistrany: neuvedeno`;
  expect(parseBankNotification({ text }).counterpartyAccount).toBeUndefined();
  const untrusted = parseBankNotification({ text: `Na účet: ${recipient}\n${source}`, from: "notice@example.invalid" });
  expect(untrusted.counterpartyAccount).toBe(payer);
  expect(untrusted.autoProcessEligible).toBe(false);
  const failedAuth = parseBankNotification({ text: `Na účet: ${recipient}\n${source}`, from: "notice@csas.cz", authenticationResults: "dmarc=fail; spf=fail; dkim=fail" });
  expect(failedAuth.autoProcessEligible).toBe(false);
  const rb = parseBankNotification({ text: `Na účet: 1234567890/5500\nProtiúčet: ${payer}\nČástka: 500,00 Kč`, from: "informujme@rb.cz" });
  expect(rb.counterpartyAccount).toBe(payer);
  expect(rb.recipientAccount).toBe("1234567890/5500");
});

test("BANK-PAYER-01 reprocess persists payer and renders it without creating a transaction", async ({ page }) => {
  if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Local/CI DB only");
  const db = new PrismaClient();
  try {
    // Untrusted synthetic sender keeps the test in manual review, with no IMAP/SMTP.
    const rawExcerpt = `Na účet: ${recipient}\n${source}`;
    const row = await db.inboxPayment.create({ data: { messageId: `R24_AGENT_QA_2026_09-${randomUUID()}`, subject: "BANK-PAYER-01", sender: "notice@example.invalid", rawExcerpt, status: "ERROR" } });
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test");
    await page.getByLabel("Heslo").fill(process.env.E2E_ADMIN_PASSWORD || "FlatCloud-E2E-Only-Password-2026");
    await page.getByRole("button", { name: "Přihlásit se" }).click();
    await expect(page).toHaveURL(/\/portfolio(?:\?|$)/);
    await page.goto(`/platby/nesparovane/email/${row.id}`);
    await page.getByRole("button", { name: "Znovu zpracovat parserem / vrátit ke kontrole", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Platební údaje byly rozpoznány");
    await expect(page.locator('.summary-list > div').filter({ has: page.getByText("Účet plátce", { exact: true }) })).toContainText(payer);
    const saved = await db.inboxPayment.findUniqueOrThrow({ where: { id: row.id } });
    expect(saved.counterpartyAccount).toBe(payer);
    expect(saved.recipientAccount).toBe(recipient);
    expect(saved.transactionId).toBeNull();
    expect(saved.rawExcerpt).toBe(rawExcerpt);
    expect(saved.messageId).toBe(row.messageId);
    expect(await db.auditLog.count({ where: { entityId: row.id, action: "INBOUND_PAYMENT_REPROCESSED" } })).toBe(1);
  } finally { await db.$disconnect(); }
});
