import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './db';
import { businessDateKey } from './calendar';
import { effectiveLeaseEnd } from './lease-lifecycle-core';
import { hasAllPropertyAccess } from './auth';
import { documentAccessWhere } from './documents/access';
import { serializableTransaction } from './serializable';
import { OWNER_COST_WARNING, sourceMoney, validateSource, type SourcePayload } from './settlement-source-rules';
export type SourceActor={id:string;role:string;allProperties?:boolean};
export function sourcePropertyWhere(actor:SourceActor,edit=false):Prisma.PropertyWhereInput {return {...(edit?{active:true}:{}),...(hasAllPropertyAccess(actor)?{}:{memberships:{some:{userId:actor.id,...(edit?{permission:{in:['EDIT','ADMIN'] as ('EDIT'|'ADMIN')[]}}:{})}}})};}
export async function sourceAccess(actor:SourceActor,propertyId:string,edit=false,tx:Prisma.TransactionClient=prisma){const p=await tx.property.findFirst({where:{id:propertyId,...sourcePropertyWhere(actor,edit)},select:{id:true,name:true,active:true}});if(!p)throw new Error('Podklady vyžadují oprávnění k celému domu; zápis jen u aktivní nemovitosti.');return p;}
function identity(p:SourcePayload){return createHash('sha256').update(JSON.stringify([p.kind,p.vendor.trim().toLocaleLowerCase('cs'),p.reference.trim().toLocaleLowerCase('cs'),p.kind==='EXTERNAL'?p.mode:'',p.kind==='EXTERNAL'?p.unitId:''])).digest('hex');}
async function validateReferences(tx:Prisma.TransactionClient,actor:SourceActor,propertyId:string,p:SourcePayload,documentId:string|null){
 const units=[...new Set([p.unitId,...p.lines.map(l=>l.unitId)].filter(Boolean))];if(await tx.unit.count({where:{id:{in:units},propertyId}})!==units.length)throw new Error('Jednotka nepatří do této nemovitosti.');
 for(const line of p.lines.filter(l=>l.leaseId)){const lease=await tx.lease.findFirst({where:{id:line.leaseId,unitId:line.unitId,unit:{propertyId}}});if(!lease)throw new Error('Nájemní vztah nepatří vybrané jednotce.');const start=businessDateKey(lease.startDate),endDate=effectiveLeaseEnd(lease),end=endDate?businessDateKey(endDate):null;if(line.from<start||(end&&line.to>end))throw new Error('Nákladový řádek přesahuje platnost zvoleného nájemního vztahu.');}
 if(p.propertyCostId){const cost=await tx.propertyCost.findFirst({where:{id:p.propertyCostId,propertyId,status:'ACTUAL',kind:'OPEX'}});if(!cost||cost.amountCents!==sourceMoney(p.supplyAmount))throw new Error('Vázaný OPEX náklad musí být skutečný a shodný s nákladem dodávky, nikoli s doplatkem.');}
 if(p.creditForId){const original=await tx.settlementSource.findFirst({where:{id:p.creditForId,propertyId,confirmedAt:{not:null}}});if(!original||(original.payload as unknown as SourcePayload).kind!=='INVOICE')throw new Error('Původní potvrzená faktura nebyla nalezena.');}
 if(documentId){const doc=await tx.document.findFirst({where:{id:documentId,propertyId,...documentAccessWhere(actor),fileAsset:{deletedAt:null}},include:{fileAsset:true}});if(!doc)throw new Error('Originál není dostupný v dokumentech této nemovitosti.');return doc;}return null;
}
export async function createSettlementSource(actor:SourceActor,propertyId:string,input:unknown,documentId:string|null,previousId?:string|null){
 const p=validateSource(input);return serializableTransaction(async tx=>{await sourceAccess(actor,propertyId,true,tx);await validateReferences(tx,actor,propertyId,p,documentId);
 const key=identity(p);let version=1;
 if(previousId){const prev=await tx.settlementSource.findFirst({where:{id:previousId,propertyId},include:{next:{select:{id:true}}}});if(!prev||prev.next)throw new Error('Opravujte nejnovější verzi podkladu.');if(prev.identityKey!==key)throw new Error('Oprava musí zachovat typ, dodavatele, číslo dokladu a rozsah externího výsledku.');if(p.revisionReason.length<10)throw new Error('Doplňte konkrétní důvod opravy (alespoň 10 znaků).');version=prev.version+1;
 }else if(await tx.settlementSource.findFirst({where:{propertyId,identityKey:key}}))throw new Error('Duplicitní doklad. Otevřete původní podklad a vytvořte opravu.');
 const source=await tx.settlementSource.create({data:{propertyId,documentId,identityKey:key,version,previousId:previousId||null,payload:p as unknown as Prisma.InputJsonValue,createdById:actor.id}});
 await tx.auditLog.create({data:{userId:actor.id,propertyId,action:'SETTLEMENT_SOURCE_DRAFT',entityType:'SettlementSource',entityId:source.id,details:{version,previousId:previousId||null,revisionReason:p.revisionReason}}});return source;
 });
}
export async function confirmSettlementSource(actor:SourceActor,propertyId:string,id:string,confirmed:boolean,ownerWarningConfirmed:boolean){
 if(!confirmed)throw new Error('Potvrďte kontrolu originálu a všech načtených údajů.');
 return serializableTransaction(async tx=>{await sourceAccess(actor,propertyId,true,tx);const s=await tx.settlementSource.findFirst({where:{id,propertyId},include:{next:{select:{id:true}}}});if(!s)throw new Error('Podklad nebyl nalezen.');if(s.confirmedAt)throw new Error('Podklad už byl potvrzen.');if(s.next)throw new Error('Potvrdit lze jen nejnovější verzi.');
 const p=validateSource(s.payload);if(!s.documentId)throw new Error('Nejdříve připojte originál: vytvořte opravu a vyberte dokument.');const doc=await validateReferences(tx,actor,propertyId,p,s.documentId);
 const overrides=p.lines.filter(l=>l.ownerOverride);if(overrides.length&&!ownerWarningConfirmed)throw new Error(OWNER_COST_WARNING);
 // Same original cannot be confirmed twice under another reference in the same scope.
 const candidates=await tx.settlementSource.findMany({where:{propertyId,confirmedAt:{not:null},identityKey:{not:s.identityKey},document:{fileAsset:{sha256:doc!.fileAsset.sha256}}}});
 if(candidates.some(c=>{const other=c.payload as unknown as SourcePayload;return p.kind!== 'EXTERNAL'||other.kind!=='EXTERNAL'||p.mode==='HOUSE'||other.mode==='HOUSE'||p.unitId===other.unitId;}))throw new Error('Stejný originál už byl potvrzen v překrývajícím se rozsahu.');
 if(p.propertyCostId){const other=await tx.settlementSource.findFirst({where:{propertyId,confirmedAt:{not:null},identityKey:{not:s.identityKey},payload:{path:['propertyCostId'],equals:p.propertyCostId}}});if(other)throw new Error('Tento evidovaný náklad už je připojen k jinému potvrzenému dokladu.');}
 const confirmation={documentId:doc!.id,fileAssetId:doc!.fileAssetId,sha256:doc!.fileAsset.sha256,ownerWarning:overrides.length?OWNER_COST_WARNING:null,overrides:overrides.map(l=>({key:l.key,service:l.service,reason:l.ownerReason})),actualSupplyCostConfirmed:true};
 const result=await tx.settlementSource.update({where:{id},data:{confirmedAt:new Date(),confirmedById:actor.id,confirmation}});
 await tx.auditLog.create({data:{userId:actor.id,propertyId,action:'SETTLEMENT_SOURCE_CONFIRMED',entityType:'SettlementSource',entityId:id,details:confirmation}});return result;
 });
}
