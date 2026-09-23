import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateSaleBenchmarkValue, parseSaleBenchmarkCsv, saleBenchmarkConfidence, saleBenchmarkCsvHeader } from "../lib/reporting/sale-benchmark";

const sample=`${saleBenchmarkCsvHeader}\nSREALITY_PRICE_MAP;REALIZED_AVERAGE;ward;14977;Černice;cernice-14977;620106/cernice;620106;Černice;Plzeň;2026;3;2025-09-01;2026-08-31;94800,25;10;EXACT;true;10;0;https://www.sreality.cz/cenova-mapa/hledani/byty/plzensky-kraj-2/plzen-mesto-12/plzen-1243/cernice-14977;manual-pilot-1;sale-benchmark-v1;2026-09-22T12:00:00Z`;
const [row]=parseSaleBenchmarkCsv(sample);
assert.equal(row.pricePerSqmCents,9_480_025);
assert.equal(row.sampleCount,10);
assert.equal(row.baselinePartial,true);
assert.equal(row.mappingQuality,"EXACT");
assert.deepEqual([2,3,7,8,19,20].map(saleBenchmarkConfidence),["INSUFFICIENT","LOW","LOW","MEDIUM","MEDIUM","HIGH"]);
assert.equal(calculateSaleBenchmarkValue(50.5,BigInt(9_480_025)),478_741_263);
assert.equal(calculateSaleBenchmarkValue(null,BigInt(9_480_025)),null);
assert.equal(calculateSaleBenchmarkValue(50,null),null);

for(const bad of ["94800.001","1e5","-1","0","NaN"]){
  assert.throws(()=>parseSaleBenchmarkCsv(sample.replace("94800,25",bad)));
}
assert.throws(()=>parseSaleBenchmarkCsv(sample.replace("SREALITY_PRICE_MAP","UNKNOWN_SOURCE")));
assert.throws(()=>parseSaleBenchmarkCsv(sample.replace("Černice;cernice","\"Černice\";cernice")));

const schema=readFileSync("prisma/schema.prisma","utf8");
const migration=readFileSync("prisma/migrations/20260923130000_sale_benchmark_foundation/migration.sql","utf8");
const route=readFileSync("app/api/admin/sale-benchmarks/route.ts","utf8");
const acceptance=readFileSync("app/api/properties/[id]/sale-benchmark/accept-unit/route.ts","utf8");
const generalKpis=readFileSync("lib/reporting/general-kpis.ts","utf8");
const methodology=readFileSync("lib/methodology.ts","utf8");
for(const fragment of ["model SaleBenchmarkSnapshot","MARKET_BENCHMARK","rawHash","mappingQuality"])assert.ok(schema.includes(fragment));
for(const fragment of ["SaleBenchmarkSnapshot","pricePerSqmCents\" > 0","marketQuarter\" BETWEEN 1 AND 4"])assert.ok(migration.includes(fragment));
assert.ok(route.includes('user.role!=="SUPER_ADMIN"'));
assert.ok(route.includes("prisma.$transaction"));
assert.ok(acceptance.includes('form.get("confirm")!=="on"'));
assert.ok(acceptance.includes('mappingQuality:{not:"UNMAPPED"}'));
assert.ok(generalKpis.includes("benchmarkComplete"));
assert.ok(methodology.includes('slug: "prodejni-benchmark"'));

console.log("P02D: CSV precision, confidence, missing-data semantics, audit schema, access and explicit valuation confirmation passed.");
