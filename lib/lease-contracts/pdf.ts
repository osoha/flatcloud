import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import qrcode from "qrcode-generator";
import sharp from "sharp";
import { buildContract } from "./core";
import { contractPdfTheme, contractPdfWrap, drawContractCover } from "./cover-pdf";

export async function contractPdf(raw:unknown,preview=false,portalUrl?:string) {
  const c=buildContract(raw),pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const embedded=await Promise.all(["Regular","Medium","SemiBold","Bold"].map(async weight=>pdf.embedFont(await readFile(path.join(process.cwd(),`public/fonts/Inter-${weight}.ttf`)))));
  const [font,medium,bold,strong]=embedded;
  const logo=await pdf.embedPng(await readFile(path.join(process.cwd(),"public/flatberry-document-logo.png")));
  pdf.setTitle("Nájemní smlouva k bytu");pdf.setAuthor("FlatBerry");pdf.setSubject(`Vzor ${c.version}`);
  const {ink,muted,line,width,height,left,right}=contractPdfTheme,bottom=58;
  await drawContractCover(pdf,c,{regular:font,medium,semibold:bold,bold:strong});
  let page=pdf.addPage([width,height]),y=height-76;
  function newPage(){page=pdf.addPage([width,height]);y=height-76;}
  function ensure(space:number){if(y-space<bottom)newPage();}
  function wrap(value:string,size:number,f:PDFFont,max:number){
    return contractPdfWrap(value,size,f,max);
  }
  function paragraph(value:string,size=9.5,f=font,gap=7){const lines=wrap(value,size,f,right-left);ensure(Math.min(lines.length,3)*(size+4)+gap);for(const t of lines){ensure(size+4);page.drawText(t,{x:left,y,size,font:f,color:ink});y-=size+4;}y-=gap;}
  for(const section of c.sections){ensure(70);paragraph(section.title,13,bold,9);for(const p of section.paragraphs)for(const sub of p.split("\n\n"))paragraph(sub);y-=4;}
  const columnWidth=(right-left-26)/2;
  let qrImage:Awaited<ReturnType<typeof pdf.embedPng>>|null=null,qrPlaced=false;
  if(portalUrl){const qr=qrcode(0,"M");qr.addData(portalUrl);qr.make();const png=await sharp(Buffer.from(qr.createDataURL(6,24).split(",")[1],"base64")).png().toBuffer();qrImage=await pdf.embedPng(png);}
  function drawPortal(x:number,top:number,w:number,size:number){if(!qrImage)return;page.drawImage(qrImage,{x,y:top-size,width:size,height:size});const lines=wrap("Portál nájemníka\nNaskenujte QR a přihlaste se účtem s přijatou pozvánkou. QR je pouze odkaz a neuděluje přístup k údajům.",8,font,w-size-12);lines.forEach((t,i)=>page.drawText(t,{x:x+size+12,y:top-8-i*11,size:8,font,color:muted}));qrPlaced=true;}
  const signatureRows:Array<{lines:string[];height:number}[]>=[];
  for(let i=0;i<c.signatures.length;i+=2)signatureRows.push(c.signatures.slice(i,i+2).map(s=>{const lines=wrap(`${s.role}: ${s.name}\n${s.detail}`,9.5,font,columnWidth);return {lines,height:lines.length*13+66};}));
  const qrInLastColumn=Boolean(qrImage&&signatureRows.at(-1)?.length===1);
  const signingHeight=wrap(c.signing,11,bold,right-left).length*15+18;
  const allHeight=signatureRows.reduce((s,row,i)=>s+Math.max(...row.map(v=>v.height),qrInLastColumn&&i===signatureRows.length-1?110:0),0)+signingHeight+(qrImage&&!qrInLastColumn?114:0);
  if(allHeight<height-76-bottom)ensure(allHeight);else ensure(signingHeight+Math.max(...signatureRows[0].map(v=>v.height)));
  paragraph(c.signing,11,bold,18);
  for(const [rowIndex,row]of signatureRows.entries()){const qrHere=qrInLastColumn&&rowIndex===signatureRows.length-1,rowHeight=Math.max(...row.map(v=>v.height),qrHere?110:0);ensure(rowHeight);
    for(const [column,signature]of row.entries()){const x=left+column*(columnWidth+26);let sy=y;for(const t of signature.lines){page.drawText(t,{x,y:sy,size:9.5,font,color:ink});sy-=13;}sy-=30;page.drawLine({start:{x,y:sy},end:{x:x+columnWidth-15,y:sy},color:muted,thickness:.6});page.drawText("Podpis",{x,y:sy-16,size:8,font,color:muted});}
    if(qrHere)drawPortal(left+columnWidth+26,y,columnWidth,72);y-=rowHeight;
  }
  if(qrImage&&!qrPlaced){ensure(114);drawPortal(left,y,right-left,88);y-=114;}
  const pages=pdf.getPages();for(const [i,p]of pages.entries()){
    p.drawImage(logo,{x:left,y:height-44,width:100,height:100*logo.height/logo.width});
    const header=preview?"NÁHLED · NEPODEPISOVAT":"Nájemní smlouva k bytu";
    p.drawText(header,{x:right-medium.widthOfTextAtSize(header,7.4),y:height-36,size:7.4,font:medium,color:muted});
    p.drawLine({start:{x:left,y:height-810},end:{x:right,y:height-810},thickness:.65,color:line});
    p.drawText(`Vzor ${c.version}`,{x:left,y:height-825,size:7,font,color:muted});
    const pagination=`${i+1} / ${pages.length}`;p.drawText(pagination,{x:right-font.widthOfTextAtSize(pagination,7),y:height-825,size:7,font,color:muted});
  }
  return pdf.save();
}
