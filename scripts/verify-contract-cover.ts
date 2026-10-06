import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { PDFDocument, PDFPage, type PDFPageDrawTextOptions } from "pdf-lib";
import { leaseContractFixture } from "../e2e/fixtures/lease-contract";
import { buildContract, type ContractInput } from "../lib/lease-contracts/core";
import { contractPdf } from "../lib/lease-contracts/pdf";
import { contractPaymentPayload } from "../lib/lease-contracts/cover-pdf";

const clean = (value: string) => value.replace(/\s/g, "");
type Drawn = { text: string; options: PDFPageDrawTextOptions };

async function render(input: ContractInput, preview = true) {
  const pages = new Map<PDFPage, Drawn[]>(), all: string[] = [];
  const original = PDFPage.prototype.drawText;
  PDFPage.prototype.drawText = function (text, options = {}) {
    if (!pages.has(this)) pages.set(this, []);
    pages.get(this)!.push({ text, options }); all.push(text);
    return original.call(this, text, options);
  };
  try {
    const bytes = await contractPdf(input, preview, "https://flatcloud.example.test/portal/najemnik/qa");
    const pdf = await PDFDocument.load(bytes);
    for (const page of pdf.getPages()) assert.deepEqual(page.getSize(), { width: 595.28, height: 841.89 });
    for (const entries of pages.values()) for (const { text, options } of entries) {
      if (!text) continue;
      assert(options.font && options.size && options.x !== undefined && options.y !== undefined);
      assert(options.font.name.includes("Inter"), `Unexpected font ${options.font.name}`);
      const width = options.font.widthOfTextAtSize(text, options.size);
      assert(options.x >= 37.9, `Text outside left page edge: ${text}`);
      assert(options.x + width <= 558, `Text outside right page edge: ${text}`);
      const footer = text.startsWith("Vzor ") || /^\d+ \/ \d+$/.test(text);
      assert(options.y >= (footer ? 15 : 43), `Text collides with footer: ${text}`);
      assert(options.y <= 810, `Text outside top page edge: ${text}`);
    }
    return { bytes, pages: [...pages.values()].map(page => page.map(item => item.text)), all: clean(all.join(" ")) };
  } finally { PDFPage.prototype.drawText = original; }
}

