import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import qrcode from "qrcode-generator";
import sharp from "sharp";
import { buildContract } from "./core";

export async function contractPdf(raw:unknown,preview=false,portalUrl?:string) {
  const c=buildContract(raw),pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const font=await pdf.embedFont(await readFile(path.join(process.cwd(),"public/fonts/Raleway-Regular.ttf")));
  const bold=await pdf.embedFont(await readFile(path.join(process.cwd(),"public/fonts/Raleway-Bold.ttf")));
  pdf.setTitle("Nájemní smlouva k bytu");pdf.setAuthor("FlatBerry");pdf.setSubject(`Vzor ${c.version}`);
  const ink=rgb(.10,.16,.23),muted=rgb(.36,.41,.46),line=rgb(.86,.89,.91),accent=rgb(.17,.38,.36);
  const width=595.28,height=841.89,left=44,right=551.28,bottom=58;
  let page=pdf.addPage([width,height]),y=height-76;
  function newPage(){page=pdf.addPage([width,height]);y=height-76;}
  function ensure(space:number){if(y-space<bottom)newPage();}
  function wrap(value:string,size:number,f:PDFFont,max:number){
    const result:string[]=[];
    for(const paragraph of value.split("\n")) {
      let current="";
      for(const word of paragraph.split(/\s+/).filter(Boolean)) {
        if(f.widthOfTextAtSize(word,size)>max){if(current){result.push(current);current="";}let chunk="";for(const ch of word){if(f.widthOfTextAtSize(chunk+ch,size)>max){result.push(chunk);chunk="";}chunk+=ch;}current=chunk;continue;}
        if(current&&f.widthOfTextAtSize(current+" "+word,size)>max){result.push(current);current=word;}else current=current?current+" "+word:word;
      }
      result.push(current);
    }
    return result;
  }
  function paragraph(value:string,size=9.5,f=font,gap=7){const lines=wrap(value,size,f,right-left);ensure(Math.min(lines.length,3)*(size+4)+gap);for(const t of lines){ensure(size+4);page.drawText(t,{x:left,y,size,font:f,color:ink});y-=size+4;}y-=gap;}
  paragraph("Nájemní smlouva k bytu",22,bold,8);
  paragraph("Smlouva podle § 2235 a násl. zákona č. 89/2012 Sb., občanského zákoníku. Úvodní přehled je nedílnou součástí smlouvy.",9,font,14);
  for(const [label,value] of c.cover){
    const labelLines=wrap(label,8.4,bold,116),remaining=wrap(value,8.7,font,right-left-132);
    while(remaining.length){
      ensure(Math.max(labelLines.length,3)*12+21);
      const count=Math.max(labelLines.length,Math.floor((y-bottom-21)/12)),valueLines=remaining.splice(0,count),rowHeight=Math.max(labelLines.length*12,valueLines.length*12)+13;
      page.drawRectangle({x:left,y:y-rowHeight+8,width:right-left,height:rowHeight,color:rgb(.97,.98,.98)});
      labelLines.forEach((t,i)=>page.drawText(t,{x:left+8,y:y-i*12-3,size:8.4,font:bold,color:accent}));
      valueLines.forEach((t,i)=>page.drawText(t,{x:left+132,y:y-i*12-3,size:8.7,font,color:ink}));
      y-=rowHeight;page.drawLine({start:{x:left,y:y+8},end:{x:right,y:y+8},thickness:.4,color:line});
      if(remaining.length)newPage();
    }
  }
  newPage();
  for(const section of c.sections){ensure(70);paragraph(section.title,13,bold,9);for(const p of section.paragraphs)for(const sub of p.split("\n\n"))paragraph(sub);y-=4;}
  const columnWidth=(right-left-26)/2;
  let qrImage:Awaited<ReturnType<typeof pdf.embedPng>>|null=null,qrPlaced=false;
  if(portalUrl){const qr=qrcode(0,"M");qr.addData(portalUrl);qr.make();const png=await sharp(Buffer.from(qr.createDataURL(6,6).split(",")[1],"base64")).png().toBuffer();qrImage=await pdf.embedPng(png);}
  function drawPortal(x:number,top:number,w:number,size:number){if(!qrImage)return;page.drawImage(qrImage,{x,y:top-size,width:size,height:size});const lines=wrap("Portál nájemníka\nNaskenujte QR a přihlaste se účtem s přijatou pozvánkou. QR je pouze odkaz a neuděluje přístup k údajům.",8,font,w-size-12);lines.forEach((t,i)=>page.drawText(t,{x:x+size+12,y:top-8-i*11,size:8,font,color:muted}));qrPlaced=true;}
  const signatureRows:Array<{lines:string[];height:number}[]>=[];
  for(let i=0;i<c.signatures.length;i+=2)signatureRows.push(c.signatures.slice(i,i+2).map(s=>{const lines=wrap(`${s.role}: ${s.name}\n${s.detail}`,9.5,font,columnWidth);return {lines,height:lines.length*13+66};}));
  const qrInLastColumn=Boolean(qrImage&&signatureRows.at(-1)?.length===1);
  const allHeight=signatureRows.reduce((s,row,i)=>s+Math.max(...row.map(v=>v.height),qrInLastColumn&&i===signatureRows.length-1?110:0),0)+42+(qrImage&&!qrInLastColumn?114:0);
  if(allHeight<height-76-bottom)ensure(allHeight);else ensure(100);
  paragraph(c.signing,11,bold,18);
  for(const [rowIndex,row]of signatureRows.entries()){const qrHere=qrInLastColumn&&rowIndex===signatureRows.length-1,rowHeight=Math.max(...row.map(v=>v.height),qrHere?110:0);ensure(rowHeight);
    for(const [column,signature]of row.entries()){const x=left+column*(columnWidth+26);let sy=y;for(const t of signature.lines){page.drawText(t,{x,y:sy,size:9.5,font,color:ink});sy-=13;}sy-=30;page.drawLine({start:{x,y:sy},end:{x:x+columnWidth-15,y:sy},color:muted,thickness:.6});page.drawText("Podpis",{x,y:sy-16,size:8,font,color:muted});}
    if(qrHere)drawPortal(left+columnWidth+26,y,columnWidth,72);y-=rowHeight;
  }
  if(qrImage&&!qrPlaced){ensure(114);drawPortal(left,y,right-left,88);y-=114;}
  const pages=pdf.getPages();for(const [i,p]of pages.entries()){
    p.drawText("FlatBerry",{x:left,y:height-36,size:10,font:bold,color:accent});
    p.drawText(preview?"NÁHLED · NEPODEPISOVAT":"Nájemní smlouva k bytu",{x:330,y:height-36,size:8,font:bold,color:preview?rgb(.69,.32,.08):muted});
    p.drawLine({start:{x:left,y:43},end:{x:right,y:43},thickness:.5,color:line});
    p.drawText(`Vzor ${c.version}`,{x:left,y:28,size:7,font,color:muted});p.drawText(`${i+1} / ${pages.length}`,{x:right-32,y:28,size:8,font,color:muted});
  }
  return pdf.save();
}
