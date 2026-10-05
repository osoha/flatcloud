import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { actionKind, actionMeanings, packetStatus } from "./core";
import { packetFile, signatureImage, type accessiblePacket } from "./service";
export async function actionEvidencePdf(
  packet: NonNullable<Awaited<ReturnType<typeof accessiblePacket>>>,
) {
  const pdf = packet.document
    ? await PDFDocument.load(await packetFile(packet))
    : await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(
      await readFile(
        path.join(process.cwd(), "public/fonts/Raleway-Regular.ttf"),
      ),
    ),
    bold = await pdf.embedFont(
      await readFile(path.join(process.cwd(), "public/fonts/Raleway-Bold.ttf")),
    );
  let page = pdf.addPage([595.28, 841.89]),
    y = 786;
  const newPage = () => {
    page = pdf.addPage([595.28, 841.89]);
    y = 786;
  };
  function text(value: string, size = 10, strong = false) {
    const f = strong ? bold : font;
    for (const p of value.split("\n")) {
      let line = "";
      for (const word of p.split(/\s+/)) {
        for (const ch of (line ? " " : "") + word) {
          if (f.widthOfTextAtSize(line + ch, size) > 499) {
            if (y < 58) newPage();
            page.drawText(line, {
              x: 48,
              y,
              size,
              font: f,
              color: rgb(0.12, 0.19, 0.24),
            });
            y -= size + 5;
            line = "";
          }
          line += ch;
        }
      }
      if (y < 58) newPage();
      page.drawText(line, {
        x: 48,
        y,
        size,
        font: f,
        color: rgb(0.12, 0.19, 0.24),
      });
      y -= size + 5;
    }
    y -= 6;
  }
  text(packet.title, 18, true);
  text("Záznam podpisů a potvrzení · FlatBerry", 11, true);
  text(packetStatus(packet));
  text(
    `ID: ${packet.id}\nSHA-256 obsahu: ${packet.contentHash}\nPůvodní PDF: ${packet.sourceFileHash || "sdělení bez přílohy"}`,
    8,
  );
  text(packet.body);
  text(actionMeanings[actionKind(packet.kind)], 10, true);
  text(
    "Časy eviduje aplikace (Europe/Prague). Nejde o kvalifikované časové razítko ani kvalifikovaný elektronický podpis. Uložení, otevření a výslovné potvrzení jsou různé události.",
    8,
  );
  const time = (d: Date | null) =>
    d
      ? new Intl.DateTimeFormat("cs-CZ", {
          dateStyle: "medium",
          timeStyle: "long",
          timeZone: "Europe/Prague",
        }).format(d)
      : "dosud neprovedeno";
  for (const r of packet.recipients) {
    if (y < 230) newPage();
    text(r.expectedName, 12, true);
    text(
      `Otevřeno: ${time(r.openedAt)}\n${packet.kind === "SIGN" ? "Podepsáno" : "Potvrzeno"}: ${time(r.completedAt)}${r.completedByName ? `\nÚčet: ${r.completedByName} · ${r.completedByEmail}` : ""}${r.signerAuthority ? `\nOprávnění: ${r.signerAuthority}` : ""}`,
      9,
    );
    if (r.signatureEncrypted) {
      const image = await pdf.embedPng(signatureImage(r.signatureEncrypted));
      page.drawImage(image, { x: 48, y: y - 55, width: 180, height: 55 });
      y -= 65;
    }
    if (r.evidenceHash) text(`SHA-256 záznamu: ${r.evidenceHash}`, 7);
  }
  pdf.setTitle(packet.title);
  pdf.setAuthor("FlatBerry");
  return pdf.save();
}
