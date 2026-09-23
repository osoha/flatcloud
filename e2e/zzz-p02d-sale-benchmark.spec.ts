import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma as db } from "../lib/db";
import { loadPropertySaleBenchmark, upsertSaleBenchmarkSnapshot, type SaleBenchmarkInput } from "../lib/reporting/sale-benchmark";
import { createUnitValuationSnapshot } from "../lib/distribution/unit-valuations";
import { R24_ROLE_PASSWORD, R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";

const adminEmail=process.env.E2E_ADMIN_EMAIL||"e2e.admin@flatcloud.test";
const adminPassword=process.env.E2E_ADMIN_PASSWORD||"FlatCloud-E2E-Only-Password-2026";
const rolePassword=process.env.E2E_ROLE_PASSWORD||R24_ROLE_PASSWORD;

test.beforeAll(()=>{if(!["localhost","127.0.0.1","postgres"].includes(new URL(process.env.DATABASE_URL!).hostname))throw new Error("P02D fixtures require isolated local/CI DB");});
test.afterAll(async()=>{await db.$disconnect()});

async function login(page:Page,email=adminEmail,password=adminPassword){await page.goto("/login");await page.getByLabel("E-mail",{exact:true}).fill(email);await page.getByLabel("Heslo",{exact:true}).fill(password);await page.getByRole("button",{name:"Přihlásit se",exact:true}).click();await expect(page).toHaveURL(/\/portfolio/)}

function input(suffix:string,overrides:Partial<SaleBenchmarkInput>={}):SaleBenchmarkInput{return {source:"SREALITY_PRICE_MAP",metric:"REALIZED_AVERAGE",sourceLocalityType:"ward",sourceLocalityId:`p02d-${suffix}`,sourceLocalityName:"Testovací katastr",territoryCode:`p02d/territory-${suffix}`,ruianCadastralCode:"999999",cadastralName:"Testovací katastr",municipalityName:"Test",marketYear:2026,marketQuarter:2,windowFrom:new Date("2026-04-01T12:00:00Z"),windowTo:new Date("2026-06-30T12:00:00Z"),pricePerSqmCents:9_000_000,sampleCount:20,mappingQuality:"EXACT",baselinePartial:false,acceptedSampleCount:20,rejectedSampleCount:0,sourceUrl:"https://www.sreality.cz/cenova-mapa",parserVersion:"e2e-1",methodVersion:"sale-benchmark-v1",retrievedAt:new Date("2026-07-01T12:00:00Z"),...overrides}}

test("P02D import is idempotent, corrected in place and audited",async()=>{
  const actor=await db.user.findUniqueOrThrow({where:{email:adminEmail}}),suffix=randomUUID(),rollback=new Error("rollback P02D import fixture");
  await expect(db.$transaction(async tx=>{
    const first=await upsertSaleBenchmarkSnapshot(actor,input(suffix),tx),same=await upsertSaleBenchmarkSnapshot(actor,input(suffix),tx),changed=await upsertSaleBenchmarkSnapshot(actor,input(suffix,{pricePerSqmCents:9_100_000}),tx);
    expect(first.changed).toBe(true);expect(same.changed).toBe(false);expect(changed.changed).toBe(true);
    expect(await tx.saleBenchmarkSnapshot.count({where:{sourceLocalityId:`p02d-${suffix}`}})).toBe(1);
    expect(await tx.auditLog.count({where:{entityType:"SaleBenchmarkSnapshot",entityId:first.snapshot.id}})).toBe(2);
    await expect(upsertSaleBenchmarkSnapshot({id:actor.id,role:"MANAGER"},input(`${suffix}-denied`),tx)).rejects.toThrow("super-admin");
    throw rollback;
  })).rejects.toBe(rollback);
});

test("P02D reports missing coverage, computes trend and requires explicit valuation confirmation",async({page,browser})=>{
  const actor=await db.user.findUniqueOrThrow({where:{email:adminEmail}}),suffix=randomUUID();
  const owner=await db.owner.create({data:{name:`P02D owner ${suffix}`}});
  const property=await db.property.create({data:{name:`P02D property ${suffix}`,address:"Benchmarková 1",city:"Test",ownerId:owner.id,flatcloudConsolidationBasisPoints:10_000}});
  const [covered,missing]=await Promise.all([db.unit.create({data:{propertyId:property.id,label:"A",areaM2:50,type:"APARTMENT"}}),db.unit.create({data:{propertyId:property.id,label:"B",areaM2:null,type:"APARTMENT"}})]);
  await db.propertyMfRentLocation.create({data:{propertyId:property.id,territoryCode:`p02d/territory-${suffix}`,territoryName:"Testovací katastr",confirmedById:actor.id}});
  const previous=await upsertSaleBenchmarkSnapshot(actor,input(suffix,{marketQuarter:1,windowFrom:new Date("2026-01-01T12:00:00Z"),windowTo:new Date("2026-03-31T12:00:00Z"),pricePerSqmCents:8_000_000,retrievedAt:new Date("2026-04-01T12:00:00Z")}),db);
  const current=await upsertSaleBenchmarkSnapshot(actor,input(suffix),db);
  try{
    const incomplete=await loadPropertySaleBenchmark(property.id);expect(incomplete?.benchmarkValueCents).toBeNull();expect(incomplete?.coveredUnits).toBe(1);expect(incomplete?.totalUnits).toBe(2);expect(incomplete?.qoqBps).toBe(1_250);
    await db.unit.update({where:{id:missing.id},data:{areaM2:40}});
    const complete=await loadPropertySaleBenchmark(property.id);expect(complete?.benchmarkValueCents).toBe(810_000_000);

    await login(page);
    await page.goto("/nastaveni/cenovy-benchmark");
    await expect(page.getByRole("heading",{name:"Prodejní cenový benchmark"})).toBeVisible();
    const missingConfirmation=await page.request.post(`/api/properties/${property.id}/sale-benchmark/accept-unit`,{form:{unitId:covered.id,snapshotId:current.snapshot.id},maxRedirects:0});expect(missingConfirmation.status()).toBe(303);expect(await db.unitValuationSnapshot.count({where:{unitId:covered.id,source:"MARKET_BENCHMARK"}})).toBe(0);
    const valuationRollback=new Error("rollback P02D valuation fixture");
    await expect(db.$transaction(async tx=>{const valuation=await createUnitValuationSnapshot(actor,property.id,covered.id,{marketValueCents:450_000_000,source:"MARKET_BENCHMARK",valuationDate:current.snapshot.windowTo,reference:`P02D:${current.snapshot.id}`},tx);expect(Number(valuation.marketValueCents)).toBe(450_000_000);expect(valuation.reference).toBe(`P02D:${current.snapshot.id}`);throw valuationRollback})).rejects.toBe(valuationRollback);
    expect(await db.unitValuationSnapshot.count({where:{unitId:covered.id,source:"MARKET_BENCHMARK"}})).toBe(0);

    const managerPage=await browser.newPage();await login(managerPage,R24_ROLE_USERS.assetManager,rolePassword);await managerPage.goto("/nastaveni/cenovy-benchmark");await expect(managerPage).toHaveURL(/\/portfolio/);await managerPage.close();
  }finally{
    await db.auditLog.deleteMany({where:{OR:[{propertyId:property.id},{entityType:"SaleBenchmarkSnapshot",entityId:{in:[previous.snapshot.id,current.snapshot.id]}}]}});
    await db.property.delete({where:{id:property.id}});
    await db.owner.delete({where:{id:owner.id}});
    await db.saleBenchmarkSnapshot.deleteMany({where:{id:{in:[previous.snapshot.id,current.snapshot.id]}}});
  }
});
