import assert from "node:assert/strict";
import { parseBankNotification } from "../lib/inbound-bank/bank-email";
import { parseRawEmail } from "../lib/inbound-bank/imap";

// Observed ČSOB Moje info labels, with synthetic customer data.
const lines = [
  "Dobrý den, dne 1.10.2026 byla na účtu 123456789 zaúčtována transakce typu: Příchozí úhrada okamžitá.",
  "Parametry platby", "Účet", "123456789/0300",
  "Účet protistrany", "987654321/0800",
  "Název protistrany", "Testovací plátce",
  "Datum účtování", "1.10.2026",
  "Částka", "+1,00 CZK",
  "Variabilní symbol", "12345678",
  "Zůstatek na účtu po zaúčtování transakce: +179 432,37 CZK.",
  "Vaše ČSOB",
];
const input = { from: "ČSOB <noreply@csob.cz>", subject: "Moje info - Avízo" };
const texts = [
  lines.join("\n"),
  lines.join("\n").replace(/Účet\n/g, "Účet: ").replace(/protistrany\n/g, "protistrany: "),
  `<table>${lines.map(line => `<tr><td>${line}</td></tr>`).join("")}</table>`,
];
for (const text of texts) {
  const parsed = parseBankNotification({ ...input, text });
  assert.equal(parsed.bank, "0300");
  assert.equal(parsed.recipientAccount, "123456789/0300");
  assert.equal(parsed.counterpartyAccount, "987654321/0800");
  assert.equal(parsed.counterpartyName, "Testovací plátce");
  assert.equal(parsed.amountCents, 100, "The balance must not become the payment amount");
  assert.equal(parsed.currency, "CZK");
  assert.equal(parsed.variableSymbol, "12345678");
  assert.equal(parsed.bookedAt?.getDate(), 1);
  assert.equal(parsed.bookedAt?.getMonth(), 9);
  assert.equal(parsed.autoProcessEligible, true);
  const replay = parseBankNotification({ ...input, text: parsed.rawExcerpt });
  assert.equal(replay.recipientAccount, parsed.recipientAccount);
  assert.equal(replay.amountCents, 100);
  assert.equal(replay.variableSymbol, parsed.variableSymbol);
  assert.equal(replay.autoProcessEligible, true);
}
const mime = parseRawEmail(Buffer.from([
  "From: noreply@csob.cz", "Subject: Moje info - Avizo",
  "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
  Buffer.from(texts[2]).toString("base64"),
].join("\r\n")));
assert.equal(parseBankNotification(mime).recipientAccount, "123456789/0300");
assert.equal(parseBankNotification(mime).autoProcessEligible, true);
for (const from of ["noreply@example.invalid", "noreply@csob.cz.example.invalid"]) {
  assert.equal(parseBankNotification({ ...input, from, text: texts[0] }).autoProcessEligible, false);
}
for (const authenticationResults of ["dmarc=fail", "spf=fail; dkim=fail"]) {
  assert.equal(parseBankNotification({ ...input, text: texts[0], authenticationResults }).autoProcessEligible, false);
}
const missingOwnAccount = lines.filter((_, i) => i !== 2 && i !== 3).join("\n");
assert.equal(parseBankNotification({ ...input, text: missingOwnAccount }).recipientAccount, undefined);
assert.equal(parseBankNotification({ ...input, text: missingOwnAccount }).autoProcessEligible, false);
// The same bare account field is the customer's debited account on an outgoing aviso.
for (const text of texts) {
  const outgoing = parseBankNotification({ ...input, text: text.replace("Příchozí úhrada", "Odchozí úhrada") });
  assert.equal(outgoing.recipientAccount, "123456789/0300");
  assert.equal(outgoing.counterpartyAccount, "987654321/0800");
  assert.equal(outgoing.amountCents, -100);
  assert.equal(outgoing.autoProcessEligible, true);
}
const outgoingWithoutOwnAccount = parseBankNotification({ ...input, text: missingOwnAccount.replace("Příchozí úhrada", "Odchozí úhrada") });
assert.equal(outgoingWithoutOwnAccount.recipientAccount, undefined);
assert.equal(outgoingWithoutOwnAccount.autoProcessEligible, false);
const beneficiaryOnly = missingOwnAccount.replace("Účet protistrany", "Účet příjemce");
const outgoingBeneficiaryOnly = parseBankNotification({ ...input, text: beneficiaryOnly.replace("Příchozí úhrada", "Odchozí úhrada") });
assert.equal(outgoingBeneficiaryOnly.recipientAccount, undefined, "The beneficiary account must never become the customer account");
assert.equal(outgoingBeneficiaryOnly.autoProcessEligible, false);
assert.equal(parseBankNotification({ ...input, from: "notice@example.invalid", text: texts[0].replace("Příchozí úhrada", "Odchozí úhrada") }).autoProcessEligible, false);
assert.equal(parseBankNotification({ from: "info@fio.cz", text: "Účet: 123456789/2010\nČástka: 1,00 CZK" }).recipientAccount, undefined);
console.log("ČSOB parser: observed labels, HTML/MIME, reprocessing, balance, direction and sender checks passed.");
