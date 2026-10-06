import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFPage, type PDFPageDrawTextOptions } from "pdf-lib";
import sharp from "sharp";
import { receiptPdf, type ReceiptSnapshot } from "../lib/receipt-pdf";
import { receiptDownloadDisposition } from "../lib/receipt-download";

async function main() {
  const header = receiptDownloadDisposition({ period: "2026-09", tenantName: "Ing. Jan Hrubý" });
  assert.equal(header, 'attachment; filename="Doklad-2026-09-Jan-Hruby.pdf"; filename*=UTF-8\'\'Doklad-2026-09-Jan-Hrub%C3%BD.pdf');
  for (const snapshot of [null, [], { period: "../../2026-09", tenantName: '../\\\"\r\nInjected: yes\u202E.pdf' }, { period: "2026-99", tenantName: " ".repeat(10) }, { period: "2026-09", tenantName: "Ž".repeat(200) }]) {
    const value = receiptDownloadDisposition(snapshot);
    assert.doesNotMatch(value, /[\r\n\\/\u202E]/);
    assert.ok(value.length < 800);
    assert.match(value, /^attachment; filename="[A-Za-z0-9.-]+\.pdf"; filename\*=UTF-8''/);
  }
  const signature = await sharp(Buffer.from('<svg width="400" height="120"><path d="M20 80 Q80 5 120 70 T220 60 L350 85" fill="none" stroke="#13233e" stroke-width="3"/></svg>')).png().toBuffer();
  const stamp = await sharp(Buffer.from('<svg width="350" height="180"><rect x="4" y="4" width="342" height="172" rx="15" fill="none" stroke="#2168f5" stroke-width="3"/><text x="38" y="97" font-size="31" fill="#2168f5">TEST / VZOREK</text></svg>')).png().toBuffer();
  const base: ReceiptSnapshot = {
    issuerName: "Modelové bydlení s.r.o.", issuerAddress: "Ukázková 24\n602 00 Brno",
    tenantName: "Tereza Novotná", tenantAddress: "Vzorová 18\n602 00 Brno",
    location: "Ukázková 24, Brno · Jednotka 12", period: "2026-09", currency: "CZK", amountCents: 1250000,
    items: [{ name: "Nájemné", amountCents: 1250000 }],
    payments: [{ id: "test-payment", amountCents: 1250000, bookedAt: "2026-09-14T12:00:00.000Z" }],
    signatureHash: "test", signerName: "Jan Novák", signerRole: "Jednatel",
  };
  const dense: ReceiptSnapshot = { ...base, amountCents: 2240000,
    items: [{ name: "Nájemné", amountCents: 1890000 }, { name: "Teplo", amountCents: 135000 }, { name: "Teplá voda", amountCents: 65000 }, { name: "Studená voda", amountCents: 80000 }, { name: "Úklid společných prostor", amountCents: 30000 }, { name: "Osvětlení společných prostor", amountCents: 15000 }, { name: "Výtah", amountCents: 25000 }],
    payments: Array.from({ length: 4 }, (_, i) => ({ id: `payment-${i}`, amountCents: 560000, bookedAt: `2026-09-${10 + i}T12:00:00.000Z` })),
  };
  const long: ReceiptSnapshot = { ...dense,
    issuerName: "Společnost vlastníků bytových nemovitostí pro dlouhodobou správu objektů ".repeat(4),
    tenantName: "Tereza Karolína Novotná-Svobodová ".repeat(4),
    issuerAddress: ("Ukázková dlouhá ulice číslo 123456, páté nadzemní podlaží, 602 00 Brno\n").repeat(4),
    location: "ExtrémněDlouhéOznačeníJednotkyBezMezer".repeat(10),
    signerName: "Jan Novák, statutární zástupce dlouhého názvu společnosti pro správu majetku ".repeat(3),
    signerRole: "Pověřený zástupce pronajímatele pro potvrzování přijatých úhrad ".repeat(4),
    items: Array.from({ length: 60 }, (_, i) => ({ name: `Položka-${i + 1} Dlouhé určení služby pro prověření zalomení v úzkém i širokém sloupci`, amountCents: 10000 })),
    payments: Array.from({ length: 48 }, (_, i) => ({ id: `test-${i}`, amountCents: 12500, bookedAt: `2026-09-${String(i % 28 + 1).padStart(2, "0")}T12:00:00.000Z` })),
    amountCents: 600000,
  };
  const output = process.env.RECEIPT_DESIGN_OUTPUT;
  if (output) await mkdir(output, { recursive: true });
  const original = PDFPage.prototype.drawText;
  let drawn: string[] = [];
  PDFPage.prototype.drawText = function (value: string, options?: PDFPageDrawTextOptions) {
    assert.ok(options?.font && options.size && options.x !== undefined && options.y !== undefined);
    const edge = options.x + options.font.widthOfTextAtSize(value, options.size);
    assert.ok(options.x >= 37.8 && edge <= 557.5, `Text exceeds page width: ${value} (${options.x}–${edge})`);
    assert.ok(options.y >= 16 && options.y <= 819, `Text exceeds page height: ${value} (${options.y})`);
    drawn.push(value);
    return original.call(this, value, options);
  };
  try {
    for (const [name, snapshot] of Object.entries({ simple: base, dense, overflow: long })) {
      drawn = [];
      const before = JSON.stringify(snapshot);
      const bytes = await receiptPdf(snapshot, signature, "D-test-charge-65398b4546be", new Date("2026-10-05T12:00:00Z"), name === "simple" ? undefined : stamp);
      const document = await PDFDocument.load(bytes);
      assert.equal(JSON.stringify(snapshot), before, "Rendering must not alter immutable snapshot data");
      if (name === "simple") assert.equal(document.getPageCount(), 1);
      if (name === "dense") assert.ok(document.getPageCount() <= 2);
      if (name === "overflow") assert.ok(document.getPageCount() > 2);
      assert.ok(drawn.some(value => value === "Přiřazená částka"));
      assert.doesNotMatch(drawn.join(" "), /UHRAZENO|QR|splatnost|variabilní symbol/i);
      // Continuation headings may appear between wrapped parts of a value.
      const retained = (value: string) => {
        const rendered = drawn.join("").replace(/\s/g, "");
        let cursor = 0;
        for (const letter of value.replace(/\s/g, "")) {
          cursor = rendered.indexOf(letter, cursor);
          if (cursor < 0) return false;
          cursor++;
        }
        return true;
      };
      for (const item of snapshot.items) assert.ok(retained(item.name), `Missing item: ${item.name}`);
      for (const value of [snapshot.issuerName, snapshot.tenantName, snapshot.location, snapshot.signerName!, snapshot.signerRole!]) assert.ok(retained(value), `Missing snapshot value: ${value}`);
      if (output) await writeFile(path.join(output, `receipt-${name}.pdf`), bytes);
      console.log(`${name}: ${document.getPageCount()} pages, all snapshot text retained within page bounds`);
    }
  } finally { PDFPage.prototype.drawText = original; }
  console.log("Receipt design and safe immutable-snapshot download names passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
