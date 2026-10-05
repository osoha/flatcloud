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

type ResolvedReceiptIssuer = { id: string; ownerId: string; representativeId: string | null; name: string; roleLabel: string | null; receiptIssuerName: string; receiptIssuerAddress: string; receiptSignatureData: Uint8Array; signatureHash: string; stampData: Uint8Array | null; stampHash: string | null; profileRevision: number };
export type ReceiptIssuerStatus = { ready: boolean; reason: string; issuerName?: string; signerName?: string; ownerId?: string };
async function resolveLeaseReceiptIssuer(leaseId: string, period: string, db: Prisma.TransactionClient): Promise<{ issuer: ResolvedReceiptIssuer | null; status: ReceiptIssuerStatus }> {
  let known: Partial<ReceiptIssuerStatus> = {};
  const blocked = (reason: string) => ({ issuer: null, status: { ready: false, reason, ...known } as ReceiptIssuerStatus });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return blocked("Období nájmu není platné.");
  const periods = await db.leaseLandlordPeriod.findMany({ where: { leaseId, active: true, fromPeriod: { lte: period }, OR: [{ toPeriod: null }, { toPeriod: { gte: period } }] }, include: { owner: { include: { user: { select: { id: true, name: true, active: true, role: true, receiptSignatureData: true, receiptIssuanceEnabled: true } }, receiptProfile: { include: { designatedRepresentative: { include: { user: { select: { id: true, name: true, role: true, active: true } } } } } } } } } });
  if (!periods.length) return blocked("Pro toto období ještě není potvrzen pronajímatel. Obraťte se na správce.");
  if (periods.length !== 1) return blocked("Pro toto období je uvedeno více pronajímatelů. Správce musí upřesnit období.");
  const owner = periods[0].owner, profile = owner.receiptProfile, rep = profile?.designatedRepresentative;
  known = { ownerId: owner.id, issuerName: profile?.issuerName || owner.name, ...(owner.type === "PERSON" && owner.user ? { signerName: owner.user.name } : rep ? { signerName: rep.user.name } : {}) };
  if (!owner.active || !profile?.enabled) return blocked("Pronajímatel zatím nepovolil vystavování dokladů.");
  if (!profile.issuerName.trim() || !profile.issuerAddress.trim()) return blocked("Pronajímatel nemá úplné údaje vystavitele.");
  const stampData = owner.type === "PERSON" ? null : profile.stampData;
  if (stampData && (!profile.stampHash || createHash("sha256").update(stampData).digest("hex") !== profile.stampHash)) return blocked("Razítko pronajímatele vyžaduje kontrolu.");
  if (owner.type === "PERSON") {
    const signer = owner.user;
    if (!signer?.active || signer.role === "TENANT" || !signer.receiptIssuanceEnabled || !signer.receiptSignatureData?.byteLength) return blocked("Fyzická osoba si musí ve vlastním účtu uložit podpis a povolit vystavování.");
    const signatureHash = createHash("sha256").update(signer.receiptSignatureData).digest("hex");
    return { issuer: { id: signer.id, ownerId: owner.id, representativeId: null, name: signer.name, roleLabel: null, receiptIssuerName: profile.issuerName, receiptIssuerAddress: profile.issuerAddress, receiptSignatureData: signer.receiptSignatureData, signatureHash, stampData: null, stampHash: null, profileRevision: profile.revision }, status: { ready: true, reason: "Doklad je připraven k vystavení.", issuerName: profile.issuerName, signerName: signer.name, ownerId: owner.id } };
  }
  if (!rep || rep.ownerId !== owner.id || !rep.active || !rep.user.active || rep.user.role === "TENANT") return blocked("Pronajímatel ještě neurčil aktivní podepisující osobu.");
  if (!rep.consentedAt || rep.revokedAt || rep.consentProfileRevision !== profile.revision || !rep.signatureData?.byteLength || !rep.signatureHash || createHash("sha256").update(rep.signatureData).digest("hex") !== rep.signatureHash) return blocked("Podepisující osoba musí potvrdit svůj podpis a souhlas pro aktuální údaje pronajímatele.");
  const issuer: ResolvedReceiptIssuer = { id: rep.userId, ownerId: owner.id, representativeId: rep.id, name: rep.user.name, roleLabel: rep.roleLabel, receiptIssuerName: profile.issuerName, receiptIssuerAddress: profile.issuerAddress, receiptSignatureData: rep.signatureData, signatureHash: rep.signatureHash, stampData, stampHash: profile.stampHash, profileRevision: profile.revision };
  return { issuer, status: { ready: true, reason: "Doklad je připraven k vystavení.", issuerName: profile.issuerName, signerName: rep.user.name, ownerId: owner.id } };
}
/** Compatibility summary only; issuance always passes the charge's exact month. */
export async function receiptIssuerForLease(leaseId: string, db: Prisma.TransactionClient = prisma, period = currentPeriod()) { return (await resolveLeaseReceiptIssuer(leaseId, period, db)).issuer; }
export async function receiptIssuerStatusForLease(leaseId: string, period: string, db: Prisma.TransactionClient = prisma) { return (await resolveLeaseReceiptIssuer(leaseId, period, db)).status; }
export const resolveReceiptStatus = receiptIssuerStatusForLease;

