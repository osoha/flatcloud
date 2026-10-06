import {contractLandlord} from "./landlord";
import { prisma } from "../db";
import { previewContext } from "../auth";
import { portalEditableUnitWhere } from "../tenant-portal-access";
import { CONTRACT_TEMPLATE_VERSION, addYear } from "./core";
import type { buildContract } from "./core";
import { authorizeDocumentContext, requireDocumentCreateAccess } from "../documents/service";
import { randomStorageKey, validateFile } from "../documents/file-validation";
import { createFileStorage } from "../storage";
import { documentStoragePlacement } from "../storage/locations";

export async function contractActor() {const context=await previewContext();return context.requested||!context.actor||context.actor.role==="TENANT"?null:context.actor;}
export async function contractLease(actor:NonNullable<Awaited<ReturnType<typeof contractActor>>>,leaseId:string){return prisma.lease.findFirst({where:{id:leaseId,unit:portalEditableUnitWhere(actor)},include:{tenant:true,parties:{where:{role:"CONTRACTING_PARTY"},include:{tenant:true}},unit:{include:{ownerships:{include:{owner:true}},property:{include:{owner:true,manager:true,ownerships:{include:{owner:true}}}}}},ownerBankAccount:true,paymentItems:{where:{active:true},orderBy:{sortOrder:"asc"}},securityDepositTerms:{orderBy:{effectiveFrom:"desc"}},landlordPeriods:{where:{active:true},include:{owner:true},orderBy:{fromPeriod:"desc"}}}});}
export function contractPrefill(lease:NonNullable<Awaited<ReturnType<typeof contractLease>>>) {
  const iso=(d:Date|null|undefined)=>d?d.toISOString().slice(0,10):"";
  const start=iso(lease.startDate),end=iso(lease.endDate),selection=contractLandlord(lease),owner=selection.owner;
  const tenants=[lease.tenant,...lease.parties.map(p=>p.tenant)].filter((t,i,a)=>a.findIndex(v=>v.id===t.id)===i);
  const companyTenant=tenants.some(t=>t.type==="COMPANY");
  const terms=lease.securityDepositTerms.find(t=>t.effectiveFrom<=lease.startDate);
  const services=lease.paymentItems.filter(p=>["WATER","HEATING","ELECTRICITY","SERVICES"].includes(p.category)&&p.validFrom<=lease.startDate&&(!p.validTo||p.validTo>=lease.startDate));
  const manager=lease.unit.property.manager;
  return {companyTenant,landlordSource:selection.source,version:CONTRACT_TEMPLATE_VERSION,initial:{
    term:!end?"INDEFINITE":end<addYear(start)?"SHORT_FIXED":"LONG_FIXED",tenancy:tenants.length>1?"JOINT":"SINGLE",
    landlord:{type:owner?.type==="PERSON"?"PERSON":"COMPANY",name:owner?.name||"",identifier:owner?.type==="PERSON"?iso(owner.dateOfBirth):owner?.ico||"",address:owner?.address||"",email:owner?.email||"",phone:owner?.phone||"",registry:owner?.legalRegistry||"",signer:owner?.type==="PERSON"?owner.name:"",authority:owner?.type==="PERSON"?"osobně":"",represented:false},
    tenants:tenants.map(t=>({name:t.name,birthDate:iso(t.dateOfBirth),address:t.permanentAddress||t.address||"",deliveryAddress:t.correspondenceAddress||t.permanentAddress||t.address||"",email:t.communicationEmail||t.email||"",phone:t.phone||""})),
    manager:{name:manager?.name||"",email:manager?.email||"",phone:manager?.phone||""},
    unit:{address:[lease.unit.property.address,lease.unit.property.postalCode,lease.unit.property.city].filter(Boolean).join(", "),label:lease.unit.label,floor:lease.unit.floor===null?"":String(lease.unit.floor),disposition:lease.unit.dispositionCustom||lease.unit.disposition||"",areaM2:lease.unit.areaM2||0,cadastral:"",accessories:""},
    startDate:start,endDate:end,handoverDate:start,signingDate:"",signingPlace:lease.unit.property.city||"",rentCents:lease.rentCents,
    services:services.length?services.map(s=>({name:s.name,amountCents:s.amountCents})):lease.servicesCents?[{name:"Zálohy na služby – doplňte rozpis",amountCents:lease.servicesCents}]:[],dueDay:lease.dueDay,account:lease.ownerBankAccount?.iban||[lease.ownerBankAccount?.accountNumber,lease.ownerBankAccount?.bankCode].filter(Boolean).join("/"),variableSymbol:lease.variableSymbol||"",firstPaymentDate:"",depositCents:terms?.agreedAmountCents??lease.depositCents,depositDueDate:"",depositAnnualRateBps:terms?.annualRateBps??null,directEnergy:"",occupantCount:tenants.length,attachments:"",confirmed:false,
  }};
}

