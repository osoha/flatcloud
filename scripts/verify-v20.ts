import assert from "node:assert/strict";
import { parseRawEmail } from "../lib/inbound-bank/imap";
import { normalizeBankAccount, parseMoneyToCents, parseRbNotification } from "../lib/inbound-bank/rb";
import { parseBankNotification } from "../lib/inbound-bank/bank-email";
import { notificationInScope } from "../lib/inbound-bank/queue-scope";
import { addCalendarMonths, leaseAlertsForProperties, nextLeaseAnniversary } from "../lib/lease-alerts";

const legacy = parseRbNotification({
  from: "Raiffeisenbank <informujme@rb.cz>",
  subject: "Info o platbě",
  date: new Date("2026-08-24T10:00:00Z"),
  text: [
    "Info o platbě",
    "Z: 123456789/0800",
    "Na: 1234567890/5500",
    "Realizováno: 15 500,00 CZK",
    "Dne: 24.08.2026",
    "Konstantní symbol: 0308",
    "Variabilní symbol: 1001",
    "Specifický symbol: 9",
  ].join("\n"),
});
assert.equal(legacy.validPayment, true);
assert.equal(legacy.amountCents, 1_550_000);
assert.equal(legacy.recipientAccount, "1234567890/5500");
assert.equal(legacy.counterpartyAccount, "123456789/0800");
assert.equal(legacy.variableSymbol, "1001");
assert.equal(legacy.constantSymbol, "308");
assert.equal(legacy.specificSymbol, "9");

const htmlRaw = Buffer.from([
  "From: =?UTF-8?Q?Raiffeisenbank?= <informujme@rb.cz>",
  "Subject: =?UTF-8?Q?Informuj_m=C4=9B_-_p=C5=99=C3=ADchoz=C3=AD_platba?=",
  "Message-ID: <abc123@rb.cz>",
  "Date: Mon, 24 Aug 2026 12:00:00 +0200",
  "MIME-Version: 1.0",
  "Content-Type: text/html; charset=UTF-8",
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "<html><body><table><tr><td>Na =C3=BA=C4=8Det:</td><td>1234567890/5500</td></tr><tr><td>=C4=8C=C3=A1stka:</td><td>15 500,00 CZK</td></tr><tr><td>Proti=C3=BA=C4=8Det:</td><td>123456789/0800</td></tr><tr><td>Variabiln=C3=AD symbol:</td><td>1001</td></tr></table></body></html>",
].join("\r\n"), "ascii");
const mail = parseRawEmail(htmlRaw);
assert.match(mail.subject || "", /příchozí/);
const html = parseRbNotification(mail);
assert.equal(html.validPayment, true);
assert.equal(html.amountCents, 1_550_000);
assert.equal(html.recipientAccount, "1234567890/5500");
assert.equal(html.counterpartyAccount, "123456789/0800");
assert.equal(html.variableSymbol, "1001");

const outgoing = parseRbNotification({
  from: "Raiffeisenbank <informujme@rb.cz>",
  subject: "Info o platbě",
  text: "Z: 1234567890/5500\nNa: 123456789/0800\nRealizováno: -1 200,00 CZK\nDne: 24.08.2026\nVariabilní symbol: 1001",
});
assert.equal(outgoing.validPayment, false, "Odchozí platba nesmí být importována jako nájemné.");

assert.equal(normalizeBankAccount("000019-0001234567 / 0800"), "19-1234567/0800");
assert.equal(parseMoneyToCents("1.234,56 Kč"), 123_456);
// Synthetic fixture mirrors the observed Air Bank wording without customer data.
const airText = `Zvýšení zůstatku na účtu Testovací dům
zůstatek na účtu Testovací dům číslo 2000145399/3030 se zvýšil o částku 1,00 CZK. Dostupný zůstatek je 9 999,00 CZK.
Příchozí úhrada z účtu TEST PLATCE číslo 19-2000145399/0800
Částka: 1,00 CZK
Variabilní symbol: 12345678`;
const air = parseBankNotification({ from: "Air Bank <info@airbank.cz>", text: airText });
assert.equal(air.recipientAccount, "2000145399/3030");
assert.equal(air.counterpartyAccount, "19-2000145399/0800");
assert.equal(air.amountCents, 100);
assert.equal(air.variableSymbol, "12345678");
assert.equal(air.autoProcessEligible, true);
for (const from of ["info@example.invalid", "info@airbank.cz.example.invalid"]) {
  assert.equal(parseBankNotification({ from, text: airText }).autoProcessEligible, false);
}
assert.equal(parseBankNotification({ from: "info@airbank.cz", text: airText, authenticationResults: "dmarc=fail" }).autoProcessEligible, false);
for (const [bankCode, from, trusted] of [["0800", "info@csas.cz", true], ["5500", "info@rb.cz", true], ["2010", "info@fio.cz", false]] as const) {
  const parsed = parseBankNotification({ from, text: `Platba na účet Test číslo 2000145399/${bankCode}\nZ účtu: 19-2000145399/0800\nČástka: 1,00 CZK\nVS: 12345678` });
  assert.equal(parsed.recipientAccount, `2000145399/${bankCode}`);
  assert.equal(parsed.counterpartyAccount, "19-2000145399/0800");
  assert.equal(parsed.bank, bankCode);
  assert.equal(parsed.autoProcessEligible, trusted);
}
assert.equal(parseBankNotification({ text: "Na účet: CZ65 0800 0000 1920 0014 5399 další text\nČástka: 1 Kč" }).recipientAccount, "CZ6508000000192000145399");
assert.equal(parseBankNotification({ text: "Na účet: 123456789012/0800\nČástka: 1 Kč" }).recipientAccount, undefined);
assert.equal(parseBankNotification({ text: "Číslo účtu protistrany: 1234567890/0800\nČástka: 1 Kč" }).recipientAccount, undefined);
const scopes = [{ accountNumber: "2000145399", bankCode: "3030", iban: null, propertyLinks: [{ propertyId: "house1" }], unitOwnerships: [], leases: [] }];
assert.equal(notificationInScope({ propertyId: null, recipientAccount: "2000145399/3030" }, scopes, ["house1"]), true);
assert.equal(notificationInScope({ propertyId: null, recipientAccount: "2000145399/3030" }, scopes, ["house2"]), false);
assert.equal(notificationInScope({ propertyId: null, recipientAccount: "7/3030" }, scopes, ["house1"]), true);
assert.equal(notificationInScope({ propertyId: "house2", recipientAccount: "2000145399/3030" }, scopes, ["house1"]), false);

const now = new Date("2026-08-24T12:00:00Z");
assert.equal(addCalendarMonths(now, 3).toISOString().slice(0, 10), "2026-11-24");
assert.equal(nextLeaseAnniversary(new Date("2020-10-01T12:00:00Z"), now).toISOString().slice(0, 10), "2026-10-01");
const alerts = leaseAlertsForProperties([{ id: "p", name: "P", units: [{ id: "u", label: "1", propertyId: "p", leases: [{ id: "l", contractNumber: "S1", startDate: new Date("2020-10-01T12:00:00Z"), endDate: new Date("2026-11-15T12:00:00Z"), status: "ACTIVE", tenant: { id: "t", name: "T" } }] }] }], now, 3);
assert.deepEqual(alerts.map((item) => item.kind), ["ANNIVERSARY", "EXPIRY"]);

console.log("FlatCloud V20 logic verification OK");
