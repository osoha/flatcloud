import { PDFDocument } from "pdf-lib";
import { officialDocument } from "../official-document-pdf";
import { actionKind, actionMeanings, packetStatus } from "./core";
import { packetFile, signatureImage, type accessiblePacket } from "./service";
export async function actionEvidencePdf(
  packet: NonNullable<Awaited<ReturnType<typeof accessiblePacket>>>,
) {
  const pdf = packet.document
    ? await PDFDocument.load(await packetFile(packet))
    : await PDFDocument.create();
  const document = await officialDocument(pdf, {title: packet.title, reference: packet.id, category: "Záznam podpisů a potvrzení"});
  const {text} = document;
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
    document.ensure(180);
    text(r.expectedName, 12, true);
    text(
      `Otevřeno: ${time(r.openedAt)}\n${packet.kind === "SIGN" ? "Podepsáno" : "Potvrzeno"}: ${time(r.completedAt)}${r.completedByName ? `\nÚčet: ${r.completedByName} · ${r.completedByEmail}` : ""}${r.signerAuthority ? `\nOprávnění: ${r.signerAuthority}` : ""}`,
      9,
    );
    if (r.signatureEncrypted) {
      await document.signature(signatureImage(r.signatureEncrypted));
    }
    if (r.evidenceHash) text(`SHA-256 záznamu: ${r.evidenceHash}`, 7);
  }
  document.finish();
  pdf.setTitle(packet.title);
  pdf.setAuthor("FlatBerry");
  return pdf.save();
}
