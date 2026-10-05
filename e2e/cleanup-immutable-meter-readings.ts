import type {PrismaClient} from "@prisma/client";

// CI only: remove this test's synthetic readings after all assertions while
// preserving the immutable-reading trigger for every application operation.
export async function cleanupImmutableMeterReadings(db:PrismaClient,meterIds:string[]) {
  if(!process.env.DATABASE_URL||!["localhost","127.0.0.1","postgres"].includes(new URL(process.env.DATABASE_URL).hostname))throw new Error("Isolated CI database required");
  await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('ALTER TABLE "MeterReading" DISABLE TRIGGER "MeterReading_immutable"');
    await tx.meterReading.deleteMany({where:{meterId:{in:meterIds}}});
    await tx.$executeRawUnsafe('ALTER TABLE "MeterReading" ENABLE TRIGGER "MeterReading_immutable"');
  });
}
