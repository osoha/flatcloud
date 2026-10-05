import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import sharp from "sharp";
import {prisma} from "../lib/db";
import {prepareTenantMeterPhoto,recordTenantMeterReading,tenantMeterValue,TENANT_METER_PHOTO_MAX_BYTES} from "../lib/tenant-meter-readings";
import type {FileStorage,PutObjectInput} from "../lib/storage/types";
import {cleanupImmutableMeterReadings} from "../e2e/cleanup-immutable-meter-readings";

class MemoryStorage implements FileStorage {
  objects=new Map<string,Uint8Array>();
  onFirstPut?:()=>Promise<void>;
  failPutAt=0;puts=0;
  async putObject(input:PutObjectInput){this.puts++;if(this.failPutAt===this.puts)throw new Error("Simulated storage failure");this.objects.set(input.key,input.body);if(this.puts===1)await this.onFirstPut?.();return {key:input.key};}
  async deleteObject(key:string){this.objects.delete(key);}
  async getObject(key:string){const object=this.objects.get(key);if(!object)throw new Error("Missing object");return object;}
  async getSignedDownloadUrl(){throw new Error("Private memory storage has no public URLs");return "";}
  async exists(key:string){return this.objects.has(key);}
}
let count=0;
async function check(name:string,fn:()=>unknown|Promise<unknown>){await fn();console.log(`✓ ${++count}. ${name}`);}
function photoForm(bytes:Uint8Array,mimeType="image/png",name="vodomer.png") {const form=new FormData();form.append("photo",new File([Buffer.from(bytes)],name,{type:mimeType}));return form;}

