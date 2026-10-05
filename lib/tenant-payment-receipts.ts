import {createHash} from "node:crypto";
import {Prisma} from "@prisma/client";
import {prisma} from "./db";
import {portalEditableUnitWhere} from "./tenant-portal-access";
import {leaseStatusAt} from "./lease-lifecycle-core";
import {businessDateKey,businessTodayKey} from "./calendar";
import {periodLabel} from "./period";
import {moneyExact,date} from "./format";
import {PDFDocument,rgb} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {readFile} from "node:fs/promises";
import path from "node:path";

type ReceivedCharge={active:boolean;period:string;amountCents:number;debtTreatment:string;allocations:Array<{amountCents:number;transaction:{amountCents:number;currency:string;bookedAt:Date;status:string}}> ;securityDepositOffsets:Array<{amountCents:number}>;creditApplications:Array<{amountCents:number}>};
/** Only a monthly rent charge fully paid by actual received transactions is issuable. */
export function receiptEligible(charge:ReceivedCharge,currency:string) {
  return charge.active&&charge.debtTreatment==="CURRENT"&&/^\d{4}-(0[1-9]|1[0-2])$/.test(charge.period)&&charge.amountCents>0&&
    !charge.securityDepositOffsets.length&&!charge.creditApplications.length&&charge.allocations.length>0&&
    charge.allocations.every(a=>a.amountCents>0&&a.transaction.amountCents>0&&a.transaction.currency===currency&&["MATCHED","PARTIAL","OVERPAYMENT"].includes(a.transaction.status)&&businessDateKey(a.transaction.bookedAt)<=businessTodayKey())&&
    charge.allocations.reduce((sum,a)=>sum+a.amountCents,0)===charge.amountCents;
}

export async function receiptIssuerForLease(leaseId:string,db:Prisma.TransactionClient=prisma) {
  const lease=await db.lease.findUnique({where:{id:leaseId},select:{unit:{select:{id:true,property:{select:{managerId:true,owner:{select:{userId:true}}}},ownerships:{where:{owner:{userId:{not:null}}},select:{owner:{select:{userId:true}}}}}},ownerBankAccount:{select:{owner:{select:{userId:true}}}}}});
  if(!lease)return null;
  const ids=[lease.unit.property.managerId,lease.ownerBankAccount?.owner.userId,...lease.unit.ownerships.map(o=>o.owner.userId),lease.unit.property.owner.userId].filter((id):id is string=>Boolean(id));
  for(const id of new Set(ids)) {
    const issuer=await db.user.findFirst({where:{id,active:true,receiptIssuanceEnabled:true,receiptIssuerName:{not:null},receiptIssuerAddress:{not:null},receiptSignatureData:{not:null}},select:{id:true,name:true,role:true,allProperties:true,receiptIssuerName:true,receiptIssuerAddress:true,receiptSignatureData:true}});
    if(issuer&&issuer.role!=="TENANT"&&await db.unit.count({where:{AND:[{id:lease.unit.id},portalEditableUnitWhere(issuer)]}}))return issuer;
  }
  return null;
}

type ReceiptSnapshot={issuerName:string;issuerAddress:string;tenantName:string;tenantAddress:string;location:string;period:string;currency:string;amountCents:number;items:Array<{name:string;amountCents:number}>;payments:Array<{id:string;amountCents:number;bookedAt:string}>;signatureHash:string};
export async function receiptPdf(snapshot:ReceiptSnapshot,signature:Uint8Array,id:string,issuedAt:Date) {
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const regular=await pdf.embedFont(await readFile(path.join(process.cwd(),"public/fonts/Raleway-Regular.ttf"))),bold=await pdf.embedFont(await readFile(path.join(process.cwd(),"public/fonts/Raleway-Bold.ttf")));
  let page=pdf.addPage([595.28,841.89]),y=780;
  const ink=rgb(.09,.16,.26),muted=rgb(.35,.42,.5);
  const write=(text:string,size=11,strong=false)=>{const font=strong?bold:regular;const words=text.replace(/[\r\n\t]+/g," ").split(" ");let line="";
    const draw=(value:string)=>{if(y<100){page=pdf.addPage([595.28,841.89]);y=780;}page.drawText(value,{x:48,y,size,font,color:strong?ink:muted});y-=size+9;};
    for(const word of words){if(font.widthOfTextAtSize(`${line} ${word}`.trim(),size)>499&&line){draw(line);line="";}if(font.widthOfTextAtSize(word,size)>499){let chunk="";for(const char of word){if(font.widthOfTextAtSize(chunk+char,size)>499){draw(chunk);chunk="";}chunk+=char;}line=chunk;}else line=`${line} ${word}`.trim();}if(line)draw(line);
  };
  write("DOKLAD O ZAPLACENÍ NÁJMU",21,true);write(`Číslo dokladu: ${id}`,9);write(`Vystaveno: ${date(issuedAt)}`);y-=16;
  write("Vystavitel",12,true);write(snapshot.issuerName,13,true);write(snapshot.issuerAddress);y-=14;
  write("Přijato za nájemníka",12,true);write(snapshot.tenantName,13,true);if(snapshot.tenantAddress)write(snapshot.tenantAddress);
  write(`Nemovitost / jednotka: ${snapshot.location}`);write(`Období nájmu: ${periodLabel(snapshot.period)}`,13,true);y-=14;
  write(`Přijatá úhrada: ${moneyExact(snapshot.amountCents).replace("Kč",snapshot.currency)}`,16,true);
  for(const item of snapshot.items)write(`${item.name}: ${moneyExact(item.amountCents).replace("Kč",snapshot.currency)}`);
  y-=14;write("Úhrady připsané na účet",12,true);
  for(const payment of snapshot.payments)write(`${date(payment.bookedAt)} · ${moneyExact(payment.amountCents).replace("Kč",snapshot.currency)}`);
  y-=12;write("Doklad potvrzuje přijaté úhrady přiřazené k uvedenému nájmu.");
  if(y<175){page=pdf.addPage([595.28,841.89]);y=780;}
  const image=await pdf.embedPng(signature);const scale=Math.min(180/image.width,64/image.height);
  page.drawImage(image,{x:48,y:y-80,width:image.width*scale,height:image.height*scale});y-=100;
  write(`Podpis vystavitele: ${snapshot.issuerName}`,10);write("Vystaveno z uložené evidence plateb v aplikaci FlatBerry.",9);
  pdf.setTitle(`Doklad o zaplacení nájmu · ${periodLabel(snapshot.period)}`);
  return pdf.save();
}