/** Contract-only archive; the integrity-pinned generic upload service is unchanged. */
export async function archiveContract(actor:NonNullable<Awaited<ReturnType<typeof contractActor>>>,lease:NonNullable<Awaited<ReturnType<typeof contractLease>>>,contract:ReturnType<typeof buildContract>,bytes:Uint8Array) {
  const restricted={...actor,allProperties:false},context={propertyId:lease.unit.propertyId,unitId:lease.unitId,leaseId:lease.id};
  const scope=await authorizeDocumentContext(restricted,context),storage=createFileStorage();
  const originalName=`najemni-smlouva-${lease.id}-${Date.now()}.pdf`,mimeType="application/pdf",metadata=validateFile({bytes,mimeType,originalName});
  const placement=await documentStoragePlacement(storage,context.propertyId,"CONTRACT",originalName);
  let storedKey:string|undefined;
  try {
    const stored=await storage.putObject({key:randomStorageKey(),body:bytes,contentType:mimeType,displayName:placement.displayName,folderId:placement.folderId});storedKey=stored.key;
    return await prisma.$transaction(async tx=>{
      const currentActor=await tx.user.findFirst({where:{id:actor.id,active:true},select:{id:true,role:true}});
      if(!currentActor||currentActor.role==="TENANT")throw new Error("Contract edit access revoked.");
      const currentLease=await tx.lease.findFirst({where:{id:lease.id,unitId:lease.unitId,currency:"CZK",tenant:{type:"PERSON"},parties:{none:{role:"CONTRACTING_PARTY",tenant:{type:"COMPANY"}}},unit:{...portalEditableUnitWhere(currentActor),propertyId:context.propertyId,type:"APARTMENT"}},select:{id:true}});
      if(!currentLease)throw new Error("Contract scope changed or edit access revoked.");
      await requireDocumentCreateAccess({...currentActor,allProperties:false},scope,tx);
      const asset=await tx.fileAsset.create({data:{storageKey:stored.key,uploadedById:actor.id,...metadata}});
      const document=await tx.document.create({data:{...context,fileAssetId:asset.id,category:"CONTRACT",tenantVisible:false,title:`Nájemní smlouva · ${contract.input.tenants.map(t=>t.name).join(" + ")}`,description:`Připraveno k podpisu. Vzor ${contract.version}; ${contract.input.term}; ${contract.input.tenancy}. Smlouva není podepsaná.`,documentDate:new Date(contract.input.signingDate+"T12:00:00Z"),createdById:actor.id}});
      await tx.auditLog.create({data:{userId:actor.id,propertyId:context.propertyId,action:"DOCUMENT_UPLOADED",entityType:"Document",entityId:document.id,details:{...context,documentId:document.id,fileAssetId:asset.id,category:"CONTRACT",originalName,contractSnapshot:JSON.parse(JSON.stringify(contract))}}});
      return document;
    });
  }catch(error){if(storedKey)await storage.deleteObject(storedKey).catch(()=>{});throw error;}
}
