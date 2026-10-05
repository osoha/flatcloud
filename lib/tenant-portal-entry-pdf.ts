import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {PDFDocument,rgb} from "pdf-lib";
import qrcode from "qrcode-generator";
import sharp from "sharp";

export type PortalEntryDocumentKind="contract"|"handover";

export function portalEntryUrl(tenantId:string) {
  const base=process.env.RENDER_EXTERNAL_URL||process.env.APP_URL;
  if(!base)throw new Error("Chybí veřejná adresa aplikace.");
  const url=new URL(base);
  if(url.protocol!=="https:"&&!(["localhost","127.0.0.1"].includes(url.hostname)))throw new Error("Portál vyžaduje bezpečnou adresu.");
  return new URL(`/portal/najemnik/${encodeURIComponent(tenantId)}`,url).toString();
}

export async function tenantPortalEntryPdf(input:{tenantId:string;propertyName:string;unitLabel:string;contractNumber:string|null;kind:PortalEntryDocumentKind}) {
  const url=portalEntryUrl(input.tenantId);
  const qr=qrcode(0,"M");qr.addData(url);qr.make();
  const gif=Buffer.from(qr.createDataURL(8,8).split(",")[1],"base64");
  const png=await sharp(gif).png().toBuffer();
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const regular=await pdf.embedFont(await import("node:fs/promises").then(fs=>fs.readFile(path.join(process.cwd(),"public/fonts/Raleway-Regular.ttf"))));
  const bold=await pdf.embedFont(await import("node:fs/promises").then(fs=>fs.readFile(path.join(process.cwd(),"public/fonts/Raleway-Bold.ttf"))));
  const page=pdf.addPage([595.28,841.89]);
  const ink=rgb(0.08,0.14,0.24),muted=rgb(0.34,0.40,0.48),accent=rgb(0.13,0.41,0.86);
  const line=(text:string,y:number,size=12,weight=regular,color=ink)=>page.drawText(text,{x:54,y,size,font:weight,color,maxWidth:487});
  line("FlatBerry · Portál nájemníka",752,19,bold,accent);
  line(input.kind==="contract"?"Příloha k nájemní smlouvě":"Příloha k předávacímu protokolu",711,17,bold);
  line(`${input.propertyName} · ${input.unitLabel}`,680,12,bold);
  if(input.contractNumber)line(`Smlouva: ${input.contractNumber}`,658,11,regular,muted);
  const image=await pdf.embedPng(png);page.drawImage(image,{x:186,y:360,width:224,height:224});
  line("Naskenujte QR a otevřete portál.",327,14,bold);
  line("Přihlaste se účtem, ke kterému byla přijata osobní pozvánka.",301,10,regular,muted);
  line("QR slouží pouze jako odkaz. Sám o sobě neuděluje přístup k údajům.",283,10,regular,muted);
  page.drawText(url,{x:54,y:235,size:9,font:regular,color:accent,maxWidth:487});
  page.drawLine({start:{x:54,y:116},end:{x:541,y:116},thickness:1,color:rgb(0.86,0.90,0.95)});
  line("Samostatná tisková příloha. Originální smlouva ani protokol nebyly změněny.",96,9,regular,muted);
  return pdf.save();
}
