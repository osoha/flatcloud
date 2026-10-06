import { PDFDocument, rgb, type Color, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import qrcode from "qrcode-generator";
import sharp from "sharp";
import { rentPaymentPayload } from "../rent-payment-qr";
import { formatDate, type buildContract, type ContractInput } from "./core";

export const contractPdfTheme = {
  width: 595.28, height: 841.89, left: 38, right: 557.28, bottom: 796,
  ink: rgb(19 / 255, 35 / 255, 62 / 255),
  blue: rgb(33 / 255, 104 / 255, 245 / 255),
  muted: rgb(88 / 255, 106 / 255, 131 / 255),
  line: rgb(220 / 255, 229 / 255, 241 / 255),
  soft: rgb(237 / 255, 244 / 255, 1),
  neutral: rgb(246 / 255, 248 / 255, 251 / 255), white: rgb(1, 1, 1),
};
export type ContractPdfFonts = { regular: PDFFont; medium: PDFFont; semibold: PDFFont; bold: PDFFont };
type Line = { value: string; size: number; font: PDFFont; color: Color; height: number };
type TableRow = { values: string[]; cells: Line[][]; height: number; options: { bold?: boolean; size?: number; gap?: number } };
const T = contractPdfTheme;
const WIDTH = T.right - T.left, LEFT_WIDTH = 284, PANEL_X = 341, PANEL_WIDTH = T.right - PANEL_X;

/** Break only tokens wider than their entire column. Nothing is clipped or ellipsized. */
export function contractPdfWrap(value: string, size: number, font: PDFFont, width: number) {
  const result: string[] = [];
  for (const paragraph of value.replace(/\r/g, "").split("\n")) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (font.widthOfTextAtSize(word, size) > width) {
        if (current) { result.push(current); current = ""; }
        for (const letter of word) {
          if (current && font.widthOfTextAtSize(current + letter, size) > width) { result.push(current); current = ""; }
          current += letter;
        }
      } else if (current && font.widthOfTextAtSize(`${current} ${word}`, size) > width) {
        result.push(current); current = word;
      } else current = current ? `${current} ${word}` : word;
    }
    result.push(current);
  }
  return result;
}

/** The QR is for the regular rent plus advances, never for a deposit or a prorated first month. */
export function contractPaymentPayload(input: Pick<ContractInput, "account" | "variableSymbol" | "rentCents" | "services">) {
  const account = input.account.replace(/\s/g, "").toUpperCase();
  const domestic = /^(?:\d{1,6}-)?\d{1,10}\/\d{4}$/.test(account);
  const parts = domestic ? account.split("/") : [];
  const normalized = domestic
    ? { accountNumber: parts[0], bankCode: parts[1], currency: "CZK" }
    : { iban: account, currency: "CZK" };
  return rentPaymentPayload(normalized, input.variableSymbol, input.rentCents + input.services.reduce((sum, item) => sum + item.amountCents, 0), "CZK");
}

function money(cents: number) {
  return new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100) + " Kč";
}
function disposition(value: string) {
  const known: Record<string, string> = { STUDIO: "Garsoniéra", ONE_KK: "1+kk", ONE_ONE: "1+1", TWO_KK: "2+kk", TWO_ONE: "2+1", THREE_KK: "3+kk", THREE_ONE: "3+1", FOUR_KK: "4+kk", FOUR_ONE: "4+1", FIVE_KK: "5+kk", FIVE_ONE: "5+1" };
  return known[value] || value;
}

export function roundedPdfBox(page: PDFPage, x: number, top: number, width: number, height: number, radius: number, fill: Color, stroke?: Color) {
  const r = Math.min(radius, height / 2, width / 2);
  page.drawSvgPath(`M ${r} 0 H ${width - r} Q ${width} 0 ${width} ${r} V ${height - r} Q ${width} ${height} ${width - r} ${height} H ${r} Q 0 ${height} 0 ${height - r} V ${r} Q 0 0 ${r} 0 Z`, {
    x, y: T.height - top, color: fill, borderColor: stroke, borderWidth: stroke ? .65 : 0,
  });
}

