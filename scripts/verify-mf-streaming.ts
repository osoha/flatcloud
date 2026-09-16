import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import ExcelJS from "exceljs";
import { parseMfRentWorkbook } from "../lib/reporting/mf-rent/parser";

async function main() {
  if (process.argv[2] === "--parse") {
    for (let i = 0; i < 3; i++) {
      const parsed = await parseMfRentWorkbook(await readFile(process.argv[3]));
      assert.equal(parsed.territories.length, 10000);
      assert.equal(parsed.territories[9999].data.vk4.referenceRentCentsPerM2, 12345);
      assert.equal(parsed.territories[0].data.vk1.lowerIntervalCentsPerM2, null);
      assert.equal(parsed.territories[0].data.vk1.minimumCentsPerM2, 0);
    }
    console.log("National-sized MF workbooks parsed 3 times with 128 MiB heap.");
    return;
  }
  const dir = await mkdtemp(join(tmpdir(), "flatcloud-mf-"));
  try {
    const file = join(dir, "national.xlsx");
    const book = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: file, useSharedStrings: true });
    const sheet = book.addWorksheet("MF synthetic national coverage");
    const labels = [
      "Nájemné referenčního bytu za m² v Kč za 1 měsíc",
      "Dolní interval nájemného u referenčního bytu za m² v Kč za 1 měsíc",
      "Horní interval nájemného u referenčního bytu za m² v Kč za 1 měsíc",
      "Nájemné referenčního bytu novostavby za m² v Kč za 1 měsíc",
      "Minimální hodnota nájemného za m² v Kč",
      "Maximalní hodnota nájemného za m² v Kč",
      "Mediánová hodnota nájemného za m² v Kč", "Datová pokrytost",
    ];
    sheet.addRow(["Kraj", "Katastrální území", "Obec", "Kód obce", ...[1,2,3,4].flatMap(() => ["VK", ...labels])]).commit();
    for (let i = 0; i < 10000; i++)
      sheet.addRow(["QA", `R24_AGENT_QA_2026_09 ${i}`, "QA", 100000+i,
        ...[1,2,3,4].flatMap(vk => [vk, 123.45, null, 145, 333, 0, 500, 222, 1])]).commit();
    await book.commit();
    const child = spawnSync(process.execPath, ["--max-old-space-size=128", "--import", "tsx", process.argv[1], "--parse", file], { encoding: "utf8", timeout: 120000 });
    assert.equal(child.status, 0, child.stderr || String(child.error));
    console.log(child.stdout.trim());
  } finally { await rm(dir, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
