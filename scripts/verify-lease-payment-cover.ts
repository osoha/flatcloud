import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { PDFDocument, PDFPage } from "pdf-lib";
import { paymentCoverDisposition, paymentCoverMoney, paymentCoverVersions, type PaymentCoverItem } from "../lib/lease-payment-cover/core";
import { paymentCoverPdf } from "../lib/lease-payment-cover/pdf";
import { rentPaymentPayload } from "../lib/rent-payment-qr";

async function main() {
const day = (key: string) => new Date(`${key}T12:00:00Z`);
const item = (name: string, category: string, amountCents: number, validFrom: string, validTo: string | null = null): PaymentCoverItem => ({ name, category, amountCents, validFrom: day(validFrom), validTo: validTo ? day(validTo) : null, active: true, sortOrder: category === "RENT" ? 10 : 20 });
const now = day("2026-10-06");
const lease = { startDate: day("2026-09-01"), endDate: null, terminatedOn: null, cancelledAt: null, rentCents: 1890000, servicesCents: 350000, paymentItems: [
  item("Nájemné", "RENT", 1700100, "2026-09-01", "2026-10-31"), item("Nájemné", "RENT", 1890000, "2026-11-01"),
  item("Teplo", "HEATING", 135000, "2026-09-01"), item("Teplá voda", "WATER", 65000, "2026-09-01"), item("Studená voda", "WATER", 80000, "2026-09-01"), item("Úklid společných prostor", "SERVICES", 30000, "2026-09-01"), item("Osvětlení společných prostor", "ELECTRICITY", 15000, "2026-09-01"), item("Výtah", "SERVICES", 25000, "2026-09-01"),
] };
const versions = paymentCoverVersions(lease, now);
assert.deepEqual(versions.map(v => [v.key, v.current, v.totalCents]), [["2026-09-01", true, 2050100], ["2026-11-01", false, 2240000]]);
assert.equal(versions[1].items.length, 7);
assert.equal(paymentCoverVersions({ ...lease, cancelledAt: now }, now).length, 0);
assert.equal(paymentCoverVersions({ ...lease, terminatedOn: day("2026-10-01") }, now).length, 0);
assert.equal(paymentCoverVersions({ ...lease, endDate: day("2026-10-31") }, now).length, 1);
assert.deepEqual(paymentCoverVersions(lease, day("2026-12-01")).map(v => v.key), ["2026-11-01"], "past superseded versions must not be reissued");
assert.equal(paymentCoverVersions({ ...lease, paymentItems: lease.paymentItems.filter(i => i.category === "RENT") }, now).length, 0, "missing non-zero service breakdown must not silently become zero");
const endedServices = { ...lease, servicesCents: 0, paymentItems: lease.paymentItems.map(i => i.category === "RENT" ? i : { ...i, validTo: day("2026-11-30") }) };
assert.deepEqual(paymentCoverVersions(endedServices, now).map(v => [v.key, v.servicesCents]), [["2026-09-01", 350000], ["2026-11-01", 350000], ["2026-12-01", 0]], "explicitly ended service version proves the stored zero");
assert.equal(paymentCoverVersions({ ...lease, paymentItems: [{ ...lease.paymentItems[0], active: false }] }, now).length, 0);
const legacy = paymentCoverVersions({ ...lease, paymentItems: [] }, now);
assert.equal(legacy.length, 1); assert.equal(legacy[0].source, "CURRENT"); assert.equal(legacy[0].effectiveFrom, "2026-10-06");
assert.equal(paymentCoverMoney(1700101, "CZK").replace(/\s/g, ""), "17001,01Kč");
assert.match(paymentCoverDisposition('Jan Šohaj / "test"\n.pdf', "2026-11-01"), /^attachment; filename="Platebni-list-2026-11-01-Jan-Sohaj-test-pdf.pdf"$/);
const qrPayload = rentPaymentPayload({ accountNumber: "2000145399", bankCode: "0800", currency: "CZK" }, "101010101", versions[1].totalCents, "CZK");
assert.match(qrPayload!, /AM:22400.00\*CC:CZK\*X-VS:101010101$/);
const bytes = await paymentCoverPdf({ version: versions[1], contractNumber: "NS-2026-024", tenantNames: ["Tereza Novotná", "Petr Novotný"], address: "Ukázková 24, 602 00 Brno", unitLabel: "Byt 12", currency: "CZK", account: "2000145399/0800", variableSymbol: "101010101", dueDay: 5, rentTiming: "ADVANCE", qrPayload, issuedAt: now });
assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
if (process.env.PAYMENT_COVER_SAMPLE) await writeFile(process.env.PAYMENT_COVER_SAMPLE, bytes);
// Real regression: long, valid joint-tenant names used to push the final payment
// instructions below the physical page. Verify rendered coordinates and every name.
for (const count of [8, 30]) {
  const tenantNames = Array.from({ length: count }, (_, index) => `${index + 1}. ${"DlouhéPříjmení ".repeat(11)}`.trim());
  const drawn: Array<{ text: string; y: number; size: number }> = [];
  const original = PDFPage.prototype.drawText;
  PDFPage.prototype.drawText = function (value, options) { drawn.push({ text: value, y: options?.y ?? 0, size: options?.size ?? 0 }); return original.call(this, value, options); };
  let longBytes: Uint8Array;
  try { longBytes = await paymentCoverPdf({ version: versions[1], contractNumber: "NS-2026-024", tenantNames, address: "Ukázková 24, 602 00 Brno", unitLabel: "Byt 12", currency: "CZK", account: "2000145399/0800", variableSymbol: "101010101", dueDay: 5, rentTiming: "ADVANCE", qrPayload, issuedAt: now }); }
  finally { PDFPage.prototype.drawText = original; }
  assert.ok((await PDFDocument.load(longBytes!)).getPageCount() > 1, "long identities require continuation pages");
  assert.ok(drawn.every(row => row.y === 24 || row.y >= 70), "body text must remain above the footer");
  assert.equal(drawn.filter(row => row.size === 10.5).map(row => row.text).join("").replace(/\s/g, ""), tenantNames.join(" + ").replace(/\s/g, ""), "every tenant name survives measured pagination");
  assert.ok(drawn.some(row => row.text.startsWith("Samostatný platební list přiložte")), "final document instructions must be present");
  assert.ok(drawn.some(row => row.text === "QR · nájem + služby"), "payment QR remains present after pagination");
  if (count === 8 && process.env.PAYMENT_COVER_LONG_SAMPLE) await writeFile(process.env.PAYMENT_COVER_LONG_SAMPLE, longBytes!);
}
console.log("Platební list: uložené verze, nulové služby, historie, přesné částky, QR a PDF ověřeny.");

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
