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
import { currentReceiptActor, receiptLandlordChoices, type ReceiptActor } from "./owner-receipt-settings";
import { leaseAccessWhere } from "./access";
import { currentPeriod } from "./period";

type ReceivedCharge={active:boolean;period:string;amountCents:number;debtTreatment:string;allocations:Array<{amountCents:number;transaction:{amountCents:number;currency:string;bookedAt:Date;status:string}}> ;securityDepositOffsets:Array<{amountCents:number}>;creditApplications:Array<{amountCents:number}>};
/** Only a monthly rent charge fully paid by actual received transactions is issuable. */
export function receiptEligible(charge:ReceivedCharge,currency:string) {
  return charge.active&&charge.debtTreatment==="CURRENT"&&/^\d{4}-(0[1-9]|1[0-2])$/.test(charge.period)&&charge.amountCents>0&&
    !charge.securityDepositOffsets.length&&!charge.creditApplications.length&&charge.allocations.length>0&&
    charge.allocations.every(a=>a.amountCents>0&&a.transaction.amountCents>0&&a.transaction.currency===currency&&["MATCHED","PARTIAL","OVERPAYMENT"].includes(a.transaction.status)&&businessDateKey(a.transaction.bookedAt)<=businessTodayKey())&&
    charge.allocations.reduce((sum,a)=>sum+a.amountCents,0)===charge.amountCents;
}

type ResolvedReceiptIssuer = { id: string; ownerId: string; representativeId: string; name: string; roleLabel: string | null; receiptIssuerName: string; receiptIssuerAddress: string; receiptSignatureData: Uint8Array; signatureHash: string; profileRevision: number };
export type ReceiptIssuerStatus = { ready: boolean; reason: string; issuerName?: string; signerName?: string; ownerId?: string };
async function resolveLeaseReceiptIssuer(leaseId: string, period: string, db: Prisma.TransactionClient): Promise<{ issuer: ResolvedReceiptIssuer | null; status: ReceiptIssuerStatus }> {
  let known: Partial<ReceiptIssuerStatus> = {};
  const blocked = (reason: string) => ({ issuer: null, status: { ready: false, reason, ...known } as ReceiptIssuerStatus });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return blocked("Období nájmu není platné.");
  const periods = await db.leaseLandlordPeriod.findMany({ where: { leaseId, active: true, fromPeriod: { lte: period }, OR: [{ toPeriod: null }, { toPeriod: { gte: period } }] }, include: { owner: { include: { receiptProfile: { include: { designatedRepresentative: { include: { user: { select: { id: true, name: true, role: true, active: true } } } } } } } } } });
  if (!periods.length) return blocked("Pro toto období ještě není potvrzen pronajímatel. Obraťte se na správce.");
  if (periods.length !== 1) return blocked("Pro toto období je uvedeno více pronajímatelů. Správce musí upřesnit období.");
  const owner = periods[0].owner, profile = owner.receiptProfile, rep = profile?.designatedRepresentative;
  known = { ownerId: owner.id, issuerName: profile?.issuerName || owner.name, ...(rep ? { signerName: rep.user.name } : {}) };
  if (!owner.active || !profile?.enabled) return blocked("Pronajímatel zatím nepovolil vystavování dokladů.");
  if (!profile.issuerName.trim() || !profile.issuerAddress.trim()) return blocked("Pronajímatel nemá úplné údaje vystavitele.");
  if (!rep || rep.ownerId !== owner.id || !rep.active || !rep.user.active || rep.user.role === "TENANT") return blocked("Pronajímatel ještě neurčil aktivní podepisující osobu.");
  if (!rep.consentedAt || rep.revokedAt || rep.consentProfileRevision !== profile.revision || !rep.signatureData?.byteLength || !rep.signatureHash || createHash("sha256").update(rep.signatureData).digest("hex") !== rep.signatureHash) return blocked("Podepisující osoba musí potvrdit svůj podpis a souhlas pro aktuální údaje pronajímatele.");
  const issuer: ResolvedReceiptIssuer = { id: rep.userId, ownerId: owner.id, representativeId: rep.id, name: rep.user.name, roleLabel: rep.roleLabel, receiptIssuerName: profile.issuerName, receiptIssuerAddress: profile.issuerAddress, receiptSignatureData: rep.signatureData, signatureHash: rep.signatureHash, profileRevision: profile.revision };
  return { issuer, status: { ready: true, reason: "Doklad je připraven k vystavení.", issuerName: profile.issuerName, signerName: rep.user.name, ownerId: owner.id } };
}
/** Compatibility summary only; issuance always passes the charge's exact month. */
export async function receiptIssuerForLease(leaseId: string, db: Prisma.TransactionClient = prisma, period = currentPeriod()) { return (await resolveLeaseReceiptIssuer(leaseId, period, db)).issuer; }
export async function receiptIssuerStatusForLease(leaseId: string, period: string, db: Prisma.TransactionClient = prisma) { return (await resolveLeaseReceiptIssuer(leaseId, period, db)).status; }
export const resolveReceiptStatus = receiptIssuerStatusForLease;

