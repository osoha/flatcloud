import {PDFDocument} from "pdf-lib";
import {officialDocument} from "./official-document-pdf";

/** Generated once at publication. Downloads and email return the archived bytes. */
export async function bankAccountNoticePdf(title: string, body: string, reference: string) {
  const pdf = await PDFDocument.create();
  const document = await officialDocument(pdf,{title,reference,category:"Oficiální oznámení"});
  document.text(body,10.5);
  document.text("Dokument lze uložit a vytisknout pro doručení mimo portál.",8,false,true);
  document.finish();
  return Buffer.from(await pdf.save());
}
