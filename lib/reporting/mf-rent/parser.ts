import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import { mfRentTerritoryDataSchema, type MfRentTerritoryData } from "./schema";
export const MF_RENT_PARSER_VERSION = "mf-rent-1.0.0";
export const MF_MAX_SHEETS = 20;
export const MF_MAX_ROWS = 20_000;
type Parsed = {
  schemaFingerprint: string;
  territories: Array<{
    territoryCode: string;
    territoryName: string;
    municipalityName: string | null;
    districtName: null;
    regionName: string | null;
    data: MfRentTerritoryData;
  }>;
  coverage: Record<string, number>;
};
function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && "richText" in (v as object))
    return ((v as { richText: Array<{ text: string }> }).richText || [])
      .map((x) => x.text)
      .join("");
  return String(v);
}
export function normalizeMfHeader(v: unknown) {
  return text(v)
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
function money(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "number" || !Number.isFinite(v))
    throw new Error("Neplatná peněžní hodnota v datech MF.");
  return Math.round(v * 100);
}
function integer(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "number" || !Number.isInteger(v))
    throw new Error("Neplatná celočíselná hodnota v datech MF.");
  return v;
}
const expected = [
  "najemne referencniho bytu za m2 v kc za 1 mesic",
  "dolni interval najemneho u referencniho bytu za m2 v kc za 1 mesic",
  "horni interval najemneho u referencniho bytu za m2 v kc za 1 mesic",
  "najemne referencniho bytu novostavby za m2 v kc za 1 mesic",
  "minimalni hodnota najemneho za m2 v kc",
  "maximalni hodnota najemneho za m2 v kc",
  "medianova hodnota najemneho za m2 v kc",
  "datova pokrytost",
];
export async function parseMfRentWorkbook(
  bytes: Uint8Array,
  options: { minimumTerritories?: number; minimumCoverageRatio?: number } = {},
): Promise<Parsed> {
  if (bytes.byteLength > 10 * 1024 * 1024)
    throw new Error("XLSX MF překročilo povolenou velikost.");
  const workbook = new ExcelJS.Workbook();
  const input = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  await workbook.xlsx.load(input);
  if (workbook.worksheets.length > MF_MAX_SHEETS)
    throw new Error("XLSX MF obsahuje příliš mnoho listů.");
  const candidates = workbook.worksheets
    .filter((s) => s.rowCount > 1 && s.rowCount <= MF_MAX_ROWS)
    .map((sheet) => {
      for (let r = 1; r <= Math.min(sheet.rowCount, 20); r++) {
        const headers = (sheet.getRow(r).values as unknown[])
          .slice(1)
          .map(normalizeMfHeader);
        if (
          headers.includes("katastralni uzemi") &&
          headers.includes("obec") &&
          headers.filter((h) => h === "vk").length === 4
        )
          return { sheet, row: r, headers };
      }
      return null;
    })
    .filter(Boolean) as Array<{
    sheet: ExcelJS.Worksheet;
    row: number;
    headers: string[];
  }>;
  if (candidates.length !== 1)
    throw new Error("Tabulkový list MF chybí nebo je nejednoznačný.");
  const { sheet, row, headers } = candidates[0];
  for (const required of ["kraj", "katastralni uzemi", "obec", "kod obce"])
    if (headers.filter((h) => h === required).length !== 1)
      throw new Error(
        `Povinné pole MF chybí nebo je nejednoznačné: ${required}`,
      );
  const vkCols = headers
    .map((h, i) => (h === "vk" ? i + 1 : 0))
    .filter(Boolean);
  if (vkCols.length !== 4) throw new Error("Bloky VK1–VK4 jsou nejednoznačné.");
  const blocks = vkCols.map((start, index) => {
    const end = (vkCols[index + 1] ?? headers.length + 1) - 1;
    const fields = new Map<string, number>();
    for (const required of expected) {
      const matches = [];
      for (let column = start + 1; column <= end; column++)
        if (headers[column - 1] === required) matches.push(column);
      if (matches.length !== 1)
        throw new Error(
          `Povinné pole kategorie MF chybí nebo je nejednoznačné: ${required}`,
        );
      fields.set(required, matches[0]);
    }
    return { vk: start, fields };
  });
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        {
          sheet: normalizeMfHeader(sheet.name),
          headers: headers.filter(Boolean),
        },
      ]),
    )
    .digest("hex");
  const byCode = new Set<string>();
  const territories: Parsed["territories"] = [];
  const coverage = { vk1: 0, vk2: 0, vk3: 0, vk4: 0 };
  const col = (name: string) => headers.indexOf(name) + 1;
  for (let r = row + 1; r <= sheet.rowCount; r++) {
    const record = sheet.getRow(r);
    const municipalityName = text(record.getCell(col("obec")).value).trim();
    const territoryName =
      text(record.getCell(col("katastralni uzemi")).value).trim() ||
      municipalityName;
    if (!territoryName) continue;
    const municipalityCode = text(record.getCell(col("kod obce")).value).trim();
    if (!municipalityCode) throw new Error("Řádek MF nemá kód obce.");
    const territoryCode = `${municipalityCode}/${normalizeMfHeader(territoryName).replace(/ /g, "-")}`;
    if (byCode.has(territoryCode))
      throw new Error(`Duplicitní území MF: ${territoryCode}`);
    byCode.add(territoryCode);
    const data: any = { schemaVersion: 1 };
    blocks.forEach((block, index) => {
      const officialVk = integer(record.getCell(block.vk).value);
      if (officialVk !== index + 1)
        throw new Error("Pořadí kategorií VK neodpovídá označení v řádku.");
      const get = (header: string) =>
        record.getCell(block.fields.get(header)!).value;
      const category = {
        referenceRentCentsPerM2: money(get(expected[0])),
        lowerIntervalCentsPerM2: money(get(expected[1])),
        upperIntervalCentsPerM2: money(get(expected[2])),
        newBuildReferenceRentCentsPerM2: money(get(expected[3])),
        minimumCentsPerM2: money(get(expected[4])),
        maximumCentsPerM2: money(get(expected[5])),
        medianCentsPerM2: money(get(expected[6])),
        dataCoverage: integer(get(expected[7])),
      };
      data[`vk${index + 1}`] = category;
      if (category.referenceRentCentsPerM2 !== null)
        coverage[`vk${index + 1}` as keyof typeof coverage]++;
    });
    territories.push({
      territoryCode,
      territoryName,
      municipalityName: municipalityName || null,
      districtName: null,
      regionName: text(record.getCell(col("kraj")).value).trim() || null,
      data: mfRentTerritoryDataSchema.parse(data),
    });
  }
  const minimum = options.minimumTerritories ?? 7000;
  if (territories.length < minimum)
    throw new Error(
      `Dataset MF nemá věrohodné národní pokrytí (${territories.length}).`,
    );
  const ratio = options.minimumCoverageRatio ?? 0.7;
  for (const value of Object.values(coverage))
    if (value < territories.length * ratio)
      throw new Error("Dataset MF nemá dostatečné pokrytí kategorií VK.");
  return { schemaFingerprint: fingerprint, territories, coverage };
}