async function main() {
  const normal: ContractInput = {
    ...structuredClone(leaseContractFixture), term: "INDEFINITE", endDate: "",
    unit: { address: "Ukázková 24, 602 00 Brno", label: "Byt 12", floor: "1. NP", disposition: "TWO_KK", areaM2: 52, cadastral: "jednotka 24/12", accessories: "sklep S12" },
    landlord: { type: "COMPANY", name: "Modelové bydlení s.r.o.", identifier: "00000000", address: "Ukázková 24, 602 00 Brno", email: "sprava@example.invalid", phone: "", registry: "Modelová společnost pro ověření sazby", signer: "Jan Novák", authority: "jednatel", represented: false },
    tenants: [{ name: "Tereza Novotná", birthDate: "1990-06-12", address: "Vzorová 18, 602 00 Brno", deliveryAddress: "Vzorová 18, 602 00 Brno", email: "tereza@example.invalid", phone: "+420 700 000 001" }],
    manager: { name: "Eva Dvořáková", email: "sprava@example.invalid", phone: "+420 700 000 002" },
    services: [{ name: "Teplo", amountCents: 135000 }, { name: "Teplá voda", amountCents: 65000 }, { name: "Studená voda", amountCents: 80000 }, { name: "Úklid společných prostor", amountCents: 30000 }, { name: "Osvětlení společných prostor", amountCents: 15000 }, { name: "Výtah", amountCents: 25000 }],
    rentCents: 1890000, depositCents: 3780000, occupantCount: 3,
    occupants: [{ name: "Tereza Novotná", birthDate: "1990-06-12", role: "nájemce" }, { name: "Petr Novotný", birthDate: "1988-03-04", role: "člen domácnosti" }, { name: "Klára Novotná", birthDate: "2000-08-16", role: "člen domácnosti" }],
  };
  const regularQr = contractPaymentPayload(normal);
  assert.equal(regularQr, "SPD*1.0*ACC:CZ7508000000000123456789*AM:22400.00*CC:CZK*X-VS:100012");
  assert.equal(contractPaymentPayload({ ...normal, account: "neurčený účet" }), null);
  assert.equal(contractPaymentPayload({ ...normal, variableSymbol: "chybí" }), null);
  // A deposit and the first month's contractual date must not turn a regular QR into another charge.
  const changedDeposit = { ...normal, depositCents: 10000, firstPaymentDate: "2026-11-20" };
  assert.equal(contractPaymentPayload(changedDeposit), regularQr);

  const result = await render(normal);
  const cover = clean(result.pages[0].join(" "));
  for (const item of normal.services) assert(cover.includes(clean(item.name)), `Missing service ${item.name}`);
  for (const person of normal.occupants!) assert(cover.includes(clean(person.name)), `Missing occupant ${person.name}`);
  assert(cover.includes("22400Kč")); assert(cover.includes("37800Kč"));
  assert(cover.includes("Pojištěníodpovědnosti"));
  assert(result.pages[1].some(text => text === "1 Smluvní strany a zastoupení"), "Six services and three occupants must fit the first A4 page.");
  for (const section of buildContract(normal).sections) for (const paragraph of section.paragraphs) {
    assert(result.all.includes(clean(paragraph)), `Changed or missing contractual paragraph: ${paragraph.slice(0, 80)}`);
  }

  const long = structuredClone(normal);
  long.occupantCount = 50;
  long.occupants = Array.from({ length: 50 }, (_, i) => ({ name: `Osoba ${i + 1} ${"Dlouhépříjmení".repeat(9)} KonecOsoby${String(i + 1).padStart(3, "0")}X`, role: "člen domácnosti" }));
  long.services = Array.from({ length: 30 }, (_, i) => ({ name: `Služba ${i + 1} ${"Podrobný doložený popis zajišťované služby. ".repeat(10)} KonecSlužby${String(i + 1).padStart(3, "0")}X`, amountCents: 1001 + i }));
  long.landlord.address = "Doložená adresa pronajímatele. ".repeat(20) + "KonecAdresy";
  long.account = "CZ6508000000192000145399";
  const overflow = await render(long);
  const legalPage = overflow.pages.findIndex(page => page.includes("1 Smluvní strany a zastoupení"));
  assert(legalPage > 1, "Long genuine data must flow onto continuation cover pages.");
  const completeCover = clean(overflow.pages.slice(0, legalPage).flat().join(" "));
  for (let i = 1; i <= 50; i++) assert(completeCover.includes(`KonecOsoby${String(i).padStart(3, "0")}X`), `Lost occupant ${i}`);
  for (let i = 1; i <= 30; i++) assert(completeCover.includes(`KonecSlužby${String(i).padStart(3, "0")}X`), `Lost service ${i}`);
  assert(completeCover.includes("KonecAdresy"));
  assert(completeCover.includes("Neuvedeno"), "Unavailable household birthdates must remain unavailable.");

  const noResidents = await render({ ...normal, occupants: [], account: "nesprávný účet" });
  assert(noResidents.all.includes(clean("Jmenný seznam osob pro rozúčtování není uveden.")));
  assert(noResidents.all.includes(clean("QR není k dispozici – ověřte účet.")));
  if (process.env.CONTRACT_COVER_QA_OUTPUT) {
    const directory = process.env.CONTRACT_COVER_QA_OUTPUT; await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/contract-cover-normal.pdf`, result.bytes);
    await writeFile(`${directory}/contract-cover-overflow.pdf`, overflow.bytes);
    await writeFile(`${directory}/contract-cover-unavailable-data.pdf`, noResidents.bytes);
  }
  console.log("PASS: Inter A4 cover, six services/three named people on page one, complete long-data continuation, unchanged clauses, regular payment QR and unavailable-data rendering.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
