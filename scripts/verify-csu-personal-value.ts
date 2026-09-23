import assert from "node:assert/strict";
import { parseCsuApartmentIndex,parseCsuApartmentAverage } from "../lib/reporting/csu-apartment-index";
import { csuDistrictForCity,selectCsuAverage } from "../lib/reporting/csu-location";

const now="2026-07-15T04:00:00.000Z";
const axis=(keys:string[])=>({category:{index:Object.fromEntries(keys.map((key,index)=>[key,index]))}});
const index={class:"dataset",updated:now,id:["CASRQ2","UZ02HN","IndicatorType","TYPUDAJENEM","REPRCENNEM4"],size:[4,3,1,2,2],dimension:{CASRQ2:axis(["2025-Q1","2025-Q2","2025-Q3","2025-Q4"]),UZ02HN:axis(["CZ","CZ032","CZ042"]),IndicatorType:axis(["6144"]),TYPUDAJENEM:axis(["IZ2015","IR"]),REPRCENNEM4:axis(["10302","10602"])},value:Array(4*3*1*2*2).fill(null) as Array<number|null>};
index.value[(((3*3+1)*1+0)*2+0)*2+1]=182.4;
index.value[(((3*3+0)*1+0)*2+0)*2+1]=170.1;
assert.deepEqual(parseCsuApartmentIndex(index).rows.find(row=>row.territoryCode==="CZ032"&&row.marketQuarter===4),{territoryCode:"CZ032",marketYear:2025,marketQuarter:4,indexBasisPoints:18_240});
assert.throws(()=>parseCsuApartmentIndex({...index,size:[4,3,1,2,3]}));

const average={class:"dataset",updated:now,id:["CAS1R3R1","REPRCENNEM","IndicatorType","Uz023h22","VELSKUPOBC"],size:[2,2,1,3,2],dimension:{CAS1R3R1:axis(["2025","2023-2025"]),REPRCENNEM:axis(["10302","10602"]),IndicatorType:axis(["7432"]),Uz023h22:axis(["CZ","CZ032","CZ0323"]),VELSKUPOBC:axis(["0","445000799999000"])},value:Array(2*2*1*3*2).fill(null) as Array<number|null>};
average.value[(((0*2+1)*1+0)*3+0)*2+0]=72_410;
average.value[(((1*2+1)*1+0)*3+2)*2+0]=78_000;
const parsed=parseCsuApartmentAverage(average);
assert.equal(parsed.rows.find(row=>row.territoryCode==="CZ")?.pricePerSqmCents,BigInt(7_241_000));
assert.equal(parsed.rows.find(row=>row.territoryCode==="CZ0323")?.sourcePeriod,"2023-2025");
assert.equal(parsed.rows.find(row=>row.territoryCode==="CZ0323"&&row.sourcePeriod==="2025"),undefined);
assert.equal(selectCsuAverage(parsed.rows,"CZ0323",2026)?.pricePerSqmCents,BigInt(7_800_000));
assert.equal(selectCsuAverage(parsed.rows,"CZ0427",2026)?.territoryCode,"CZ");
assert.equal(csuDistrictForCity("Plzeň 8-Černice"),"CZ0323");
assert.equal(csuDistrictForCity("Černice"),"CZ0323");
assert.equal(csuDistrictForCity("Ústí nad Labem"),"CZ0427");
assert.equal(csuDistrictForCity("Teplice"),"CZ0426");
assert.equal(csuDistrictForCity("Plzeň-sever"),null);
console.log("ČSÚ: rozměry JSON-STAT, chybějící cena, okres a index ověřeny.");
