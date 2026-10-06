import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { date } from "./format";
import { periodLabel } from "./period";

export type ReceiptSnapshot = {
  issuerName: string; issuerAddress: string; tenantName: string; tenantAddress: string;
  location: string; period: string; currency: string; amountCents: number;
  items: Array<{ name: string; amountCents: number }>;
  payments: Array<{ id: string; amountCents: number; bookedAt: string }>;
  signatureHash: string; stampHash?: string | null; issuerOwnerId?: string;
  representativeId?: string | null; signerName?: string; signerRole?: string | null;
  profileRevision?: number; requestedById?: string; issuanceMode?: string;
};

/** Renders a newly issued receipt. Archived pdfData must never be regenerated on download. */
export async function receiptPdf(snapshot: ReceiptSnapshot, signature: Uint8Array, id: string, issuedAt: Date, stamp?: Uint8Array | null) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [regularBytes, mediumBytes, semiboldBytes, logoBytes] = await Promise.all([
    readFile(path.join(process.cwd(), "public/fonts/Inter-Regular.ttf")),
    readFile(path.join(process.cwd(), "public/fonts/Inter-Medium.ttf")),
    readFile(path.join(process.cwd(), "public/fonts/Inter-SemiBold.ttf")),
    readFile(path.join(process.cwd(), "public/flatberry-document-logo.png")),
  ]);
  // Fontkit subsetting corrupts glyphs in these static Inter assets; embed complete fonts.
  const [regular, medium, semibold, logo, signatureImage, stampImage] = await Promise.all([
    pdf.embedFont(regularBytes), pdf.embedFont(mediumBytes),
    pdf.embedFont(semiboldBytes), pdf.embedPng(logoBytes), pdf.embedPng(signature),
    stamp ? pdf.embedPng(stamp) : Promise.resolve(null),
  ]);
  const ink = rgb(19 / 255, 35 / 255, 62 / 255), blue = rgb(33 / 255, 104 / 255, 245 / 255);
  const muted = rgb(88 / 255, 106 / 255, 131 / 255), line = rgb(220 / 255, 229 / 255, 241 / 255);
  const pale = rgb(237 / 255, 244 / 255, 1), white = rgb(1, 1, 1);
  const width = 595.28, height = 841.89, left = 38, right = width - left, content = right - left;
  const bottom = 787, gap = 18, half = (content - gap) / 2;
  let page!: PDFPage;
  let y = 0;
  const text = (value: string, x: number, top: number, size = 9.2, font = regular, color = ink) => {
    page.drawText(value, { x, y: height - top, size, font, color });
  };
  const rightText = (value: string, x: number, top: number, size = 9.2, font = regular, color = ink) => text(value, x - font.widthOfTextAtSize(value, size), top, size, font, color);
  const rule = (top: number, x = left, length = content) => page.drawLine({ start: { x, y: height - top }, end: { x: x + length, y: height - top }, color: line, thickness: .6 });
  const label = (value: string, x: number, top: number) => text(value.toLocaleUpperCase("cs-CZ"), x, top, 7.8, medium, muted);
  const wrap = (value: string, max: number, size = 9.2, font: PDFFont = regular) => {
    const lines: string[] = [];
    for (const paragraph of value.replace(/[\r\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").split("\n")) {
      let current = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        if (font.widthOfTextAtSize(word, size) > max) {
          if (current) lines.push(current);
          current = "";
          for (const letter of word) {
            if (current && font.widthOfTextAtSize(current + letter, size) > max) { lines.push(current); current = ""; }
            current += letter;
          }
        } else if (current && font.widthOfTextAtSize(`${current} ${word}`, size) > max) {
          lines.push(current); current = word;
        } else current = current ? `${current} ${word}` : word;
      }
      lines.push(current);
    }
    return lines;
  };
  const rounded = (x: number, top: number, w: number, h: number, fill: RGB, border?: RGB) => {
    const r = 8;
    page.drawSvgPath(`M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`,
      { x, y: height - top, color: fill, ...(border ? { borderColor: border, borderWidth: .6 } : {}) });
  };
  const money = (cents: number) => new Intl.NumberFormat("cs-CZ", { style: "currency", currency: snapshot.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
  const period = periodLabel(snapshot.period), periodTitle = period.charAt(0).toLocaleUpperCase("cs-CZ") + period.slice(1);
  const newPage = () => {
    page = pdf.addPage([width, height]);
    page.drawImage(logo, { x: left, y: height - 44, width: 100, height: 100 * logo.height / logo.width });
    rightText("POTVRZENÍ PŘIJATÉ ÚHRADY", right, 36, 7.4, medium, muted);
    text("Doklad o zaplacení nájmu", left, 76, pdf.getPageCount() === 1 ? 24 : 20, semibold);
    const idLines = wrap(`Číslo dokladu: ${id}`, content, 8.2);
    idLines.forEach((value, i) => text(value, left, 94 + i * 11, 8.2, regular, muted));
    text(`Vystaveno ${date(issuedAt)}${pdf.getPageCount() > 1 ? " · pokračování" : ""}`, left, 107 + (idLines.length - 1) * 11, 8.5, regular, muted);
    y = 122 + (idLines.length - 1) * 11;
  };
  const ensure = (space: number) => { if (y + space > bottom) newPage(); };
  newPage();

  // The location and period are both immutable snapshot data; no current lease lookup is needed.
  const locationLines = wrap(snapshot.location || "—", 315, 11, semibold);
  let locationIndex = 0;
  while (locationIndex < locationLines.length) {
    ensure(78);
    const count = Math.min(locationLines.length - locationIndex, Math.floor((bottom - y - 46) / 15));
    const boxHeight = Math.max(77, 43 + count * 15);
    rounded(left, y, content, boxHeight, white, line);
    label(locationIndex ? "Nemovitost a jednotka · pokračování" : "Nemovitost a jednotka", left + 13, y + 19);
    locationLines.slice(locationIndex, locationIndex + count).forEach((value, i) => text(value, left + 13, y + 39 + i * 15, 11, semibold));
    page.drawLine({ start: { x: 380, y: height - y - 14 }, end: { x: 380, y: height - y - boxHeight + 14 }, color: line, thickness: .6 });
    label("Období nájmu", 395, y + 19);
    text(periodTitle, 395, y + 39, 11.5, semibold);
    locationIndex += count; y += boxHeight + 26;
  }

  type PartyLine = { value: string; name: boolean };
  const partyLines = (name: string, address: string): PartyLine[] => [
    ...wrap(name, half, 10.5, semibold).map(value => ({ value, name: true })),
    ...wrap(address || "—", half, 9.2).map(value => ({ value, name: false })),
  ];
  const parties = [partyLines(snapshot.issuerName, snapshot.issuerAddress), partyLines(snapshot.tenantName, snapshot.tenantAddress)];
  let partyIndex = 0;
  while (partyIndex < Math.max(...parties.map(rows => rows.length))) {
    ensure(64);
    label(partyIndex ? "Vystavitel · pokračování" : "Vystavitel", left, y);
    label(partyIndex ? "Nájemník · pokračování" : "Nájemník", left + half + gap, y);
    const count = Math.min(Math.max(...parties.map(rows => rows.length)) - partyIndex, Math.floor((bottom - y - 30) / 15));
    parties.forEach((rows, column) => rows.slice(partyIndex, partyIndex + count).forEach((row, i) => text(row.value, left + column * (half + gap), y + 19 + i * 15, row.name ? 10.5 : 9.2, row.name ? semibold : regular)));
    partyIndex += count; y += 19 + count * 15 + 17;
  }
  rule(y); y += 22;

  // Keep the amount card beside the item table; long item lists continue with a repeated heading.
  const itemWidth = 284, cardX = 341, cardWidth = right - cardX, itemAmountWidth = 99;
  ensure(141);
  const summaryTop = y;
  rounded(cardX, y, cardWidth, 109, pale);
  label("Přijatá úhrada", cardX + 15, y + 21);
  const total = money(snapshot.amountCents);
  const amountSize = Math.min(23, 23 * (cardWidth - 30) / semibold.widthOfTextAtSize(total, 23));
  text(total, cardX + 15, y + 55, amountSize, semibold, blue);
  text(`Za období ${period}`, cardX + 15, y + 82, 8.9, medium);
  let itemColumn = true;
  const itemHeading = (continued = false) => {
    text(`Rozpis potvrzené částky${continued ? " · pokračování" : ""}`, left, y + 13, 10.8, semibold);
    rule(y + 22, left, itemColumn ? itemWidth : content); y += 44;
  };
  itemHeading();
  for (const item of snapshot.items) {
    let lines = wrap(item.name || "—", (itemColumn ? itemWidth : content) - itemAmountWidth - 8, 9.2);
    let index = 0;
    while (index < lines.length) {
      if (y + 23 > bottom) { newPage(); itemColumn = false; itemHeading(true); }
      const available = Math.max(1, Math.floor((bottom - y - 10) / 13));
      const chunk = lines.slice(index, index + available);
      chunk.forEach((value, i) => text(value, left, y + i * 13, 9.2, index === 0 && i === 0 ? medium : regular));
      if (index === 0) rightText(money(item.amountCents), itemColumn ? left + itemWidth : right, y, 9.2, semibold);
      index += chunk.length; y += chunk.length * 13 + 9;
      if (index < lines.length) { newPage(); itemColumn = false; itemHeading(true); }
    }
  }
  if (y + 36 > bottom) { newPage(); itemColumn = false; itemHeading(true); }
  rule(y + 2, left, itemColumn ? itemWidth : content);
  text("Celkem", left, y + 23, 9.5, semibold);
  rightText(total, itemColumn ? left + itemWidth : right, y + 23, 9.5, semibold);
  y = Math.max(y + 44, itemColumn ? summaryTop + 137 : 0);

  const paymentHeading = (continued = false) => {
    text(`Úhrady přiřazené k tomuto období${continued ? " · pokračování" : ""}`, left, y, 10.8, semibold);
    text("Připsáno na účet", left, y + 25, 8.2, medium, muted);
    text("Určení platby", 192, y + 25, 8.2, medium, muted);
    rightText("Přiřazená částka", right, y + 25, 8.2, medium, muted);
    rule(y + 35); y += 57;
  };
  ensure(88); paymentHeading();
  // Allocation amounts can be smaller than a bank transaction; never label these as total bank receipts.
  const payments = [...snapshot.payments].sort((a, b) => a.bookedAt.localeCompare(b.bookedAt) || a.id.localeCompare(b.id));
  for (const payment of payments) {
    if (y + 25 > bottom) { newPage(); paymentHeading(true); }
    text(date(payment.bookedAt), left, y, 9.5, medium);
    text(`Nájem za ${period}`, 192, y, 9.2);
    rightText(money(payment.amountCents), right, y, 9.5, semibold);
    rule(y + 14); y += 33;
  }
  const explanation = wrap("Doklad potvrzuje přijaté úhrady přiřazené k nájmu za uvedené období.", content, 9.2);
  ensure(explanation.length * 13 + 17);
  explanation.forEach((value, i) => text(value, left, y + i * 13, 9.2));
  y += explanation.length * 13 + 35;

  const signerLines = wrap(snapshot.signerName || snapshot.issuerName, 270, 10.5, semibold);
  const roleLines = snapshot.signerRole ? wrap(snapshot.signerRole, 270, 9.2) : [];
  const signText = [...signerLines.map(value => ({ value, strong: true })), ...roleLines.map(value => ({ value, strong: false }))];
  ensure(104 + Math.min(signText.length, 5) * 15 + 28);
  label("Za vystavitele podepsal/a", left, y);
  const signatureScale = Math.min(170 / signatureImage.width, 54 / signatureImage.height);
  page.drawImage(signatureImage, { x: left, y: height - y - 72, width: signatureImage.width * signatureScale, height: signatureImage.height * signatureScale });
  if (stampImage) {
    label("Razítko", 365, y);
    const scale = Math.min(165 / stampImage.width, 90 / stampImage.height);
    page.drawImage(stampImage, { x: 365, y: height - y - 102, width: stampImage.width * scale, height: stampImage.height * scale });
  }
  y += 96;
  for (const row of signText) {
    ensure(17); text(row.value, left, y, row.strong ? 10.5 : 9.2, row.strong ? semibold : regular); y += 15;
  }
  y += 15;
  ensure(14); text("Vystaveno z uložené evidence plateb v aplikaci FlatBerry.", left, y, 8.5, regular, muted);
  for (const [index, p] of pdf.getPages().entries()) {
    page = p; rule(810);
    text("FlatBerry · Doklad o zaplacení nájmu", left, 825, 6.7, regular, muted);
    rightText(`${index + 1}/${pdf.getPageCount()}`, right, 825, 6.7, regular, muted);
  }
  pdf.setTitle(`Doklad o zaplacení nájmu · ${period}`);
  pdf.setCreator("FlatBerry");
  return pdf.save();
}