type ReceiptSnapshot={issuerName:string;issuerAddress:string;tenantName:string;tenantAddress:string;location:string;period:string;currency:string;amountCents:number;items:Array<{name:string;amountCents:number}>;payments:Array<{id:string;amountCents:number;bookedAt:string}>;signatureHash:string;stampHash?:string|null;issuerOwnerId?:string;representativeId?:string|null;signerName?:string;signerRole?:string|null;profileRevision?:number;requestedById?:string;issuanceMode?:string};
export async function receiptPdf(snapshot:ReceiptSnapshot,signature:Uint8Array,id:string,issuedAt:Date,stamp?:Uint8Array|null) {
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const regular=await pdf.embedFont(await readFile(path.join(process.cwd(),"public/fonts/Raleway-Regular.ttf")));
  const bold=await pdf.embedFont(await readFile(path.join(process.cwd(),"public/fonts/Raleway-Bold.ttf")));
  const navy=rgb(.08,.18,.31),blue=rgb(.16,.33,.51),pale=rgb(.94,.97,.99),line=rgb(.78,.84,.89),muted=rgb(.36,.43,.5);
  const width=595.28,left=43,right=552,content=right-left;
  let page=pdf.addPage([width,841.89]),y=787,pageNumber=1;
  const ink=(value:string,x:number,at:number,size=10,strong=false,color=navy)=>page.drawText(value,{x,y:at,size,font:strong?bold:regular,color});
  const rule=(at:number)=>page.drawLine({start:{x:left,y:at},end:{x:right,y:at},thickness:.8,color:line});
  const wrap=(value:string,max:number,size=10,strong=false)=>{
    const font=strong?bold:regular, lines:string[]=[];
    for(const paragraph of value.replace(/\r/g,"").split(/\n/)){
      let current="";
      for(const word of paragraph.split(/\s+/).filter(Boolean)){
        if(font.widthOfTextAtSize(word,size)>max){
          if(current){lines.push(current);current="";}
          let part="";for(const letter of word){if(font.widthOfTextAtSize(part+letter,size)>max&&part){lines.push(part);part="";}part+=letter;}current=part;
        }else if(font.widthOfTextAtSize(current?`${current} ${word}`:word,size)>max&&current){lines.push(current);current=word;}else current=current?`${current} ${word}`:word;
      }
      lines.push(current);
    }
    return lines;
  };
  const header=()=>{
    page.drawRectangle({x:left,y:754,width:content,height:56,color:navy});
    ink("DOKLAD O ZAPLACENÍ NÁJMU",left+17,780,17,true,rgb(1,1,1));
    ink("POTVRZENÍ PŘIJATÉ BEZHOTOVOSTNÍ ÚHRADY",left+18,764,7.5,false,rgb(.79,.88,.95));
    y=735;
  };
  const footer=()=>{
    rule(46);ink("Doklad potvrzuje skutečně přijaté úhrady přiřazené k nájmu.",left,33,8,false,muted);
    ink(`${pageNumber}`,right-10,33,8,false,muted);
  };
  const next=()=>{footer();page=pdf.addPage([width,841.89]);pageNumber++;header();};
  const ensure=(height:number)=>{if(y-height<72)next();};
  const label=(text:string,x:number,at:number)=>ink(text.toLocaleUpperCase("cs-CZ"),x,at,7.5,true,muted);
  header();
  label("Číslo dokladu",left,y);ink(id,left,y-18,9,true);
  label("Datum vystavení",left+310,y);ink(date(issuedAt),left+310,y-18,10,true);y-=47;
  const party=(heading:string,name:string,address:string,x:number,at:number,boxWidth:number,boxHeight:number)=>{
    page.drawRectangle({x,y:at-boxHeight,width:boxWidth,height:boxHeight,borderColor:line,borderWidth:.8,color:rgb(1,1,1)});
    label(heading,x+13,at-17);
    let cursor=at-37;
    for(const row of wrap(name,boxWidth-26,11,true)){ink(row,x+13,cursor,11,true);cursor-=14;}
    for(const row of wrap(address||"—",boxWidth-26,9)){ink(row,x+13,cursor,9,false,muted);cursor-=12;}
  };
  const half=(content-10)/2;
  const issuerHeight=wrap(snapshot.issuerName,half-26,11,true).length*14+wrap(snapshot.issuerAddress,half-26,9).length*12+46;
  const tenantHeight=wrap(snapshot.tenantName,half-26,11,true).length*14+wrap(snapshot.tenantAddress||"—",half-26,9).length*12+46;
  const boxHeight=Math.max(90,issuerHeight,tenantHeight);
  ensure(boxHeight+30);
  party("Pronajímatel / vystavitel",snapshot.issuerName,snapshot.issuerAddress,left,y,half,boxHeight);
  party("Nájemník",snapshot.tenantName,snapshot.tenantAddress,left+half+10,y,half,boxHeight);
  y-=boxHeight+15;
  const locationLines=wrap(snapshot.location,content-28,10);
  const locationHeight=Math.max(68,locationLines.length*13+48);
  ensure(locationHeight+20);
  page.drawRectangle({x:left,y:y-locationHeight,width:content,height:locationHeight,borderColor:line,borderWidth:.8});
  label("Nájem za období",left+14,y-17);ink(periodLabel(snapshot.period),left+14,y-34,12,true);
  label("Nemovitost / jednotka",left+170,y-17);
  locationLines.forEach((row,index)=>ink(row,left+170,y-34-index*13,10,index===0));
  y-=locationHeight+15;
  ensure(70);
  page.drawRectangle({x:left,y:y-59,width:content,height:59,color:pale,borderColor:line,borderWidth:.8});
  label("Celkem přijato",left+15,y-20);
  ink(moneyExact(snapshot.amountCents).replace("Kč",snapshot.currency),left+15,y-46,20,true,blue);
  ink("UHRAZENO",right-92,y-35,10,true,blue);
  y-=78;
  const table=(heading:string,rows:Array<{label:string;amount:number}>)=>{
    ensure(51);ink(heading,left,y,11,true);y-=13;rule(y);y-=17;
    for(const row of rows){
      const lines=wrap(row.label,content-145,9);
      const height=Math.max(29,lines.length*12+15);
      ensure(height+17);
      lines.forEach((value,index)=>ink(value,left+5,y-index*12,9));
      const amount=moneyExact(row.amount).replace("Kč",snapshot.currency);
      ink(amount,right-5-bold.widthOfTextAtSize(amount,9),y,9,true);
      y-=height;rule(y+12);
    }
    y-=18;
  };
  table("Rozpis přijaté úhrady",snapshot.items.map(item=>({label:item.name,amount:item.amountCents})));
  table("Připsané platby",snapshot.payments.map(payment=>({label:date(payment.bookedAt),amount:payment.amountCents})));
  ensure(121);
  const signTop=y+4,signHeight=106;
  page.drawRectangle({x:left,y:signTop-signHeight,width:content,height:signHeight,borderColor:line,borderWidth:.8});
  label("Za pronajímatele podepsal/a",left+13,signTop-17);
  ink(snapshot.signerName||snapshot.issuerName,left+13,signTop-34,10,true);
  if(snapshot.signerRole)ink(snapshot.signerRole,left+13,signTop-47,8,false,muted);
  const signatureImage=await pdf.embedPng(signature),signatureScale=Math.min(185/signatureImage.width,46/signatureImage.height);
  page.drawImage(signatureImage,{x:left+13,y:signTop-95,width:signatureImage.width*signatureScale,height:signatureImage.height*signatureScale});
  if(stamp){
    label("Razítko",left+300,signTop-17);
    const stampImage=await pdf.embedPng(stamp),stampScale=Math.min(165/stampImage.width,67/stampImage.height);
    page.drawImage(stampImage,{x:left+298,y:signTop-93,width:stampImage.width*stampScale,height:stampImage.height*stampScale});
  }
  footer();
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
    const snapshot:ReceiptSnapshot={issuerName:issuer.receiptIssuerName,issuerAddress:issuer.receiptIssuerAddress,issuerOwnerId:issuer.ownerId,representativeId:issuer.representativeId,signerName:issuer.name,signerRole:issuer.roleLabel,profileRevision:issuer.profileRevision,tenantName:charge.lease.tenant.name,tenantAddress:charge.lease.tenant.address||charge.lease.tenant.billingAddress||"",location:`${charge.lease.unit.property.address}, ${charge.lease.unit.property.city} · ${charge.lease.unit.label}`,period:charge.period,currency:charge.lease.currency,amountCents:charge.amountCents,items:items.sort((a,b)=>a.name.localeCompare(b.name,"cs")||a.amountCents-b.amountCents),payments:charge.allocations.map(a=>({id:a.transactionId,amountCents:a.amountCents,bookedAt:a.transaction.bookedAt.toISOString()})).sort((a,b)=>a.id.localeCompare(b.id)),signatureHash:issuer.signatureHash,stampHash:issuer.stampHash};
    const snapshotHash=createHash("sha256").update(JSON.stringify({issuerId:issuer.id,snapshot})).digest("hex");
    const existing=await tx.tenantPaymentReceipt.findUnique({where:{chargeId_snapshotHash:{chargeId,snapshotHash}}});if(existing)return existing;
    const id=`D-${chargeId}-${snapshotHash.slice(0,12)}`,issuedAt=new Date();
    const issuedSnapshot={...snapshot,requestedById:user.id,issuanceMode:input.mode};
    const receipt=await tx.tenantPaymentReceipt.create({data:{id,chargeId,issuerId:issuer.id,issuerOwnerId:issuer.ownerId,representativeId:issuer.representativeId,requestedById:user.id,issuanceMode:input.mode,snapshotHash,snapshot:issuedSnapshot as unknown as Prisma.InputJsonValue,pdfData:new Uint8Array(await receiptPdf(issuedSnapshot,issuer.receiptSignatureData,id,issuedAt,issuer.stampData)),issuedAt}});
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
  return {leaseId:lease.id,tenantId:lease.tenantId,tenantName:lease.tenant.name,contractNumber:lease.contractNumber,initialPeriod:businessDateKey(lease.startDate).slice(0,7),propertyId:lease.unit.propertyId,unitId:lease.unitId,canManage,periods:lease.landlordPeriods,ownerChoices:canManage?await receiptLandlordChoices(actor,leaseId):[],charges,receipts};
}