async function main(){
  const png=await sharp({create:{width:20,height:20,channels:3,background:"#d7e4e7"}}).png().toBuffer();
  const photo=await prepareTenantMeterPhoto(photoForm(png));assert.ok(photo);
  await check("decimal dot/comma remain exact; empty, nondecimal and invalid values rejected",()=>{
    assert.equal(tenantMeterValue("123,456"),123.456);assert.equal(tenantMeterValue("0.125"),0.125);
    for(const value of [""," ","0x10","Infinity","NaN","-1","1,2,3"])assert.throws(()=>tenantMeterValue(value));
  });
  await check("photo is optional; PNG, JPEG and WebP decode successfully",async()=>{
    assert.equal(await prepareTenantMeterPhoto(new FormData()),null);
    for(const mime of ["image/jpeg","image/webp"]){const image=await sharp(png).toFormat(mime==="image/jpeg"?"jpeg":"webp").toBuffer();assert.ok(await prepareTenantMeterPhoto(photoForm(image,mime)));}
  });
  await check("corrupt, forged, oversized, empty and multiple photos are rejected",async()=>{
    await assert.rejects(()=>prepareTenantMeterPhoto(photoForm(Buffer.from("not an image"))),/nepoškozený/);
    await assert.rejects(()=>prepareTenantMeterPhoto(photoForm(png,"application/pdf")),/formátu/);
    await assert.rejects(()=>prepareTenantMeterPhoto(photoForm(new Uint8Array(TENANT_METER_PHOTO_MAX_BYTES+1))),/8 MB/);
    await assert.rejects(()=>prepareTenantMeterPhoto(photoForm(new Uint8Array())),/8 MB/);
    const many=photoForm(png);many.append("photo",new File([png],"druhy.png",{type:"image/png"}));await assert.rejects(()=>prepareTenantMeterPhoto(many),/nejvýše jednu/);
    const corrupt=Buffer.from(png.subarray(0,30));await assert.rejects(()=>prepareTenantMeterPhoto(photoForm(corrupt)),/nepoškozený/);
  });
  if(process.argv.includes("--rules-only"))return;
  const url=process.env.DATABASE_URL;if(!url||!["localhost","127.0.0.1","postgres"].includes(new URL(url).hostname))throw new Error("Isolated CI database required");
  const tag=`PORTAL_METER_PHOTO_${randomUUID()}`;
  const actor=await prisma.user.create({data:{name:tag,email:`${tag}@flatcloud.test`,passwordHash:"test-only",role:"TENANT",isTestIdentity:true}});
  const owner=await prisma.owner.create({data:{name:tag}});
  const property=await prisma.property.create({data:{name:tag,ownerId:owner.id,address:"Testovací 1",city:"Praha"}});
  const unit=await prisma.unit.create({data:{propertyId:property.id,label:"1"}});
  const otherUnit=await prisma.unit.create({data:{propertyId:property.id,label:"2"}});
  const tenant=await prisma.tenant.create({data:{name:tag,email:actor.email}});
  const otherTenant=await prisma.tenant.create({data:{name:`${tag}_OTHER`}});
  const lease=await prisma.lease.create({data:{unitId:unit.id,tenantId:tenant.id,startDate:new Date("2025-01-01T12:00:00Z"),financialTrackingFromPeriod:"2025-01",variableSymbol:tag,rentCents:100000,servicesCents:0,autoChargesEnabled:false}});
  const otherLease=await prisma.lease.create({data:{unitId:otherUnit.id,tenantId:otherTenant.id,startDate:new Date("2025-01-01T12:00:00Z"),financialTrackingFromPeriod:"2025-01",variableSymbol:`${tag}_OTHER`,rentCents:100000,servicesCents:0,autoChargesEnabled:false}});
  const meter=await prisma.meter.create({data:{propertyId:property.id,unitId:unit.id,type:"COLD_WATER",unitOfMeasure:"m³",label:"Vodoměr"}});
  const otherMeter=await prisma.meter.create({data:{propertyId:property.id,unitId:otherUnit.id,type:"COLD_WATER",unitOfMeasure:"m³"}});
  await prisma.tenantPortalAccess.create({data:{userId:actor.id,tenantId:tenant.id}});
  const input={tenantId:tenant.id,leaseId:lease.id,meterId:meter.id,readAt:"2025-01-02",value:12.125};
  const storage=new MemoryStorage();
  try{
    await check("own decimal reading without attachment keeps value, unit and lease",async()=>{
      const reading=await recordTenantMeterReading(actor,input,storage);
      assert.equal(reading.value,12.125);assert.equal(reading.unitOfMeasure,"m³");assert.equal(reading.leaseId,lease.id);assert.equal(reading.evidenceDocumentId,null);assert.equal(storage.objects.size,0);
    });
    await check("photo, immutable reading and audit share the exact private lease context",async()=>{
      const reading=await recordTenantMeterReading(actor,{...input,readAt:"2025-01-03",value:13.625,photo},storage);
      assert.ok(reading.evidenceDocumentId);
      const document=await prisma.document.findUniqueOrThrow({where:{id:reading.evidenceDocumentId},include:{fileAsset:true}});
      assert.equal(document.leaseId,lease.id);assert.equal(document.unitId,unit.id);assert.equal(document.propertyId,property.id);assert.equal(document.tenantVisible,true);
      assert.equal(document.category,"PHOTO");assert.equal(document.createdById,actor.id);assert.equal(document.fileAsset.mimeType,"image/png");assert.equal(storage.objects.size,3);
      assert.equal((reading.evidenceSnapshot as {sha256:string}).sha256,document.fileAsset.sha256);
      assert.equal(await prisma.auditLog.count({where:{entityId:reading.id,action:"TENANT_METER_READING_CREATED"}}),1);
    });
    await check("cross-lease, inactive-meter, payer, preview and pre-lease writes have no side effects",async()=>{
      const denied=new MemoryStorage();
      for(const mutation of [{leaseId:otherLease.id},{meterId:otherMeter.id},{tenantId:otherTenant.id},{readAt:"2024-12-31"}])await assert.rejects(()=>recordTenantMeterReading(actor,{...input,readAt:"2025-01-04",value:14,photo,...mutation},denied));
      await assert.rejects(()=>recordTenantMeterReading({...actor,role:"SUPER_ADMIN"},{...input,readAt:"2025-01-04",value:14,photo},denied),/náhledu/);
      await prisma.leaseParty.create({data:{leaseId:otherLease.id,tenantId:tenant.id,role:"PAYER"}});
      await assert.rejects(()=>recordTenantMeterReading(actor,{...input,leaseId:otherLease.id,meterId:otherMeter.id,readAt:"2025-01-04",value:14,photo},denied),/přístup/);
      await prisma.meter.update({where:{id:meter.id},data:{active:false}});
      await assert.rejects(()=>recordTenantMeterReading(actor,{...input,readAt:"2025-01-04",value:14,photo},denied),/dostupné/);
      await prisma.meter.update({where:{id:meter.id},data:{active:true}});
      assert.equal(denied.puts,0);assert.equal(await prisma.meterReading.count({where:{meterId:meter.id}}),2);
    });
    await check("duplicate and decreasing readings retain domain correction policy",async()=>{
      await assert.rejects(()=>recordTenantMeterReading(actor,{...input,value:12},storage),/opravit.*správce/);
      await assert.rejects(()=>recordTenantMeterReading(actor,{...input,readAt:"2025-01-04",value:11},storage),/výměně měřidla.*správce/);
      assert.equal(await prisma.meterReading.count({where:{meterId:meter.id}}),2);
    });
    await check("failed storage removes all partial objects and creates no records",async()=>{
      const failed=new MemoryStorage();failed.failPutAt=3;
      await assert.rejects(()=>recordTenantMeterReading(actor,{...input,readAt:"2025-01-04",value:14,photo},failed),/storage failure/);
      assert.equal(failed.objects.size,0);assert.equal(await prisma.document.count({where:{leaseId:lease.id}}),1);
      assert.equal(await prisma.meterReading.count({where:{meterId:meter.id}}),2);
    });
    await check("access revoked during photo upload rolls back evidence and cleans storage",async()=>{
      const revoked=new MemoryStorage();revoked.onFirstPut=async()=>{await prisma.tenantPortalAccess.delete({where:{userId_tenantId:{userId:actor.id,tenantId:tenant.id}}});};
      await assert.rejects(()=>recordTenantMeterReading(actor,{...input,readAt:"2025-01-04",value:14,photo},revoked),/přístup/);
      assert.equal(revoked.objects.size,0);assert.equal(await prisma.document.count({where:{leaseId:lease.id}}),1);
      await prisma.tenantPortalAccess.create({data:{userId:actor.id,tenantId:tenant.id}});
    });
    await check("concurrent submissions create one reading and one complete photo only",async()=>{
      const stores=[new MemoryStorage(),new MemoryStorage()];
      const results=await Promise.allSettled(stores.map(store=>recordTenantMeterReading(actor,{...input,readAt:"2025-01-04",value:14,photo},store)));
      assert.equal(results.filter(result=>result.status==="fulfilled").length,1);
      assert.deepEqual(stores.map(store=>store.objects.size).sort(),[0,3]);
      assert.equal(await prisma.meterReading.count({where:{meterId:meter.id}}),3);assert.equal(await prisma.document.count({where:{leaseId:lease.id}}),2);
    });
  }finally{
    await cleanupImmutableMeterReadings(prisma,[meter.id,otherMeter.id]);
    await prisma.document.deleteMany({where:{leaseId:lease.id}});await prisma.fileAsset.deleteMany({where:{uploadedById:actor.id}});
    await prisma.auditLog.deleteMany({where:{userId:actor.id}});await prisma.tenantPortalAccess.deleteMany({where:{userId:actor.id}});
    await prisma.meter.deleteMany({where:{propertyId:property.id}});await prisma.leaseParty.deleteMany({where:{tenantId:tenant.id}});
    await prisma.lease.deleteMany({where:{id:{in:[lease.id,otherLease.id]}}});await prisma.tenant.deleteMany({where:{id:{in:[tenant.id,otherTenant.id]}}});
    await prisma.unit.deleteMany({where:{propertyId:property.id}});await prisma.property.delete({where:{id:property.id}});await prisma.owner.delete({where:{id:owner.id}});await prisma.user.delete({where:{id:actor.id}});
  }
}
main().then(()=>console.log(`Tenant meter photos: ${count} kontrol prošlo.`)).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
