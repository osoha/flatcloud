import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { redactBankBalances } from "../lib/inbound-bank/balance-redaction";
import { parseBankNotification } from "../lib/inbound-bank/bank-email";
import { failedBankEmailExcerpt } from "../lib/inbound-bank/email-storage";
import { parseRawEmail } from "../lib/inbound-bank/imap";

const payment = "Příchozí úhrada okamžitá\nÚčet: 123456789/0300\nÚčet protistrany: 987654321/0800\nNázev protistrany: Testovací plátce\nČástka: +1,00 CZK\nVariabilní symbol: 12345678\nDatum účtování: 3.10.2026\nZpráva: Nájemné";
const input = { from: "noreply@csob.cz", subject: "Moje info - Avízo", text: payment };
for (const [balance, secret] of [
  ["Zůstatek na účtu po zaúčtování transakce: +179 432,37 CZK.", "179 432,37"],
  ["Disponibilní zůstatek\n\n-179\u00a0432,37 Kč", "179\u00a0432,37"],
  ["Účetní zůstatek: 179.432,37 CZK", "179.432,37"],
  ["Zustatek: 179432", "179432"],
  ["Available balance: EUR 179,432.37", "179,432.37"],
  ["Current balance\n179432.37 USD", "179432.37"],
  ["Zostatok: 179432,37 EUR", "179432,37"],
  ["Saldo: −179432,37 CZK", "179432,37"],
] as const) {
  const parsed = parseBankNotification({ ...input, text: `${payment}\n${balance}` });
  assert.ok(!JSON.stringify(parsed).includes(secret), `Stored parser output must omit ${secret}`);
  assert.match(parsed.rawExcerpt, /xxxx/);
  for (const candidate of [parsed, parseBankNotification({ ...input, text: parsed.rawExcerpt })]) {
    assert.equal(candidate.amountCents, 100);
    assert.equal(candidate.recipientAccount, "123456789/0300");
    assert.equal(candidate.counterpartyAccount, "987654321/0800");
    assert.equal(candidate.variableSymbol, "12345678");
    assert.equal(candidate.counterpartyName, "Testovací plátce");
    assert.equal(candidate.message, "Nájemné");
    assert.equal(candidate.autoProcessEligible, true);
  }
  assert.equal(redactBankBalances(parsed.rawExcerpt), parsed.rawExcerpt, "Masking is idempotent");
}
assert.equal(redactBankBalances("Zůstatek: 500 Kč; Částka platby: 25 Kč; VS: 7"), "Zůstatek: xxxx Kč; Částka platby: 25 Kč; VS: 7");
assert.equal(redactBankBalances("Zůstatek\nČástka: 25 Kč\nVS: 7"), "Zůstatek\nČástka: 25 Kč\nVS: 7");
assert.equal(redactBankBalances("Balance\nAmount: 25 EUR\nVS 7"), "Balance\nAmount: 25 EUR\nVS 7");
assert.equal(redactBankBalances("Zůstatek na účtu 123456789/0300 k 3.10.2026: 179432,37 CZK"), "Zůstatek na účtu 123456789/0300 k 3.10.2026: xxxx CZK");
assert.equal(redactBankBalances("Zůstatek na účtu 123456789/0300 179432,37 CZK"), "Zůstatek na účtu 123456789/0300 xxxx CZK");
const debit = "Částka: 2500,00 CZK\nÚčet příjemce: 987654321/0800\nZůstatek na účtu 123456789/3030 se snížil o 2500,00 CZK na 179432,37 CZK";
for (const text of [debit, redactBankBalances(debit)]) {
  const parsed = parseBankNotification({ from: "info@airbank.cz", text });
  assert.equal(parsed.amountCents, -250000);
  assert.equal(parsed.recipientAccount, "123456789/3030");
  assert.equal(parsed.autoProcessEligible, true);
  assert.ok(!JSON.stringify(parsed).includes("179432,37"));
}
assert.equal(parseBankNotification({ ...input, text: "Účet: 123456789/0300\nZůstatek: 179432,37 CZK" }).amountCents, undefined, "A balance is never a fallback payment amount");
const subjectBalance = parseBankNotification({ ...input, subject: "Zůstatek: 179432,37 Kč", text: payment });
assert.equal(subjectBalance.subject, "Zůstatek: xxxx Kč");
const noteBalance = parseBankNotification({ ...input, text: payment.replace("Nájemné", "Zůstatek: 179432,37 Kč") });
assert.equal(noteBalance.message, "Zůstatek: xxxx Kč");

const html = `<table><tr><td>Částka</td><td>+1,00 CZK</td></tr><tr><td>Účet</td><td>123456789/0300</td></tr><tr><td>Zůstatek</td><td>179432,37 CZK</td></tr></table>`;
const bodies = [payment + "\nZůstatek: 179432,37 CZK", html];
for (const body of bodies) for (const encoding of ["base64", "quoted-printable"] as const) {
  const encoded = encoding === "base64" ? Buffer.from(body).toString("base64") : [...Buffer.from(body)].map(b => `=${b.toString(16).padStart(2, "0")}`).join("");
  const raw = Buffer.from(`From: noreply@csob.cz\r\nSubject: Moje info\r\nContent-Type: text/${body === html ? "html" : "plain"}; charset=UTF-8\r\nContent-Transfer-Encoding: ${encoding}\r\n\r\n${encoded}`);
  const parsed = parseBankNotification(parseRawEmail(raw));
  const failed = failedBankEmailExcerpt(raw);
  assert.match(failed, /xxxx/);
  assert.ok(!failed.includes("179432,37"));
  assert.ok(!failed.includes(encoded), "Error persistence must not retain encoded MIME source");
  assert.ok(!JSON.stringify(parsed).includes("179432,37"));
  assert.equal(parsed.amountCents, 100);
  assert.equal(parsed.recipientAccount, "123456789/0300");
}
const long = parseBankNotification({ ...input, text: `${payment}\nZůstatek: 179432,37 CZK\n${"x".repeat(5000)}` });
assert.ok(long.rawExcerpt.length <= 4000 && !long.rawExcerpt.includes("179432,37"));
assert.equal(redactBankBalances(payment), payment);
const multipart = Buffer.from(`From: noreply@csob.cz\r\nContent-Type: multipart/alternative; boundary=privacy-test\r\n\r\n--privacy-test\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(bodies[0]).toString("base64")}\r\n--privacy-test\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(html).toString("base64")}\r\n--privacy-test--`);
assert.ok(!failedBankEmailExcerpt(multipart).includes("179432,37"), "Both MIME alternatives are redacted");
// Verify the sole production ingestion path uses decoded/redacted error content
// and never sends payload-bearing errors to the scheduler log or stored parseNote.
const sync = readFileSync("lib/inbound-bank/sync.ts", "utf8");
assert.match(sync, /rawExcerpt: failedBankEmailExcerpt\(rawMessage.source\)/);
assert.doesNotMatch(sync, /rawMessage\.source\.toString|error\.message|, error\)|, persistError\)|throw persistError/);
console.log("Bank balance privacy: plain/HTML/encoded MIME, error storage, replay, debit/account identity and payment data passed.");
