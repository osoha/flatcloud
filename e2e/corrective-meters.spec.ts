import {test,expect} from "@playwright/test";
import {PrismaClient} from "@prisma/client";
import {randomUUID} from "node:crypto";

const db=new PrismaClient();
test.beforeAll(()=>{if(!process.env.DATABASE_URL||!["localhost","127.0.0.1","postgres"].includes(new URL(process.env.DATABASE_URL).hostname))throw new Error("Isolated CI database required");});
test.afterAll(()=>db.$disconnect());

test("Profi bulk readings are atomic; Basic keeps a simple entry and full history",async({page})=>{
  const tag=randomUUID();
  const admin=await db.user.findUniqueOrThrow({where:{email:process.env.E2E_ADMIN_EMAIL||"e2e.admin@flatcloud.test"}});
  const owner=await db.owner.create({data:{name:`Meters ${tag}`}});
  const property=await db.property.create({data:{ownerId:owner.id,name:`Meters ${tag}`,address:"QA 1",city:"Praha"}});
  const unit=await db.unit.create({data:{propertyId:property.id,label:"1"}});
  const first=await db.meter.create({data:{propertyId:property.id,unitId:unit.id,type:"COLD_WATER",scope:"UNIT",unitOfMeasure:"m³",label:"Studená voda"}});
  const second=await db.meter.create({data:{propertyId:property.id,unitId:unit.id,type:"HOT_WATER",scope:"UNIT",unitOfMeasure:"m³",label:"Teplá voda"}});
  try {
    await db.meterReading.createMany({data:[first,second].map(meter=>({meterId:meter.id,readAt:new Date("2026-01-01T12:00:00Z"),value:100,unitOfMeasure:"m³",method:"PERSONAL",createdById:admin.id}))});
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(admin.email);
    await page.getByLabel("Heslo").fill(process.env.E2E_ADMIN_PASSWORD||"FlatCloud-E2E-Only-Password-2026");
    await page.getByRole("button",{name:"Přihlásit se",exact:true}).click();
    await expect(page).toHaveURL(/\/portfolio/);
    await page.request.post("/api/display-mode",{form:{mode:"pro",returnTo:"/portfolio"}});
    await page.goto(`/nemovitosti/${property.id}/meridla`);
    await expect(page.getByRole("heading",{name:"Měřidla a odečty"})).toBeVisible();
    await expect(page.getByText("Hromadný odečet")).toBeVisible();
    const path=`/api/properties/${property.id}/meters/bulk-readings`;
    const invalid=await page.request.post(path,{form:{readAt:"2026-02-01",[`value:${first.id}`]:"110",[`value:${second.id}`]:"90"},maxRedirects:0});
    expect(invalid.status()).toBe(303);
    expect(await db.meterReading.count({where:{meterId:{in:[first.id,second.id]}}})).toBe(2);
    const valid=await page.request.post(path,{form:{readAt:"2026-02-01",[`value:${first.id}`]:"110",[`value:${second.id}`]:"120"},maxRedirects:0});
    expect(valid.status()).toBe(303);
    expect(await db.meterReading.count({where:{meterId:{in:[first.id,second.id]}}})).toBe(4);
    await page.request.post("/api/display-mode",{form:{mode:"basic",returnTo:"/portfolio"}});
    await page.goto(`/nemovitosti/${property.id}/jednotky/${unit.id}#meridla`);
    await expect(page.getByText("Zapsat odečet").first()).toBeVisible();
    await expect(page.getByText(/Historie a opravy/).first()).toBeVisible();
  } finally {
    await db.auditLog.deleteMany({where:{propertyId:property.id}});
    // Immutable readings are removed only in isolated tests through the established cleanup helper.
    const {cleanupImmutableMeterReadings}=await import("./cleanup-immutable-meter-readings");
    await cleanupImmutableMeterReadings(db,[first.id,second.id]);
    await db.meter.deleteMany({where:{propertyId:property.id}});
    await db.unit.delete({where:{id:unit.id}});
    await db.property.delete({where:{id:property.id}});
    await db.owner.delete({where:{id:owner.id}});
  }
});