export async function issueTenantReceipt(user:{id:string;email:string},tenantId:string,chargeId:string) {
  // Serializable read + insert prevents a changing allocation from producing a stale new proof.
  for(let attempt=0;attempt<3;attempt++)try{return await prisma.$transaction(async tx=>{
    const {tenantPortalContactMatches}=await import("./tenant-portal-access");
    const access=await tx.tenantPortalAccess.findUnique({where:{userId_tenantId:{userId:user.id,tenantId}},include:{tenant:true}});
    if(!access||!tenantPortalContactMatches(user.email,access.tenant))throw new Error("Přístup byl odepřen.");
    const charge=await tx.charge.findFirst({where:{id:chargeId,lease:{OR:[{tenantId},{parties:{some:{tenantId,role:"CONTRACTING_PARTY"}}}]}},include:{items:true,allocations:{include:{transaction:{include:{allocations:true,securityDepositReceipts:true}}}},securityDepositOffsets:true,creditApplications:true,lease:{include:{tenant:true,unit:{include:{property:true}}}}}});
    if(!charge||leaseStatusAt(charge.lease)!=="ACTIVE"||!receiptEligible(charge,charge.lease.currency))throw new Error("Doklad lze vystavit pouze k nájmu plně uhrazenému připsanou platbou.");
    if(charge.allocations.some(a=>a.transaction.allocations.reduce((sum,p)=>sum+p.amountCents,0)+a.transaction.securityDepositReceipts.reduce((sum,p)=>sum+p.amountCents,0)>a.transaction.amountCents))throw new Error("Úhrada vyžaduje kontrolu správcem.");
    const issuer=await receiptIssuerForLease(charge.leaseId,tx);if(!issuer?.receiptSignatureData)throw new Error("Vystavitel zatím nepovolil doklady nebo nemá uložený podpis. Obraťte se na správce.");
    const totalItems=charge.items.reduce((sum,item)=>sum+item.amountCents,0);
    const items=totalItems===charge.amountCents?charge.items.map(i=>({name:i.name,amountCents:i.amountCents})): [{name:"Nájem a služby dle předpisu (rozpis není evidován)",amountCents:charge.amountCents}];
    const snapshot:ReceiptSnapshot={issuerName:issuer.receiptIssuerName!,issuerAddress:issuer.receiptIssuerAddress!,tenantName:charge.lease.tenant.name,tenantAddress:charge.lease.tenant.address||charge.lease.tenant.billingAddress||"",location:`${charge.lease.unit.property.address}, ${charge.lease.unit.property.city} · ${charge.lease.unit.label}`,period:charge.period,currency:charge.lease.currency,amountCents:charge.amountCents,items:items.sort((a,b)=>a.name.localeCompare(b.name,"cs")||a.amountCents-b.amountCents),payments:charge.allocations.map(a=>({id:a.transactionId,amountCents:a.amountCents,bookedAt:a.transaction.bookedAt.toISOString()})).sort((a,b)=>a.id.localeCompare(b.id)),signatureHash:createHash("sha256").update(issuer.receiptSignatureData).digest("hex")};
    const snapshotHash=createHash("sha256").update(JSON.stringify({issuerId:issuer.id,snapshot})).digest("hex");
    const existing=await tx.tenantPaymentReceipt.findUnique({where:{chargeId_snapshotHash:{chargeId,snapshotHash}}});if(existing)return existing;
    const id=`D-${chargeId}-${snapshotHash.slice(0,12)}`,issuedAt=new Date();
    const receipt=await tx.tenantPaymentReceipt.create({data:{id,chargeId,issuerId:issuer.id,snapshotHash,snapshot:snapshot as unknown as Prisma.InputJsonValue,pdfData:new Uint8Array(await receiptPdf(snapshot,issuer.receiptSignatureData,id,issuedAt)),issuedAt}});
    await tx.auditLog.create({data:{userId:user.id,propertyId:charge.lease.unit.propertyId,action:"TENANT_PAYMENT_RECEIPT_ISSUED",entityType:"TenantPaymentReceipt",entityId:receipt.id,details:{tenantId,chargeId,issuerId:issuer.id}}});return receipt;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:15000});}catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&["P2034","P2002"].includes(error.code)&&attempt<2)continue;throw error;}
  throw new Error("Doklad se nepodařilo vystavit.");
}
