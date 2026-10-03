import {test,expect} from "@playwright/test";
import {PrismaClient} from "@prisma/client";
import {randomUUID} from "node:crypto";
import {runMeterTaskAutomation} from "../lib/meter-task-automation";
import {cleanupImmutableMeterReadings} from "./cleanup-immutable-meter-readings";

const db=new PrismaClient();
test.afterAll(()=>db.$disconnect());
test("90-day and annual meter reminders share one tracked task and close after readings",async()=>{
  if(!process.env.DATABASE_URL||!["localhost","127.0.0.1","postgres"].includes(new URL(process.env.DATABASE_URL).hostname))throw new Error("Isolated CI database required");
  const tag=randomUUID();
  const owner=await db.owner.create({data:{name:`Odečty QA ${tag}`}});
  const property=await db.property.create({data:{ownerId:owner.id,name:`Odečty QA ${tag}`,address:"Testovací 1",city:"Praha"}});
  const unit=await db.unit.create({data:{propertyId:property.id,label:"1"}});
  const meter=await db.meter.create({data:{propertyId:property.id,unitId:unit.id,scope:"UNIT",type:"COLD_WATER",unitOfMeasure:"m³",label:"Vodoměr QA"}});
  try{
    await db.meterReading.create({data:{meterId:meter.id,readAt:new Date("2026-01-01T12:00:00Z"),value:100,method:"PERSONAL",unitOfMeasure:"m³"}});
    expect((await runMeterTaskAutomation(new Date("2026-10-03T12:00:00Z"),property.id)).created).toBe(1);
    expect((await runMeterTaskAutomation(new Date("2026-10-03T12:00:00Z"),property.id)).created).toBe(0);
    const task=await db.task.findFirstOrThrow({where:{propertyId:property.id,unitId:unit.id}});
    expect(await db.taskChecklistItem.count({where:{taskId:task.id}})).toBe(1);
    await runMeterTaskAutomation(new Date("2026-12-01T12:00:00Z"),property.id);
    expect(await db.task.count({where:{propertyId:property.id}})).toBe(1);
    expect(await db.taskChecklistItem.count({where:{taskId:task.id}})).toBe(2);
    await db.meterReading.create({data:{meterId:meter.id,readAt:new Date("2026-12-31T12:00:00Z"),value:110,method:"PERSONAL",unitOfMeasure:"m³"}});
    expect((await runMeterTaskAutomation(new Date("2026-12-31T15:00:00Z"),property.id)).closed).toBe(1);
    expect((await runMeterTaskAutomation(new Date("2026-12-31T15:00:00Z"),property.id)).created).toBe(0);
    expect((await db.task.findUniqueOrThrow({where:{id:task.id}})).status).toBe("DONE");
    expect(await db.task.count({where:{propertyId:property.id}})).toBe(1);
  }finally{
    await db.task.deleteMany({where:{propertyId:property.id}});
    await cleanupImmutableMeterReadings(db,[meter.id]);
    await db.meter.delete({where:{id:meter.id}});
    await db.unit.delete({where:{id:unit.id}});
    await db.property.delete({where:{id:property.id}});
    await db.owner.delete({where:{id:owner.id}});
  }
});
