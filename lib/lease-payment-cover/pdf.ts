import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import qrcode from "qrcode-generator";
import { paymentCoverMoney, type PaymentCoverVersion } from "./core";

export type PaymentCoverDocument = { version: PaymentCoverVersion; contractNumber: string | null; tenantNames: string[]; address: string; unitLabel: string; currency: string; account: string; variableSymbol: string; dueDay: number; rentTiming: string; qrPayload: string | null; issuedAt: Date };
const dateLabel = (key: string | Date) => new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague" }).format(typeof key === "string" ? new Date(`${key}T12:00:00Z`) : key);

export async function paymentCoverPdf(data: PaymentCoverDocument) {
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const [regular, medium, bold, logo] = await Promise.all([
    pdf.embedFont(await readFile(path.join(process.cwd(), "public/fonts/Inter-Regular.ttf"))),
    pdf.embedFont(await readFile(path.join(process.cwd(), "public/fonts/Inter-Medium.ttf"))),
    pdf.embedFont(await readFile(path.join(process.cwd(), "public/fonts/Inter-Bold.ttf"))),
    pdf.embedPng(await readFile(path.join(process.cwd(), "public/flatberry-document-logo.png"))),
  ]);
  pdf.setTitle("Platební list k dodatku"); pdf.setAuthor("FlatBerry");
  const ink = rgb(19 / 255, 35 / 255, 62 / 255), muted = rgb(88 / 255, 106 / 255, 131 / 255), blue = rgb(33 / 255, 104 / 255, 245 / 255), soft = rgb(237 / 255, 244 / 255, 255 / 255), line = rgb(220 / 255, 229 / 255, 241 / 255);
  const W = 595.28, H = 841.89, L = 38, R = W - 38, bodyBottom = 760;
  let page = pdf.addPage([W, H]);
  const wrap = (value: string, size: number, font: PDFFont, width: number) => {
    const lines: string[] = []; let current = "";
    for (const word of value.trim().split(/\s+/)) {
      if (font.widthOfTextAtSize(word, size) > width) {
        if (current) lines.push(current); current = "";
        for (const character of word) { if (font.widthOfTextAtSize(current + character, size) > width) { lines.push(current); current = ""; } current += character; }
      } else if (current && font.widthOfTextAtSize(`${current} ${word}`, size) > width) { lines.push(current); current = word; }
      else current = current ? `${current} ${word}` : word;
    }
    if (current) lines.push(current); return lines;
  };
  function text(value: string, x: number, top: number, size = 9.5, font = regular, color = ink) { page.drawText(value, { x, y: H - top, size, font, color }); }
  function block(value: string, x: number, top: number, width: number, size = 9.5, font = regular, color = ink) { const lines = wrap(value, size, font, width); lines.forEach((value, i) => text(value, x, top + i * (size + 4), size, font, color)); return top + lines.length * (size + 4); }
  function rule(top: number, x = L, end = R) { page.drawLine({ start: { x, y: H - top }, end: { x: end, y: H - top }, color: line, thickness: .7 }); }
  function rounded(x: number, top: number, width: number, height: number) {
    const r = 9;
    page.drawSvgPath(`M ${r} 0 H ${width - r} Q ${width} 0 ${width} ${r} V ${height - r} Q ${width} ${height} ${width - r} ${height} H ${r} Q 0 ${height} 0 ${height - r} V ${r} Q 0 0 ${r} 0 Z`, { x, y: H - top, color: soft });
  }
  function header(title = "Platební list k dodatku") {
    page.drawImage(logo, { x: L, y: H - 45, width: 100, height: 100 * logo.height / logo.width });
    text("PLATEBNÍ ÚDAJE", 437, 38, 8, medium, muted);
    text(title, L, 85, 24, bold);
  }
  function continuation(title = "Platební údaje – pokračování") { page = pdf.addPage([W, H]); header(title); return 128; }
  function ensureAt(top: number, height: number, title?: string) { return top + height <= bodyBottom ? top : continuation(title); }
  function flowingBlock(value: string, x: number, top: number, width: number, size = 9.5, font = regular, color = ink) {
    const lines = wrap(value, size, font, width);
    for (const value of lines) { top = ensureAt(top, size + 4); text(value, x, top, size, font, color); top += size + 4; }
    return top;
  }
  header();
  let y = block("Přehled pravidelné měsíční úhrady k nájemní smlouvě.", L, 108, R - L, 9.5, regular, muted) + 14;
  text(data.version.source === "CURRENT" ? "STAV K DATU VYSTAVENÍ" : "PLATEBNÍ VERZE ÚČINNÁ OD", L, y, 8, medium, muted);
  text(dateLabel(data.version.effectiveFrom), L, y + 23, 16, bold, blue);
  text("NÁJEMNÍ SMLOUVA", 340, y, 8, medium, muted);
  const contractBottom = flowingBlock(data.contractNumber || "Bez evidovaného čísla", 340, y + 23, R - 340, 11, medium);
  y = Math.max(y + 48, contractBottom + 12); rule(y);
  y = ensureAt(y + 25, 39); text("NEMOVITOST A JEDNOTKA", L, y, 8, medium, muted);
  y = flowingBlock(`${data.address} · ${data.unitLabel}`, L, y + 19, R - L, 12, medium) + 9;
  y = ensureAt(y, 38);
  text("NÁJEMCE", L, y, 8, medium, muted);
  y = flowingBlock(data.tenantNames.join(" + "), L, y + 19, R - L, 10.5, medium) + 23;
  // Keep the complete amount / account / QR card together, above the footer.
  const financeTop = ensureAt(y, 266, "Rozpis měsíční úhrady");
  rounded(341, financeTop - 14, R - 341, 247);
  text("PRAVIDELNĚ ZA CELÝ MĚSÍC", 355, financeTop + 8, 8, medium, muted);
  const sumText = paymentCoverMoney(data.version.totalCents, data.currency);
  const sumSize = Math.min(23, (R - 367) / bold.widthOfTextAtSize(sumText, 1));
  text(sumText, 355, financeTop + 42, sumSize, bold, blue);
  block(`Splatnost ${data.dueDay}. den ${data.rentTiming === "ARREARS" ? "následujícího" : "daného"} měsíce`, 355, financeTop + 64, R - 369, 9, regular, muted);
  rule(financeTop + 91, 355, R - 14);
  text("ÚČET PRO ÚHRADU", 355, financeTop + 111, 7.7, medium, muted);
  block(data.account, 355, financeTop + 126, R - 369, 9, medium);
  text("VARIABILNÍ SYMBOL", 355, financeTop + 164, 7.7, medium, muted);
  block(data.variableSymbol || "Neuveden", 355, financeTop + 180, 87, 9.5, medium);
  if (data.qrPayload) {
    const qr = qrcode(0, "M"); qr.addData(data.qrPayload); qr.make();
    const quiet = 4, modules = qr.getModuleCount(), size = 72, cell = size / (modules + 2 * quiet), x = R - 86, top = financeTop + 145;
    page.drawRectangle({ x, y: H - top - size, width: size, height: size, color: rgb(1, 1, 1) });
    for (let row = 0; row < modules; row++) for (let col = 0; col < modules; col++) if (qr.isDark(row, col)) page.drawRectangle({ x: x + (col + quiet) * cell, y: H - top - (row + quiet + 1) * cell, width: cell, height: cell, color: ink });
    text("QR · nájem + služby", 444, financeTop + 229, 7, medium, muted);
  } else block(data.version.totalCents === 0 ? "Nulová úhrada · QR není potřeba." : "Pro QR doplňte platný účet v CZK a číselný VS.", 355, financeTop + 208, R - 369, 8, regular, muted);
  text("ROZPIS MĚSÍČNÍ ÚHRADY", L, financeTop + 8, 9, medium);
  rule(financeTop + 21, L, 321);
  let rowY = financeTop + 42;
  const pending = [...data.version.items];
  function itemRow(item: PaymentCoverVersion["items"][number], maxWidth: number) {
    const labelLines = wrap(item.name, 9.5, regular, maxWidth - 104), height = Math.max(23, labelLines.length * 13.5 + 9);
    labelLines.forEach((value, i) => text(value, L, rowY + i * 13.5, 9.5));
    const amount = paymentCoverMoney(item.amountCents, data.currency);
    text(amount, L + maxWidth - medium.widthOfTextAtSize(amount, 9.5), rowY, 9.5, medium);
    rowY += height;
  }
  while (pending.length && rowY + Math.max(23, wrap(pending[0].name, 9.5, regular, 179).length * 13.5 + 9) < 630) itemRow(pending.shift()!, 283);
  if (pending.length) text("Další položky pokračují dále v dokumentu.", L, rowY + 5, 8, regular, muted);
  else if (!data.version.items.length) text("Nájemné i zálohy na služby: 0 Kč.", L, rowY, 9.5);
  y = Math.max(financeTop + 266, Math.min(rowY + 23, 670));
  const explanations = ["Částka zahrnuje pravidelné nájemné a zálohy na služby za celý měsíc. Nezahrnuje jistotu, dluhy ani případnou poměrnou první úhradu.", "Samostatný platební list přiložte před dodatek. Nenahrazuje text dodatku ani jeho podpisy. Účet, variabilní symbol a splatnost odpovídají nastavení smlouvy k datu vystavení."];
  const explanationHeight = 22 + explanations.reduce((sum, value) => sum + wrap(value, 9, regular, R - L).length * 13 + 9, 0);
  y = ensureAt(y, explanationHeight, "Platební informace");
  rule(y); y += 22;
  for (const explanation of explanations) y = flowingBlock(explanation, L, y, R - L, 9, regular, muted) + 9;
  while (pending.length) {
    rowY = continuation("Rozpis měsíční úhrady");
    while (pending.length && rowY + Math.max(23, wrap(pending[0].name, 9.5, regular, R - L - 104).length * 13.5 + 9) < 760) itemRow(pending.shift()!, R - L);
    // A single abnormally long label must not cause an endless pagination loop.
    if (pending.length && rowY === 128) throw new Error("Popis položky je příliš dlouhý pro tiskový přehled.");
  }
  pdf.getPages().forEach((p: PDFPage, index, pages) => {
    p.drawLine({ start: { x: L, y: 40 }, end: { x: R, y: 40 }, color: line, thickness: .7 });
    p.drawText(`FlatBerry · Vystaveno ${dateLabel(data.issuedAt)}`, { x: L, y: 24, size: 7.5, font: regular, color: muted });
    p.drawText(`${index + 1} / ${pages.length}`, { x: R - 25, y: 24, size: 7.5, font: regular, color: muted });
  });
  return pdf.save();
}