/** Flow the approved E cover. A long but valid overview may continue onto further A4 pages. */
export async function drawContractCover(pdf: PDFDocument, contract: ReturnType<typeof buildContract>, fonts: ContractPdfFonts) {
  const d = contract.input;
  let page = pdf.addPage([T.width, T.height]), y = 122;
  const coverPages: PDFPage[] = [page];
  const text = (value: string, x: number, top: number, size = 9.2, font = fonts.regular, color: Color = T.ink) => {
    page.drawText(value, { x, y: T.height - top - size, size, font, color });
  };
  const rightText = (value: string, x: number, top: number, size = 9.2, font = fonts.regular, color: Color = T.ink) => text(value, x - font.widthOfTextAtSize(value, size), top, size, font, color);
  const rule = (x: number, top: number, width: number) => page.drawLine({ start: { x, y: T.height - top }, end: { x: x + width, y: T.height - top }, color: T.line, thickness: .65 });
  const makeLines = (value: string, width: number, size = 9, font = fonts.regular, color = T.ink, leading = 12.2): Line[] =>
    contractPdfWrap(value, size, font, width).map(value => ({ value, size, font, color, height: leading }));
  const labelLines = (value: string, width: number) => makeLines(value.toLocaleUpperCase("cs-CZ"), width, 7.7, fonts.semibold, T.muted, 16);
  const space = (height: number): Line => ({ value: "", size: 1, font: fonts.regular, color: T.ink, height });
  const lineHeight = (lines: Line[]) => lines.reduce((total, line) => total + line.height, 0);
  const paintLines = (lines: Line[], x: number, top: number, alignRight = false, width = 0) => {
    for (const line of lines) {
      if (alignRight) rightText(line.value, x + width, top, line.size, line.font, line.color);
      else text(line.value, x, top, line.size, line.font, line.color);
      top += line.height;
    }
    return top;
  };
  const newPage = () => {
    page = pdf.addPage([T.width, T.height]); coverPages.push(page);
    text("Úvodní přehled · pokračování", T.left, 64, 15, fonts.semibold);
    y = 95;
  };
  const ensure = (height: number) => { if (y + height > T.bottom && y > 96) newPage(); };

  // Equal columns can split independently, preserving every line of lengthy identities.
  const columns = (left: Line[], right: Line[], opts: { x?: number; secondX: number; gapAfter?: number; box?: boolean; divider?: boolean }) => {
    const box = Boolean(opts.box), pad = box ? 13 : 0, leftX = opts.x ?? T.left;
    let a = [...left], b = [...right];
    const full = Math.max(lineHeight(a), lineHeight(b)) + pad * 2;
    if (full <= T.bottom - 95) ensure(full);
    while (a.length || b.length) {
      const minimum = Math.min(50, Math.max(lineHeight(a), lineHeight(b))) + pad * 2;
      if (T.bottom - y < minimum) newPage();
      const available = T.bottom - y - pad * 2;
      const take = (lines: Line[]) => {
        const out: Line[] = []; let height = 0;
        while (lines.length && height + lines[0].height <= available) { const line = lines.shift()!; out.push(line); height += line.height; }
        return out;
      };
      const ca = take(a), cb = take(b), height = Math.max(lineHeight(ca), lineHeight(cb)) + pad * 2;
      if (box) roundedPdfBox(page, T.left, y, WIDTH, height, 8, T.white, T.line);
      if (opts.divider) page.drawLine({ start: { x: opts.secondX - 15, y: T.height - y - 13 }, end: { x: opts.secondX - 15, y: T.height - y - height + 13 }, color: T.line, thickness: .65 });
      paintLines(ca, leftX + pad, y + pad); paintLines(cb, opts.secondX, y + pad);
      y += height;
      if (a.length || b.length) newPage();
    }
    y += opts.gapAfter ?? 16;
  };

  const paragraph = (value: string, x = T.left, width = WIDTH, size = 8.8, color = T.ink, gap = 10, font = fonts.regular) => {
    const lines = makeLines(value, width, size, font, color);
    if (lineHeight(lines) < T.bottom - 95) ensure(lineHeight(lines));
    for (const line of lines) { ensure(line.height); paintLines([line], x, y); y += line.height; }
    y += gap;
  };
  text("Nájemní smlouva k bytu", T.left, 57, 24, fonts.semibold);
  text("Smlouva podle § 2235 a násl. zákona č. 89/2012 Sb., občanského zákoníku.", T.left, 88, 8.5, fonts.regular, T.muted);
  text("Úvodní přehled je nedílnou součástí smlouvy.", T.left, 101, 8.5, fonts.regular, T.muted);

  const propertyWidth = 313;
  const asset = [
    ...labelLines("Předmět nájmu", propertyWidth),
    ...makeLines(d.unit.address, propertyWidth, 12.3, fonts.semibold, T.ink, 18),
    ...makeLines(`${d.unit.label} · ${disposition(d.unit.disposition)} · ${String(d.unit.areaM2).replace(".", ",")} m² · ${d.unit.floor}`, propertyWidth, 8.8, fonts.regular, T.ink, 14),
    ...makeLines(`Katastrální údaj: ${d.unit.cadastral} · příslušenství: ${d.unit.accessories}`, propertyWidth, 8.4, fonts.regular, T.muted, 12),
  ];
  const term = [
    ...labelLines("Doba nájmu", 149),
    ...makeLines(d.term === "INDEFINITE" ? "Na dobu neurčitou" : "Na dobu určitou", 149, 10, fonts.semibold, T.ink, 18),
    ...makeLines(`od ${formatDate(d.startDate)}${d.term === "INDEFINITE" ? "" : ` do ${formatDate(d.endDate)} včetně`}`, 149, 9.2, fonts.regular, T.ink, 14),
    ...makeLines(`Předání ${formatDate(d.handoverDate)}`, 149, 8.8, fonts.regular, T.muted, 12),
  ];
  columns(asset, term, { secondX: 395, box: true, divider: true, gapAfter: 17 });

  const half = 248;
  const landlord = [
    ...labelLines("Pronajímatel", half),
    ...makeLines(d.landlord.name, half, 10.5, fonts.semibold, T.ink, 15),
    ...makeLines(d.landlord.type === "COMPANY" ? `IČO ${d.landlord.identifier}` : `Narozen/a ${formatDate(d.landlord.identifier)}`, half),
    ...makeLines(`${d.landlord.type === "COMPANY" ? "Sídlo" : "Bydliště"}: ${d.landlord.address}`, half),
    ...makeLines(`Podepisuje: ${d.landlord.signer}; ${d.landlord.authority}`, half),
  ];
  const tenants: Line[] = labelLines(d.tenancy === "SPOUSES" ? "Nájemci – manželé" : d.tenants.length > 1 ? "Společní nájemci" : "Nájemce", half);
  for (const [index, tenant] of d.tenants.entries()) {
    if (index) tenants.push(space(10));
    tenants.push(...makeLines(tenant.name, half, 10, fonts.semibold, T.ink, 15), ...makeLines(`Narozen/a ${formatDate(tenant.birthDate)}`, half));
    if (tenant.address === tenant.deliveryAddress) tenants.push(...makeLines(`Bydliště i doručování: ${tenant.address}`, half));
    else tenants.push(...makeLines(`Bydliště: ${tenant.address}`, half), ...makeLines(`Doručování: ${tenant.deliveryAddress}`, half));
    tenants.push(...makeLines(`${tenant.email || "E-mail neuveden"} · ${tenant.phone || "telefon neuveden"}`, half, 8.7));
  }
  columns(landlord, tenants, { secondX: 306, gapAfter: 9 });
  ensure(30); rule(T.left, y, WIDTH); y += 9;
  text("SPRÁVCE", T.left, y, 7.7, fonts.semibold, T.muted);
  const manager = d.manager.name ? `${d.manager.name} · ${d.manager.email || "e-mail neuveden"} · ${d.manager.phone || "telefon neuveden"}` : "Provozní komunikaci zajišťuje pronajímatel.";
  paragraph(manager, 98, T.right - 98, 8.8, T.ink, 15);

  // A measured table and companion card share a top edge; longer tables continue at legible sizes.
  const row = (values: string[], widths: number[], opts: { bold?: boolean; size?: number; gap?: number } = {}): TableRow => {
    const cells = values.map((v, index) => makeLines(v, widths[index], opts.size ?? 8.9, opts.bold ? fonts.semibold : fonts.regular, T.ink, 12));
    return { values, cells, height: Math.max(...cells.map(lineHeight)) + (opts.gap ?? 4), options: opts };
  };
  const tableWithCard = (title: string, rows: TableRow[], widths: number[], cardHeight: number, paintCard: (top: number) => void, options: { count?: string; headers?: string[]; total?: string[] } = {}) => {
    const headingHeight = options.headers ? 43 : 29;
    const allHeight = Math.max(headingHeight + rows.reduce((sum, row) => sum + row.height, 0) + (options.total ? 30 : 0), cardHeight);
    if (allHeight <= T.bottom - 95) ensure(allHeight);
    else ensure(Math.max(cardHeight, headingHeight + (rows[0]?.height ?? 20)));
    let start = y, paintedCard = false, currentWidths = widths, tableWidth = LEFT_WIDTH;
    const continuePage = () => {
      newPage(); start = y; paintedCard = false;
      // A continuation has no companion card, so use the available page width.
      tableWidth = WIDTH;
      currentWidths = widths.length === 2 ? [WIDTH - 100, 92] : [WIDTH - 190, 77, 97];
    };
    const heading = (continued: boolean) => {
      text(continued ? `${title} · pokračování` : title, T.left, y, 10.8, fonts.semibold);
      if (options.count && !continued) rightText(options.count, 322, y + 1, 8, fonts.medium, T.muted);
      rule(T.left, y + 20, tableWidth); y += 29;
      if (options.headers) {
        let x = T.left;
        options.headers.forEach((header, index) => { if (index === options.headers!.length - 1) rightText(header, T.left + tableWidth, y, 7.4, fonts.medium, T.muted); else text(header, x, y, 7.4, fonts.medium, T.muted); x += currentWidths[index] + 8; });
        y += 14;
      }
    };
    heading(false);
    paintCard(start); paintedCard = true;
    for (const sourceRow of rows) {
      let current = row(sourceRow.values, currentWidths, sourceRow.options);
      if (y + current.height > T.bottom) {
        continuePage(); heading(true);
        current = row(sourceRow.values, currentWidths, sourceRow.options);
      }
      // Every schema-permitted single row fits a page. Split exceptional lines instead of clipping.
      const remaining = current.cells.map(cell => [...cell]);
      while (remaining.some(cell => cell.length)) {
        const available = T.bottom - y - 4;
        const chunks = remaining.map(cell => {
          const lines: Line[] = []; let taken = 0;
          while (cell.length && taken + cell[0].height <= available) { const line = cell.shift()!; lines.push(line); taken += line.height; }
          return lines;
        });
        let x = T.left;
        chunks.forEach((lines, index) => { paintLines(lines, x, y, index === chunks.length - 1, currentWidths[index]); x += currentWidths[index] + 8; });
        y += Math.max(...chunks.map(lineHeight)) + (current.options.gap ?? 4);
        if (remaining.some(cell => cell.length)) { continuePage(); heading(true); }
      }
    }
    if (options.total) {
      if (y + 30 > T.bottom) { continuePage(); heading(true); }
      rule(T.left, y + 3, tableWidth); y += 12;
      text(options.total[0], T.left, y, 9, fonts.medium); rightText(options.total[1], T.left + tableWidth, y, 9.2, fonts.semibold); y += 18;
    }
    y = Math.max(y, paintedCard ? start + cardHeight : y) + 11;
  };

  const serviceSum = d.services.reduce((sum, service) => sum + service.amountCents, 0), monthly = d.rentCents + serviceSum;
  const paymentPayload = contractPaymentPayload(d);
  let paymentQr: PDFImage | null = null;
  if (paymentPayload) {
    const qr = qrcode(0, "M"); qr.addData(paymentPayload); qr.make();
    const bytes = await sharp(Buffer.from(qr.createDataURL(6, 24).split(",")[1], "base64")).png().toBuffer();
    paymentQr = await pdf.embedPng(bytes);
  }
  const account = /^[A-Z]{2}\d{2}/i.test(d.account.replace(/\s/g, "")) ? d.account.replace(/\s/g, "").toUpperCase().replace(/(.{4})/g, "$1 ").trim() : d.account;
  const accountWidth = paymentQr ? 108 : PANEL_WIDTH - 30;
  const accountLines = makeLines(account, accountWidth, 9.1, fonts.semibold, T.ink, 12);
  const accountHeight = lineHeight(accountLines), paymentHeight = Math.max(203, 120 + accountHeight + 47);
  const services = [
    row(["Čisté nájemné", money(d.rentCents)], [190, 86], { bold: true, size: 9.2, gap: 12 }),
    row(["ZÁLOHY NA SLUŽBY", ""], [190, 86], { size: 7.7, gap: 5 }),
    ...(d.services.length ? d.services.map(service => row([service.name, money(service.amountCents)], [190, 86])) : [row(["Služby hrazené zálohami nejsou sjednány.", money(0)], [190, 86])]),
  ];
  tableWithCard("Rozpis měsíční platby", services, [190, 86], paymentHeight, top => {
    roundedPdfBox(page, PANEL_X, top, PANEL_WIDTH, paymentHeight, 9, T.soft);
    text("PRAVIDELNÁ MĚSÍČNÍ PLATBA", PANEL_X + 15, top + 13, 7.7, fonts.semibold, T.muted);
    const amount = money(monthly), size = Math.min(25, (PANEL_WIDTH - 30) / fonts.semibold.widthOfTextAtSize(amount, 1));
    text(amount, PANEL_X + 15, top + 31, size, fonts.semibold, T.blue);
    text(`Splatnost do ${d.dueDay}. dne daného měsíce`, PANEL_X + 15, top + 70, 8.6, fonts.medium);
    rule(PANEL_X + 15, top + 87, PANEL_WIDTH - 30);
    text("ÚČET", PANEL_X + 15, top + 99, 7.7, fonts.semibold, T.muted);
    paintLines(accountLines, PANEL_X + 15, top + 115);
    text("VARIABILNÍ SYMBOL", PANEL_X + 15, top + 123 + accountHeight, 7.7, fonts.semibold, T.muted);
    text(d.variableSymbol, PANEL_X + 15, top + 139 + accountHeight, 9.5, fonts.semibold);
    if (paymentQr) {
      roundedPdfBox(page, T.right - 87, top + 99, 78, 78, 3, T.white);
      page.drawImage(paymentQr, { x: T.right - 86, y: T.height - top - 100 - 76, width: 76, height: 76 });
      rightText("QR · nájem + služby", T.right - 9, top + 181, 7.6, fonts.medium);
    } else {
      text("QR není k dispozici – ověřte účet.", PANEL_X + 15, top + paymentHeight - 18, 7.8, fonts.medium, T.muted);
    }
  }, { count: "Kč / měsíc", total: ["Zálohy celkem", money(serviceSum)] });
  paragraph(`První platba: ${formatDate(d.firstPaymentDate)}, nejdříve při uzavření smlouvy.`, T.left, WIDTH, 8.8, T.ink, 11);

  // Residents are explicit records, not inferred from contracting parties or from their count.
  const residents: Array<{ name: string; birthDate?: string; role?: string }> = "occupants" in d && Array.isArray(d.occupants) ? d.occupants : [];
  const people = residents.length
    ? residents.map(person => row([person.name, person.birthDate ? formatDate(person.birthDate) : "Neuvedeno", person.role || "Neuvedeno"], [106, 73, 89], { size: 8.8 }))
    : [row(["Jmenný seznam osob pro rozúčtování není uveden.", "", ""], [268, 0, 0])];
  const count = `${d.occupantCount} ${d.occupantCount === 1 ? "osoba" : d.occupantCount < 5 ? "osoby" : "osob"}`;
  const interest = (d.depositAnnualRateBps / 100).toLocaleString("cs-CZ");
  tableWithCard("Osoby pro rozúčtování", people, residents.length ? [106, 73, 89] : [268, 0, 0], 81, top => {
    roundedPdfBox(page, PANEL_X, top, PANEL_WIDTH, 81, 8, T.neutral);
    text("JISTOTA · SAMOSTATNÁ ÚHRADA", PANEL_X + 15, top + 11, 7.7, fonts.semibold, T.muted);
    if (d.depositCents) {
      text(money(d.depositCents), PANEL_X + 15, top + 30, 16, fonts.semibold);
      text(`Do ${formatDate(d.depositDueDate)} · ${interest} % ročně`, PANEL_X + 15, top + 53, 8.8);
      text("Zákonné minimum úroku: článek 5.3", PANEL_X + 15, top + 67, 8.2, fonts.regular, T.muted);
    } else text("Jistota se nesjednává.", PANEL_X + 15, top + 37, 10.5, fonts.semibold);
  }, { count, ...(residents.length ? { headers: ["Jméno", "Datum narození", "Vztah"] } : {}) });
  if (residents.length && residents.length !== d.occupantCount) paragraph(`Jmenný seznam obsahuje ${residents.length} z evidovaných ${d.occupantCount} osob. Seznam není úplný.`, T.left, WIDTH, 8.6, T.muted, 10);

  const conditions: Array<[string, string]> = [
    ["Výpověď nájemce", "Bez důvodu s tříměsíční výpovědní dobou."],
    ...(d.term !== "INDEFINITE" ? [["Prodloužení", "Pouze podepsaným dodatkem; obnovení podle § 2285 se vylučuje."] as [string, string]] : []),
    ["Změna nájemného", contract.cover.find(([label]) => label === "Změna nájemného")![1]],
    ["Energie", `Energie přímo na nájemce: ${d.directEnergy}.`],
    ["Pojištění", "Pojištění odpovědnosti včetně škod na pronajatém bytě a třetím osobám je povinné."],
  ];
  const conditionHeight = 29 + conditions.reduce((sum, [name, value]) => sum + Math.max(lineHeight(makeLines(name, 97, 8.4)), lineHeight(makeLines(value, WIDTH - 105, 8.5))) + 4, 0);
  if (conditionHeight <= T.bottom - 95) ensure(conditionHeight);
  text("Další podmínky", T.left, y, 10.8, fonts.semibold); rule(T.left, y + 20, WIDTH); y += 29;
  for (const [name, value] of conditions) columns(makeLines(name, 97, 8.4, fonts.semibold, T.muted), makeLines(value, WIDTH - 105, 8.5), { secondX: T.left + 105, gapAfter: 4 });
  return coverPages;
}
