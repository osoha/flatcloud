import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { currentReadings, meterPeriodReadings, readingDate, validateReadingPosition } from '../lib/meter-reading-rules';
import { recordMeterReading } from '../lib/meter-readings';
import { loadServiceSettlementPreview } from '../lib/service-settlement-preview';
const make=(id:string,day:string,value:number,correctsId:string|null=null)=>({id,readAt:readingDate(day),value,correctsId});
let count=0;async function check(name:string,fn:()=>unknown|Promise<unknown>){await fn();console.log(`✓ ${++count}. ${name}`);}
async function main(){
 const a=make('a','2025-01-01',100),b=make('b','2025-12-31',200),c=make('c','2025-12-31',190,'b');
 await check('correction retains original and selects only current version',()=>{assert.deepEqual(currentReadings([c,a,b]).map(r=>r.id),['a','c']);assert.equal(meterPeriodReadings([a,b,c],'2025-01-01','2025-12-31').consumption,90);});
 await check('no inferred boundary or negative consumption',()=>{assert.equal(meterPeriodReadings([a,b],'2025-02-01','2025-12-31').consumption,null);assert.equal(meterPeriodReadings([a,{...b,value:90}],'2025-01-01','2025-12-31').consumption,null);assert.equal(meterPeriodReadings([a,b,{...b,id:'duplicate'}],'2025-01-01','2025-12-31').consumption,null);});
 await check('dates reject overflow and future',()=>{assert.throws(()=>readingDate('2025-02-30'));assert.throws(()=>readingDate('2999-01-01'));});
 await check('duplicates, stale revisions, and chronology rejected',()=>{assert.throws(()=>validateReadingPosition([a,b],b.readAt,200));assert.throws(()=>validateReadingPosition([a,b,c],b.readAt,180,'b'));assert.throws(()=>validateReadingPosition([a,b],readingDate('2025-06-01'),210));assert.throws(()=>validateReadingPosition([a,b],a.readAt,210,'a'));assert.throws(()=>validateReadingPosition([a,b],a.readAt,NaN,'a'));});
 if(process.argv.includes('--rules-only'))return;
 const url=process.env.DATABASE_URL;if(!url||!['localhost','127.0.0.1','postgres'].includes(new URL(url).hostname))throw new Error('Isolated CI database required');
 const db=new PrismaClient();
 try{
 const tag=`R24_AGENT_QA_2026_09 R26C ${crypto.randomUUID()}`;
 const user=await db.user.create({data:{email:`${crypto.randomUUID()}@flatcloud.test`,name:tag,passwordHash:'test-only',role:'SUPER_ADMIN',allProperties:true}});
 const owner=await db.owner.create({data:{name:tag}}),property=await db.property.create({data:{ownerId:owner.id,name:tag,address:'QA 26',city:'Praha'}});
 const unit=await db.unit.create({data:{propertyId:property.id,label:'QA'}}),tenant=await db.tenant.create({data:{name:tag}});
 const lease=await db.lease.create({data:{unitId:unit.id,tenantId:tenant.id,startDate:readingDate('2025-01-01'),financialTrackingFromPeriod:'2025-01',variableSymbol:'26',rentCents:100000,servicesCents:10000,autoChargesEnabled:false}});
 const meter=await db.meter.create({data:{propertyId:property.id,unitId:unit.id,type:'COLD_WATER',unitOfMeasure:'m³',label:tag}});
 const asset=await db.fileAsset.create({data:{storageKey:tag,originalName:'qa.pdf',mimeType:'application/pdf',sizeBytes:10,sha256:tag,uploadedById:user.id}});
 const doc=await db.document.create({data:{propertyId:property.id,unitId:unit.id,fileAssetId:asset.id,title:tag,category:'OTHER',createdById:user.id}});
 const input={propertyId:property.id,unitId:unit.id,meterId:meter.id,readAt:'2025-01-01',value:100,method:'PERSONAL',evidenceDocumentId:doc.id};
 const first=await recordMeterReading(user,input);
 const last=await recordMeterReading(user,{...input,readAt:'2025-12-31',value:200,method:'REMOTE'});
 await check('author, method, unit and original evidence retained',()=>{assert.equal(first.createdById,user.id);assert.equal(first.unitOfMeasure,'m³');assert.equal((first.evidenceSnapshot as any).sha256,tag);});
 await check('reject missing estimate reason, wrong scope and unauthorized writes',async()=>{await assert.rejects(()=>recordMeterReading(user,{...input,readAt:'2025-06-01',value:150,method:'ESTIMATE'}),/odhadu/);await assert.rejects(()=>recordMeterReading(user,{...input,unitId:'other'}),/dostupné/);await assert.rejects(()=>recordMeterReading({id:'stranger',role:'OWNER'},{...input,readAt:'2025-06-01',value:150}),/dostupné/);const other=await db.unit.create({data:{propertyId:property.id,label:'OTHER'}});const privateDoc=await db.document.create({data:{propertyId:property.id,unitId:other.id,fileAssetId:asset.id,title:tag,category:'OTHER',createdById:user.id}});await assert.rejects(()=>recordMeterReading(user,{...input,readAt:'2025-06-01',value:150,evidenceDocumentId:privateDoc.id}),/Důkaz/);});
 await check('concurrent corrections allow exactly one successor; original immutable',async()=>{const results=await Promise.allSettled([190,195].map(value=>recordMeterReading(user,{...input,readAt:'2025-12-31',value,correctsId:last.id,correctionReason:'QA correction'})));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await db.meterReading.findUniqueOrThrow({where:{id:last.id}})).value,200);await assert.rejects(()=>db.meterReading.update({where:{id:last.id},data:{value:999}}),/immutable/);await assert.rejects(()=>db.meterReading.delete({where:{id:last.id}}),/immutable/);});
 await check('retired meter remains in settlement and uses corrected reading',async()=>{await db.meter.update({where:{id:meter.id},data:{active:false}});const preview=await loadServiceSettlementPreview(user,lease.id,'2025-01-01','2025-12-31');assert.equal(preview.meterRows.length,1);assert.match(preview.meterRows[0].label,/vyřazené/);assert.ok([90,95].includes(preview.meterRows[0].consumption!));assert.equal(await db.charge.count({where:{leaseId:lease.id}}),0);});
 await check('archived property remains readable but rejects new reading',async()=>{await db.property.update({where:{id:property.id},data:{active:false}});await assert.rejects(()=>recordMeterReading(user,{...input,readAt:'2025-06-01',value:150}),/archivovaná/);assert.equal((await db.meterReading.findMany({where:{meterId:meter.id}})).length,3);});
 }finally{await db.$disconnect();}
}
main().then(()=>console.log(`R26C1: ${count} kontrol prošlo.`)).catch(e=>{console.error(e);process.exitCode=1;});
