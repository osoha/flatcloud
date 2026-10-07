import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

/** Generated once at publication. Downloads always return the archived bytes. */
export async function bankAccountNoticePdf(title: string, body: string, reference: string) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await readFile(path.join(process.cwd(), "public/fonts/Inter-Regular.ttf")));
  const bold = await pdf.embedFont(await readFile(path.join(process.cwd(), "public/fonts/Inter-SemiBold.ttf")));
  const logo = await pdf.embedPng(await readFile(path.join(process.cwd(), "public/flatberry-document-logo.png")));
  let page = pdf.addPage([595.28,841.89]), y = 740;
  const addPage = () => { page = pdf.addPage([595.28,841.89]); y = 777; };
  page.drawImage(logo,{x:42,y:785,width:120,height:32});
  const paragraph = (value: string, size: number, strong = false) => {
    const selected = strong ? bold : font;
    let line = "";
    const flush = () => { if(y<65)addPage();page.drawText(line,{x:42,y,size,font:selected,color:rgb(.08,.14,.24)});y-=size*1.5;line=""; };
    for(const char of value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,"")) {
      if(char==="\n"){flush();continue;}
      if(selected.widthOfTextAtSize(line+char,size)>505)flush();
      line+=char;
    }
    if(line)flush();y-=10;
  };
  paragraph(title,18,true);
  paragraph(body,10.5);
  paragraph(`Evidence FlatBerry: ${reference}\nDokument lze uložit a vytisknout pro doručení mimo portál.`,8);
  const pages=pdf.getPages();
  pages.forEach((p,i)=>p.drawText(`${i+1} / ${pages.length}`,{x:520,y:30,size:8,font,color:rgb(.4,.45,.5)}));
  return Buffer.from(await pdf.save());
}
