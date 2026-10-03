import {test,expect} from "@playwright/test";
import {PrismaClient} from "@prisma/client";
import bcrypt from "bcryptjs";
import {randomUUID} from "node:crypto";
import {businessTodayKey} from "../lib/calendar";

const db=new PrismaClient();
test.beforeAll(()=>{if(!process.env.DATABASE_URL||!["localhost","127.0.0.1","postgres"].includes(new URL(process.env.DATABASE_URL).hostname))throw new Error("Isolated CI database required");});
test.afterAll(()=>db.$disconnect());

test("tenant account sees only its lease, can report a defect and record its own meter",async({page})=>{
  const tag=randomUUID(),password="Portal-QA-Only-2026";
  const actor=await db.user.create({data:{email:`portal-${tag}@flatcloud.test`,name:"Nájemník QA",passwordHash:await bcrypt.hash(password,10),role:"TENANT",isTestIdentity:true}});
  const owner=await db.owner.create({data:{name:`Portál QA ${tag}`}});
  const property=await db.property.create({data:{name:`Portál QA ${tag}`,ownerId:owner.id,address:"Testovací 1",city:"Praha"}});
  const unit=await db.unit.create({data:{propertyId:property.id,label:"1"}});
  const otherUnit=await db.unit.create({data:{propertyId:property.id,label:"2"}});
  const tenant=await db.tenant.create({data:{name:`Nájemník ${tag}`,email:actor.email}});
  const other=await db.tenant.create({data:{name:`Cizí nájemník ${tag}`}});
  const lease=await db.lease.create({data:{unitId:unit.id,tenantId:tenant.id,startDate:new Date("2025-01-01T12:00:00Z"),financialTrackingFromPeriod:"2025-01",variableSymbol:"7654321",rentCents:120000,servicesCents:0}});
  const otherLease=await db.lease.create({data:{unitId:otherUnit.id,tenantId:other.id,startDate:new Date("2025-01-01T12:00:00Z"),financialTrackingFromPeriod:"2025-01",variableSymbol:"7654322",rentCents:120000,servicesCents:0}});
  const meter=await db.meter.create({data:{propertyId:property.id,unitId:unit.id,scope:"UNIT",type:"COLD_WATER",unitOfMeasure:"m³",label:"Vodoměr"}});
  const otherMeter=await db.meter.create({data:{propertyId:property.id,unitId:otherUnit.id,scope:"UNIT",type:"COLD_WATER",unitOfMeasure:"m³",label:"Cizí vodoměr"}});
  await db.tenantPortalAccess.create({data:{userId:actor.id,tenantId:tenant.id}});
  try {
    await page.goto("/login");await page.getByLabel("E-mail").fill(actor.email);await page.getByLabel("Heslo").fill(password);
    await page.getByRole("button",{name:"Přihlásit se",exact:true}).click();
    await expect(page).toHaveURL(new RegExp(`/portal/najemnik/${tenant.id}`));
    await expect(page.getByText("Vodoměr")).toBeVisible();
    expect((await page.goto(`/portal/najemnik/${other.id}`))?.status()).toBe(404);
    await page.goto("/portfolio");await expect(page).toHaveURL(/\/portal\/najemnik/);
    const rejected=await page.request.post(`/api/portal/tenants/${other.id}/readings`,{form:{leaseId:otherLease.id,meterId:otherMeter.id,readAt:businessTodayKey(),value:"20"}});
    expect(rejected.status()).toBe(303);
    expect(await db.meterReading.count({where:{meterId:otherMeter.id}})).toBe(0);
    await page.goto(`/portal/najemnik/${tenant.id}`);
    await page.getByLabel("Co se stalo?").fill("Netěsní kohoutek");await page.getByLabel("Popis závady").fill("Kohoutek v kuchyni kapká již dva dny.");
    await page.getByRole("button",{name:"Předat závadu"}).click();
    const defect=await db.task.findFirstOrThrow({where:{tenantId:tenant.id,createdById:actor.id}});
    expect(defect.leaseId).toBe(lease.id);expect(defect.category).toBe("MAINTENANCE");
    await page.getByLabel("Nový stav (m³)").fill("12.5");await page.getByRole("button",{name:"Uložit odečet"}).click();
    expect((await db.meterReading.findFirstOrThrow({where:{meterId:meter.id}})).value).toBe(12.5);
    expect(await db.meterReading.count({where:{meterId:otherMeter.id}})).toBe(0);
  }finally{
    await db.auditLog.deleteMany({where:{userId:actor.id}});
    await db.task.deleteMany({where:{tenantId:tenant.id}});
    await db.meterReading.deleteMany({where:{meterId:meter.id}});
    await db.tenantPortalAccess.deleteMany({where:{userId:actor.id}});
    await db.meter.deleteMany({where:{propertyId:property.id}});
    await db.lease.deleteMany({where:{id:{in:[lease.id,otherLease.id]}}});
    await db.tenant.deleteMany({where:{id:{in:[tenant.id,other.id]}}});
    await db.unit.deleteMany({where:{propertyId:property.id}});
    await db.property.delete({where:{id:property.id}});
    await db.owner.delete({where:{id:owner.id}});
    await db.user.delete({where:{id:actor.id}});
  }
});