type ReceiptSnapshot={issuerName:string;issuerAddress:string;tenantName:string;tenantAddress:string;location:string;period:string;currency:string;amountCents:number;items:Array<{name:string;amountCents:number}>;payments:Array<{id:string;amountCents:number;bookedAt:string}>;signatureHash:string;issuerOwnerId?:string;representativeId?:string;signerName?:string;signerRole?:string|null;profileRevision?:number;requestedById?:string;issuanceMode?:string};
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
  write(`Za vystavitele podepsal/a: ${snapshot.signerName || snapshot.issuerName}`,10);if(snapshot.signerRole)write(snapshot.signerRole,9);write("Vystaveno z uložené evidence plateb v aplikaci FlatBerry.",9);
  pdf.setTitle(`Doklad o zaplacení nájmu · ${periodLabel(snapshot.period)}`);
  return pdf.save();
}

export async function issueTenantReceipt(user:{id:string;email:string},tenantId:string,chargeId:string) {
  return issuePaymentReceipt(user.id, {mode:"tenant",tenantId,chargeId});
}
export async function issueStaffReceipt(user:ReceiptActor,leaseId:string,chargeId:string) {
  return issuePaymentReceipt(user.id, {mode:"staff",leaseId,chargeId});
}
async function issuePaymentReceipt(actorId:string,input:{mode:"tenant"|"staff";tenantId?:string;leaseId?:string;chargeId:string}) {
  const {chargeId}=input;
  // Serializable read + insert prevents a changing allocation from producing a stale new proof.
  for(let attempt=0;attempt<3;attempt++)try{return await prisma.$transaction(async tx=>{
    const user=await tx.user.findFirst({where:{id:actorId,active:true},select:{id:true,email:true,role:true,allProperties:true}});
    if(!user)throw new Error("Přístup byl odepřen.");
    let leaseWhere:Prisma.LeaseWhereInput;
    if(input.mode==="tenant") {
      const {tenantPortalContactMatches}=await import("./tenant-portal-access");
      const tenantId=input.tenantId!;
      const access=await tx.tenantPortalAccess.findUnique({where:{userId_tenantId:{userId:user.id,tenantId}},include:{tenant:true}});
      if(user.role==="SUPER_ADMIN"||!access||!access.tenant.active||!tenantPortalContactMatches(user.email,access.tenant))throw new Error("Přístup byl odepřen.");
      leaseWhere={OR:[{tenantId},{parties:{some:{tenantId,role:"CONTRACTING_PARTY"}}}]};
    }else{
      if(user.role==="TENANT"||!input.leaseId)throw new Error("Přístup byl odepřen.");
      leaseWhere={id:input.leaseId,unit:portalEditableUnitWhere(user)};
    }
    const charge=await tx.charge.findFirst({where:{id:chargeId,lease:leaseWhere},include:{items:true,allocations:{include:{transaction:{include:{allocations:true,securityDepositReceipts:true}}}},securityDepositOffsets:true,creditApplications:true,lease:{include:{tenant:true,unit:{include:{property:true}}}}}});
    const permittedLifecycle=charge&&(input.mode==="tenant" ? charge.lease.tenant.active&&leaseStatusAt(charge.lease)==="ACTIVE" : !charge.lease.cancelledAt&&leaseStatusAt(charge.lease)!=="FUTURE");
    if(!charge||!charge.lease.unit.property.active||!permittedLifecycle||!receiptEligible(charge,charge.lease.currency))throw new Error("Doklad lze vystavit pouze k platnému nájmu plně uhrazenému připsanou platbou.");
    if(charge.allocations.some(a=>a.transaction.allocations.reduce((sum,p)=>sum+p.amountCents,0)+a.transaction.securityDepositReceipts.reduce((sum,p)=>sum+p.amountCents,0)>a.transaction.amountCents))throw new Error("Úhrada vyžaduje kontrolu správcem.");
    const resolved=await resolveLeaseReceiptIssuer(charge.leaseId,charge.period,tx),issuer=resolved.issuer;if(!issuer)throw new Error(resolved.status.reason);
    const totalItems=charge.items.reduce((sum,item)=>sum+item.amountCents,0);
    const items=totalItems===charge.amountCents?charge.items.map(i=>({name:i.name,amountCents:i.amountCents})): [{name:"Nájem a služby dle předpisu (rozpis není evidován)",amountCents:charge.amountCents}];
    const snapshot:ReceiptSnapshot={issuerName:issuer.receiptIssuerName,issuerAddress:issuer.receiptIssuerAddress,issuerOwnerId:issuer.ownerId,representativeId:issuer.representativeId,signerName:issuer.name,signerRole:issuer.roleLabel,profileRevision:issuer.profileRevision,tenantName:charge.lease.tenant.name,tenantAddress:charge.lease.tenant.address||charge.lease.tenant.billingAddress||"",location:`${charge.lease.unit.property.address}, ${charge.lease.unit.property.city} · ${charge.lease.unit.label}`,period:charge.period,currency:charge.lease.currency,amountCents:charge.amountCents,items:items.sort((a,b)=>a.name.localeCompare(b.name,"cs")||a.amountCents-b.amountCents),payments:charge.allocations.map(a=>({id:a.transactionId,amountCents:a.amountCents,bookedAt:a.transaction.bookedAt.toISOString()})).sort((a,b)=>a.id.localeCompare(b.id)),signatureHash:issuer.signatureHash};
    const snapshotHash=createHash("sha256").update(JSON.stringify({issuerId:issuer.id,snapshot})).digest("hex");
    const existing=await tx.tenantPaymentReceipt.findUnique({where:{chargeId_snapshotHash:{chargeId,snapshotHash}}});if(existing)return existing;
    const id=`D-${chargeId}-${snapshotHash.slice(0,12)}`,issuedAt=new Date();
    const issuedSnapshot={...snapshot,requestedById:user.id,issuanceMode:input.mode};
    const receipt=await tx.tenantPaymentReceipt.create({data:{id,chargeId,issuerId:issuer.id,issuerOwnerId:issuer.ownerId,representativeId:issuer.representativeId,requestedById:user.id,issuanceMode:input.mode,snapshotHash,snapshot:issuedSnapshot as unknown as Prisma.InputJsonValue,pdfData:new Uint8Array(await receiptPdf(issuedSnapshot,issuer.receiptSignatureData,id,issuedAt)),issuedAt}});
    await tx.auditLog.create({data:{userId:user.id,propertyId:charge.lease.unit.propertyId,action:"TENANT_PAYMENT_RECEIPT_ISSUED",entityType:"TenantPaymentReceipt",entityId:receipt.id,details:{tenantId:input.tenantId||charge.lease.tenantId,chargeId,issuerId:issuer.id,issuerOwnerId:issuer.ownerId,representativeId:issuer.representativeId,requestedById:user.id,issuanceMode:input.mode}}});return receipt;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:15000});}catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&["P2034","P2002"].includes(error.code)&&attempt<2)continue;throw error;}
  throw new Error("Doklad se nepodařilo vystavit.");
}

