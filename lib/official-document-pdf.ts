import {readFile} from "node:fs/promises";
import path from "node:path";
import {PDFDocument, type PDFFont, rgb} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {communicationDesign} from "./communication-design";

const color = (hex: string) => rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255);
const ink = color(communicationDesign.ink), muted = color(communicationDesign.muted), line = color(communicationDesign.line);
const width = 595.28, height = 841.89, margin = 38, contentWidth = width - margin * 2;

/** Adds branded pages; existing document pages and published snapshots are not restyled. */
export async function officialDocument(pdf: PDFDocument, options: {title: string; category: string; reference: string}) {
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await readFile(path.join(process.cwd(),"public/fonts/Inter-Regular.ttf")));
  const bold = await pdf.embedFont(await readFile(path.join(process.cwd(),"public/fonts/Inter-SemiBold.ttf")));
  const logo = await pdf.embedPng(await readFile(path.join(process.cwd(),"public",communicationDesign.logo.slice(1))));
  const firstPage = pdf.getPageCount();
  let page = pdf.addPage([width,height]), y = height-76;
  function header() {
    const logoHeight = 100 * logo.height / logo.width;
    page.drawImage(logo,{x:margin,y:height-44,width:100,height:logoHeight});
    const label = options.category.toLocaleUpperCase("cs-CZ");
    const size = Math.min(7.4, (contentWidth-125) / Math.max(1,font.widthOfTextAtSize(label,1)));
    page.drawText(label,{x:width-margin-font.widthOfTextAtSize(label,size),y:height-35,size,font,color:muted});
  }
  const newPage = () => {page=pdf.addPage([width,height]);y=height-76;header();};
  header();
  const ensure = (space: number) => {if(y-space<55)newPage();};
  function wrap(value: string, selected: PDFFont, size: number) {
    const lines: string[] = [];
    for (const paragraph of value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,"").replace(/\r\n?/g,"\n").split("\n")) {
      let current = "";
      for (const word of paragraph.split(/\s+/)) {
        const candidate = current ? `${current} ${word}` : word;
        if (current && selected.widthOfTextAtSize(candidate,size)>contentWidth) {lines.push(current);current="";}
        if (selected.widthOfTextAtSize(word,size)>contentWidth) {
          for(const char of word) {if(selected.widthOfTextAtSize(current+char,size)>contentWidth){lines.push(current);current="";}current+=char;}
        } else current = current ? `${current} ${word}` : word;
      }
      lines.push(current);
    }
    return lines;
  }
  function text(value: string, size = 10, strong = false, subdued = false) {
    const selected = strong ? bold : font;
    for(const valueLine of wrap(value,selected,size)) {
      ensure(size*1.5);
      page.drawText(valueLine,{x:margin,y,size,font:selected,color:subdued?muted:ink});
      y-=size*1.5;
    }
    y-=8;
  }
  text(options.title,24,true);
  text(`Číslo oznámení / záznamu: ${options.reference}`,8.2,false,true);
  page.drawLine({start:{x:margin,y:y+2},end:{x:width-margin,y:y+2},thickness:.6,color:line});
  y-=16;
  return {
    text, ensure,
    async signature(bytes: Uint8Array) {
      const image = await pdf.embedPng(bytes), scale = Math.min(180/image.width,55/image.height);
      const w = image.width*scale, h = image.height*scale;
      ensure(h+18);page.drawImage(image,{x:margin,y:y-h,width:w,height:h});y-=h+18;
    },
    finish() {
      const pages = pdf.getPages().slice(firstPage);
      pages.forEach((p,i)=>{
        p.drawLine({start:{x:margin,y:32},end:{x:width-margin,y:32},thickness:.5,color:line});
        p.drawText("FlatBerry · "+options.category,{x:margin,y:18,size:7,font,color:muted});
        const number=`${i+1}/${pages.length}`;
        p.drawText(number,{x:width-margin-font.widthOfTextAtSize(number,7),y:18,size:7,font,color:muted});
      });
      pdf.setTitle(options.title);pdf.setAuthor("FlatBerry");
    },
  };
}
