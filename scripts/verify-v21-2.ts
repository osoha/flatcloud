import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseRawEmail } from "../lib/inbound-bank/imap";
import { bankCodeFromAccount, bankNameForCode, parseBankNotification } from "../lib/inbound-bank/bank-email";

const cs = parseBankNotification({
  from: "Česká spořitelna <noreply@csas.cz>",
  subject: "Přišla platba",
  date: new Date("2026-08-25T12:00:00Z"),
  text: [
    "Dobrý den, pane Šohaji,",
    "na účet 6759473329/0800 právě dorazila platba ve výši 1,00 Kč.",
    "Variabilní symbol: 40629773",
    "Zpráva: Testovací platba",
    "Vaše Česká spořitelna",
  ].join("\n"),
});
assert.equal(cs.bank, "0800");
assert.equal(cs.bankName, "Česká spořitelna");
assert.equal(cs.trustedSource, true);
assert.equal(cs.recognizedPayment, true);
assert.equal(cs.autoProcessEligible, true);
assert.equal(cs.validPayment, true);
assert.equal(cs.amountCents, 100);
assert.equal(cs.recipientAccount, "6759473329/0800");
assert.equal(cs.variableSymbol, "40629773");

const rb = parseBankNotification({
  from: "Raiffeisenbank <informujme@rb.cz>",
  subject: "Informuj mě - příchozí platba",
  text: "Na účet: 1234567890/5500\nČástka: 15 500,00 CZK\nProtiúčet: 123456789/0800\nVariabilní symbol: 1001",
});
assert.equal(rb.bank, "5500");
assert.equal(rb.bankName, "Raiffeisenbank");
assert.equal(rb.trustedSource, true);
assert.equal(rb.autoProcessEligible, true);
assert.equal(rb.amountCents, 1_550_000);

// A bank without a special adapter must still parse universally and reach the manual queue.
const fio = parseBankNotification({
  from: "Bank notification <notifications@some-mail-domain.example>",
  subject: "Incoming payment",
  text: "Beneficiary account: 2101234567/2010\nPayment amount: 18 500,00 CZK\nVariable symbol: 1205\nSender account: 123456789/0800",
});
assert.equal(fio.bank, "2010");
assert.equal(fio.bankName, "Fio banka");
assert.equal(fio.recognizedPayment, true);
assert.equal(fio.trustedSource, false);
assert.equal(fio.autoProcessEligible, false);
assert.equal(fio.validPayment, false);
assert.equal(fio.amountCents, 1_850_000);
assert.equal(fio.variableSymbol, "1205");
assert.match(fio.parseNote, /ruční potvrzení/i);

const kb = parseBankNotification({
  from: "Automatická zpráva <bank@example.net>",
  text: "Na účet 19-1234567/0100 byla připsána částka 2 350,00 Kč.\nVS: 777",
});
assert.equal(kb.bank, "0100");
assert.equal(kb.bankName, "Komerční banka");
assert.equal(kb.recognizedPayment, true);
assert.equal(kb.autoProcessEligible, false);

const unknownCode = parseBankNotification({
  from: "Payment service <notice@example.net>",
  text: "Na účet 123456789/9999 dorazila částka 99,00 Kč.\nVS: 42",
});
assert.equal(unknownCode.bank, "9999");
assert.equal(unknownCode.bankName, "Banka 9999");
assert.equal(unknownCode.recognizedPayment, true);
assert.equal(unknownCode.autoProcessEligible, false);

const spoofed = parseBankNotification({
  from: "Podvodník <attacker@example.com>",
  subject: "Přišla platba",
  text: "na účet 6759473329/0800 právě dorazila platba ve výši 18 500,00 Kč.\nVariabilní symbol: 40629773\nVaše Česká spořitelna",
});
assert.equal(spoofed.bank, "0800");
assert.equal(spoofed.recognizedPayment, true);
assert.equal(spoofed.trustedSource, false);
assert.equal(spoofed.autoProcessEligible, false, "Spoofovaný zdroj nesmí být automaticky importován.");

const authFailure = parseBankNotification({
  from: "Česká spořitelna <noreply@csas.cz>",
  authenticationResults: "mx.example; dmarc=fail; spf=fail; dkim=fail",
  text: "na účet 6759473329/0800 dorazila platba 1,00 Kč.\nVariabilní symbol: 40629773",
});
assert.equal(authFailure.recognizedPayment, true);
assert.equal(authFailure.trustedSource, false);
assert.equal(authFailure.autoProcessEligible, false);

assert.equal(bankNameForCode("0300"), "ČSOB");
assert.equal(bankNameForCode("0600"), "MONETA Money Bank");
assert.equal(bankNameForCode("2700"), "UniCredit Bank");
assert.equal(bankNameForCode("3030"), "Air Bank");
assert.equal(bankNameForCode("6363"), "Partners Banka");
assert.equal(bankCodeFromAccount("000019-0001234567 / 0800"), "0800");
assert.equal(bankCodeFromAccount("CZ6508000000001920000145"), "0800");

const raw = Buffer.from([
  "From: Ceska sporitelna <noreply@csas.cz>",
  "Return-Path: <bounce@csas.cz>",
  "Authentication-Results: mx.example; dmarc=pass; spf=pass; dkim=pass",
  "Subject: Prisla platba",
  "Date: Tue, 25 Aug 2026 14:00:00 +0200",
  "Content-Type: text/plain; charset=UTF-8",
  "",
  "na ucet 6759473329/0800 dorazila platba 1,00 Kc.",
].join("\r\n"), "utf8");
const mail = parseRawEmail(raw);
assert.match(mail.returnPath || "", /csas\.cz/);
assert.match(mail.authenticationResults || "", /dmarc=pass/);

const detail = readFileSync("app/platby/nesparovane/email/[id]/page.tsx", "utf8");
assert.match(detail, /Ověření bankovního účtu/);
assert.match(detail, /Znovu zpracovat parserem/);
assert.match(detail, /bankNameForCode/);
assert.doesNotMatch(detail, /RB e-mail – ruční spárování/);

const queue = readFileSync("app/platby/nesparovane/page.tsx", "utf8");
assert.match(queue, /Bankovní notifikace k ručnímu řešení/);
assert.match(queue, /bankNameForCode/);
assert.doesNotMatch(queue, /RB e-maily bez objektu/);

const processSource = readFileSync("lib/inbound-bank/process.ts", "utf8");
assert.match(processSource, /provider: "bank-email"/);
assert.match(processSource, /source: "email-bank"/);
assert.doesNotMatch(processSource, /provider: "rb-email"/);

const syncSource = readFileSync("lib/inbound-bank/sync.ts", "utf8");
assert.match(syncSource, /parsedPayment\.recognizedPayment/);
assert.match(syncSource, /parsedPayment\.autoProcessEligible/);

const registry = readFileSync("lib/inbound-bank/czech-bank-registry.ts", "utf8");
for (const code of ["0100", "0300", "0600", "0710", "0800", "2010", "2250", "2700", "3030", "5500", "6210", "6363"]) {
  assert.match(registry, new RegExp(`"${code}"`));
}

const migration = readFileSync("prisma/migrations/20260825162000_v21_2_multibank_email/migration.sql", "utf8");
assert.match(migration, /SET "bank" = '5500' WHERE "bank" = 'RB'/);
assert.match(migration, /bank-email/);
assert.match(migration, /email-bank/);

console.log("FlatCloud V21.2 universal bank e-mail verification OK");