export async function staffReceiptArchive(user:ReceiptActor,leaseId:string,receiptId:string) {
  const actor=await currentReceiptActor(user);
  return prisma.tenantPaymentReceipt.findFirst({where:{id:receiptId,charge:{lease:{AND:[{id:leaseId},leaseAccessWhere(actor)]}}}});
}
export async function getLeaseReceiptDocuments(user:ReceiptActor,leaseId:string) {
  const actor=await currentReceiptActor(user);
  const lease=await prisma.lease.findFirst({where:{AND:[{id:leaseId},leaseAccessWhere(actor)]},include:{tenant:{select:{name:true,active:true}},unit:{select:{propertyId:true,property:{select:{active:true}}}},landlordPeriods:{include:{owner:{select:{id:true,name:true}}},orderBy:{fromPeriod:"asc"}},charges:{where:{active:true},include:{allocations:{include:{transaction:{select:{amountCents:true,currency:true,bookedAt:true,status:true}}}},securityDepositOffsets:true,creditApplications:true,paymentReceipts:{select:{id:true,issuedAt:true,snapshot:true},orderBy:{issuedAt:"desc"}}},orderBy:{period:"desc"}}}});
  if(!lease)return null;
  const canManage=Boolean(await prisma.lease.count({where:{id:leaseId,unit:portalEditableUnitWhere(actor)}}));
  const charges=await Promise.all(lease.charges.map(async charge=>({id:charge.id,period:charge.period,amountCents:charge.amountCents,currency:lease.currency,eligible:!lease.cancelledAt&&leaseStatusAt(lease)!=="FUTURE"&&lease.unit.property.active&&receiptEligible(charge,lease.currency),issuerStatus:await receiptIssuerStatusForLease(lease.id,charge.period)})));
  const archived=await prisma.tenantPaymentReceipt.findMany({where:{charge:{leaseId}},select:{id:true,issuedAt:true,snapshot:true,charge:{select:{period:true,active:true}}},orderBy:{issuedAt:"desc"}});
  const receipts=archived.map(receipt=>{const snapshot=receipt.snapshot&&typeof receipt.snapshot==="object"&&!Array.isArray(receipt.snapshot)?receipt.snapshot:{};return{id:receipt.id,issuedAt:receipt.issuedAt,period:typeof snapshot.period==="string"?snapshot.period:receipt.charge.period,chargeActive:receipt.charge.active,archivedChargeInactive:!receipt.charge.active,issuerName:typeof snapshot.issuerName==="string"?snapshot.issuerName:"",signerName:typeof snapshot.signerName==="string"?snapshot.signerName:""};});
  return {leaseId:lease.id,tenantId:lease.tenantId,tenantName:lease.tenant.name,contractNumber:lease.contractNumber,propertyId:lease.unit.propertyId,unitId:lease.unitId,canManage,periods:lease.landlordPeriods,ownerChoices:canManage?await receiptLandlordChoices(actor,leaseId):[],charges,receipts};
}
