import { createHash } from "node:crypto";
import { Prisma, SaleBenchmarkMappingQuality, SaleBenchmarkMetric, SaleBenchmarkSource, type SaleBenchmarkConfidence } from "@prisma/client";
import { prisma } from "@/lib/db";

export const saleBenchmarkSources:Record<SaleBenchmarkSource,string>={
  SREALITY_PRICE_MAP:"Sreality · realizované ceny",
  SREALITY_LISTINGS:"Sreality · aktivní nabídky",
  MANUAL_REFERENCE:"Ručně doložená reference",
};
export const saleBenchmarkMetrics:Record<SaleBenchmarkMetric,string>={REALIZED_AVERAGE:"Realizovaný průměr",OFFER_MEDIAN:"Medián nabídek"};
export const saleBenchmarkMappingQualities:Record<SaleBenchmarkMappingQuality,string>={EXACT:"Přesné",ONE_TO_MANY:"Jedno zdrojové území k více katastrům",APPROXIMATE:"Přibližné",UNMAPPED:"Nenamapované"};
export const saleBenchmarkConfidenceLabels:Record<SaleBenchmarkConfidence,string>={HIGH:"Vysoká",MEDIUM:"Střední",LOW:"Nízká",INSUFFICIENT:"Nedostatek dat"};

export type SaleBenchmarkInput={
  source:SaleBenchmarkSource;metric:SaleBenchmarkMetric;sourceLocalityType:string;sourceLocalityId:string;sourceLocalityName:string;sourceSeoName?:string|null;
  territoryCode:string;ruianCadastralCode?:string|null;cadastralName:string;municipalityName?:string|null;marketYear:number;marketQuarter:number;
  windowFrom:Date;windowTo:Date;pricePerSqmCents:number;sampleCount:number;mappingQuality:SaleBenchmarkMappingQuality;baselinePartial?:boolean;
  acceptedSampleCount?:number|null;rejectedSampleCount?:number;rejectionSummary?:Prisma.InputJsonValue;sourceUrl?:string|null;parserVersion:string;methodVersion:string;retrievedAt:Date;
};

export const saleBenchmarkCsvHeader="source;metric;sourceLocalityType;sourceLocalityId;sourceLocalityName;sourceSeoName;territoryCode;ruianCadastralCode;cadastralName;municipalityName;marketYear;marketQuarter;windowFrom;windowTo;pricePerSqmCzk;sampleCount;mappingQuality;baselinePartial;acceptedSampleCount;rejectedSampleCount;sourceUrl;parserVersion;methodVersion;retrievedAt";
const csvFields=saleBenchmarkCsvHeader.split(";");

export function parseSaleBenchmarkCsv(raw:string):SaleBenchmarkInput[]{
  const lines=raw.replace(/^\uFEFF/,"").split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  if(!lines.length)throw new Error("CSV je prázdné.");
  if(lines[0]!==saleBenchmarkCsvHeader)throw new Error("CSV nemá očekávanou hlavičku nebo pořadí sloupců.");
  if(lines.length>5_001)throw new Error("CSV může obsahovat nejvýše 5 000 datových řádků.");
  return lines.slice(1).map((line,index)=>{
    if(line.includes('"'))throw new Error(`Řádek ${index+2}: uvozovky nejsou podporované; text nesmí obsahovat středník.`);
    const values=line.split(";").map(value=>value.trim());
    if(values.length!==csvFields.length)throw new Error(`Řádek ${index+2}: očekává se ${csvFields.length} sloupců.`);
    const row=Object.fromEntries(csvFields.map((field,i)=>[field,values[i]]));
    const date=(field:string)=>{const value=new Date(`${row[field]}${/^\d{4}-\d{2}-\d{2}$/.test(row[field])?"T12:00:00.000Z":""}`);if(Number.isNaN(value.getTime()))throw new Error(`Řádek ${index+2}: ${field} není platné datum.`);return value};
    const integer=(field:string,optional=false)=>{if(optional&&!row[field])return null;const value=Number(row[field]);if(!Number.isSafeInteger(value))throw new Error(`Řádek ${index+2}: ${field} není celé číslo.`);return value};
    const priceText=row.pricePerSqmCzk.replace(",",".");
    if(!/^\d+(?:\.\d{1,2})?$/.test(priceText))throw new Error(`Řádek ${index+2}: pricePerSqmCzk musí být kladná částka s nejvýše dvěma desetinnými místy.`);
    const [whole,fraction=""]=priceText.split(".");
    const pricePerSqmCents=Number(whole)*100+Number(fraction.padEnd(2,"0"));
    if(!Number.isSafeInteger(pricePerSqmCents)||pricePerSqmCents<=0)throw new Error(`Řádek ${index+2}: pricePerSqmCzk je mimo povolený rozsah.`);
    if(!Object.values(SaleBenchmarkSource).includes(row.source as SaleBenchmarkSource)||!Object.values(SaleBenchmarkMetric).includes(row.metric as SaleBenchmarkMetric)||!Object.values(SaleBenchmarkMappingQuality).includes(row.mappingQuality as SaleBenchmarkMappingQuality))throw new Error(`Řádek ${index+2}: zdroj, metrika nebo kvalita mapování nejsou platné.`);
    if(!["true","false","1","0","ano","ne",""].includes(row.baselinePartial.toLowerCase()))throw new Error(`Řádek ${index+2}: baselinePartial není platná logická hodnota.`);
    return {source:row.source as SaleBenchmarkSource,metric:row.metric as SaleBenchmarkMetric,sourceLocalityType:row.sourceLocalityType,sourceLocalityId:row.sourceLocalityId,sourceLocalityName:row.sourceLocalityName,sourceSeoName:row.sourceSeoName||null,territoryCode:row.territoryCode,ruianCadastralCode:row.ruianCadastralCode||null,cadastralName:row.cadastralName,municipalityName:row.municipalityName||null,marketYear:integer("marketYear")!,marketQuarter:integer("marketQuarter")!,windowFrom:date("windowFrom"),windowTo:date("windowTo"),pricePerSqmCents,sampleCount:integer("sampleCount")!,mappingQuality:row.mappingQuality as SaleBenchmarkMappingQuality,baselinePartial:["true","1","ano"].includes(row.baselinePartial.toLowerCase()),acceptedSampleCount:integer("acceptedSampleCount",true),rejectedSampleCount:integer("rejectedSampleCount",true)||0,sourceUrl:row.sourceUrl||null,parserVersion:row.parserVersion,methodVersion:row.methodVersion,retrievedAt:date("retrievedAt")};
  });
}

type Actor={id:string;role:string};
const compact=(value:string|undefined|null,max:number,label:string)=>{const clean=(value||"").trim();if(!clean)throw new Error(`${label} je povinné.`);if(clean.length>max)throw new Error(`${label} je příliš dlouhé.`);return clean};
const safeInt=(value:number,label:string,min:number,max:number)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`${label} není v povoleném rozsahu.`);return value};

export function saleBenchmarkConfidence(sampleCount:number):SaleBenchmarkConfidence{
  if(sampleCount>=20)return "HIGH";
  if(sampleCount>=8)return "MEDIUM";
  if(sampleCount>=3)return "LOW";
  return "INSUFFICIENT";
}

function normalizedInput(input:SaleBenchmarkInput){
  if(!Object.values(SaleBenchmarkSource).includes(input.source))throw new Error("Vyberte platný zdroj benchmarku.");
  if(!Object.values(SaleBenchmarkMetric).includes(input.metric))throw new Error("Vyberte platnou metriku benchmarku.");
  if(!Object.values(SaleBenchmarkMappingQuality).includes(input.mappingQuality))throw new Error("Vyberte platnou kvalitu územního mapování.");
  if(input.source==="SREALITY_PRICE_MAP"&&input.metric!=="REALIZED_AVERAGE")throw new Error("Cenová mapa Sreality se ukládá jako realizovaný průměr.");
  if(input.source==="SREALITY_LISTINGS"&&input.metric!=="OFFER_MEDIAN")throw new Error("Aktivní nabídky Sreality se ukládají jako medián nabídek.");
  const marketYear=safeInt(input.marketYear,"Rok",2020,2200),marketQuarter=safeInt(input.marketQuarter,"Čtvrtletí",1,4);
  const pricePerSqmCents=safeInt(input.pricePerSqmCents,"Cena za m²",1,100_000_000);
  const sampleCount=safeInt(input.sampleCount,"Počet vzorků",1,1_000_000);
  const rejectedSampleCount=safeInt(input.rejectedSampleCount||0,"Počet vyřazených vzorků",0,1_000_000);
  const acceptedSampleCount=input.acceptedSampleCount==null?null:safeInt(input.acceptedSampleCount,"Počet přijatých vzorků",0,1_000_000);
  if(acceptedSampleCount!=null&&acceptedSampleCount>sampleCount)throw new Error("Počet přijatých vzorků nesmí být vyšší než velikost vzorku.");
  if(Number.isNaN(input.windowFrom.getTime())||Number.isNaN(input.windowTo.getTime())||input.windowTo<input.windowFrom)throw new Error("Okno benchmarku není platné.");
  if(input.windowTo.getTime()-input.windowFrom.getTime()>400*86_400_000)throw new Error("Zdrojové okno může mít nejvýše 400 dní.");
  if(Number.isNaN(input.retrievedAt.getTime())||input.retrievedAt.getTime()>Date.now()+86_400_000)throw new Error("Datum načtení není platné.");
  if(input.windowTo.getTime()>input.retrievedAt.getTime())throw new Error("Zdrojové okno nesmí končit po datu načtení.");
  let sourceUrl=input.sourceUrl?.trim()||null;
  if(sourceUrl){const parsed=new URL(sourceUrl);if(parsed.protocol!=="https:")throw new Error("Zdrojový odkaz musí používat HTTPS.");if(input.source!=="MANUAL_REFERENCE"&&!/(^|\.)sreality\.cz$/i.test(parsed.hostname))throw new Error("Sreality benchmark musí odkazovat na doménu sreality.cz.");sourceUrl=parsed.toString()}
  const result={
    source:input.source,metric:input.metric,sourceLocalityType:compact(input.sourceLocalityType,60,"Typ zdrojového území"),sourceLocalityId:compact(input.sourceLocalityId,120,"ID zdrojového území"),sourceLocalityName:compact(input.sourceLocalityName,160,"Název zdrojového území"),sourceSeoName:input.sourceSeoName?.trim().slice(0,200)||null,
    territoryCode:compact(input.territoryCode,160,"Kód území"),ruianCadastralCode:input.ruianCadastralCode?.trim().slice(0,30)||null,cadastralName:compact(input.cadastralName,160,"Katastrální území"),municipalityName:input.municipalityName?.trim().slice(0,160)||null,
    marketYear,marketQuarter,windowFrom:input.windowFrom,windowTo:input.windowTo,pricePerSqmCents:BigInt(pricePerSqmCents),sampleCount,confidence:saleBenchmarkConfidence(sampleCount),mappingQuality:input.mappingQuality,baselinePartial:Boolean(input.baselinePartial),acceptedSampleCount,rejectedSampleCount,rejectionSummary:input.rejectionSummary??Prisma.JsonNull,sourceUrl,parserVersion:compact(input.parserVersion,80,"Verze parseru"),methodVersion:compact(input.methodVersion,80,"Verze metodiky"),retrievedAt:input.retrievedAt,
  };
  const rawHash=createHash("sha256").update(JSON.stringify({...result,pricePerSqmCents:String(result.pricePerSqmCents),windowFrom:result.windowFrom.toISOString(),windowTo:result.windowTo.toISOString(),retrievedAt:result.retrievedAt.toISOString()})).digest("hex");
  return {...result,rawHash};
}

export async function upsertSaleBenchmarkSnapshot(actor:Actor,input:SaleBenchmarkInput,client:Prisma.TransactionClient|typeof prisma=prisma){
  if(actor.role!=="SUPER_ADMIN")throw new Error("Prodejní benchmark může importovat pouze super-admin.");
  const data=normalizedInput(input);
  const key={source_metric_sourceLocalityType_sourceLocalityId_territoryCode_marketYear_marketQuarter:{source:data.source,metric:data.metric,sourceLocalityType:data.sourceLocalityType,sourceLocalityId:data.sourceLocalityId,territoryCode:data.territoryCode,marketYear:data.marketYear,marketQuarter:data.marketQuarter}};
  const before=await client.saleBenchmarkSnapshot.findUnique({where:key});
  if(before?.rawHash===data.rawHash)return {snapshot:before,changed:false};
  const snapshot=await client.saleBenchmarkSnapshot.upsert({where:key,create:{...data,importedById:actor.id},update:{...data,importedById:actor.id}});
  await client.auditLog.create({data:{userId:actor.id,action:before?"SALE_BENCHMARK_UPDATED":"SALE_BENCHMARK_CREATED",entityType:"SaleBenchmarkSnapshot",entityId:snapshot.id,details:{before:before?{pricePerSqmCents:String(before.pricePerSqmCents),sampleCount:before.sampleCount,rawHash:before.rawHash,retrievedAt:before.retrievedAt.toISOString()}:null,after:{source:data.source,metric:data.metric,territoryCode:data.territoryCode,marketYear:data.marketYear,marketQuarter:data.marketQuarter,pricePerSqmCents:String(data.pricePerSqmCents),sampleCount:data.sampleCount,confidence:data.confidence,mappingQuality:data.mappingQuality,rawHash:data.rawHash,retrievedAt:data.retrievedAt.toISOString()}}}});
  return {snapshot,changed:true};
}

function safeBigInt(value:bigint,label:string){const number=Number(value);if(!Number.isSafeInteger(number))throw new Error(`${label} je mimo bezpečný rozsah.`);return number}

export function calculateSaleBenchmarkValue(areaM2:number|null|undefined,pricePerSqmCents:bigint|number|null|undefined){
  if(areaM2==null||!Number.isFinite(areaM2)||areaM2<=0||pricePerSqmCents==null)return null;
  const price=typeof pricePerSqmCents==="bigint"?safeBigInt(pricePerSqmCents,"Benchmark"):pricePerSqmCents;
  const value=Math.round(areaM2*price);
  return Number.isSafeInteger(value)&&value>0?value:null;
}

type BenchmarkProperty={id:string;name:string;mfRentLocation:{territoryCode:string;territoryName:string}|null;units:Array<{id:string;label:string;areaM2:number|null}>};
function propertyBenchmark(property:BenchmarkProperty,snapshots:Awaited<ReturnType<typeof prisma.saleBenchmarkSnapshot.findMany>>){
  const territoryCode=property.mfRentLocation?.territoryCode;
  const preferred=(metric:SaleBenchmarkMetric,source:SaleBenchmarkSource)=>snapshots.find(row=>row.metric===metric&&row.source===source)||snapshots.find(row=>row.metric===metric)||null;
  const realized=preferred("REALIZED_AVERAGE","SREALITY_PRICE_MAP"),offer=preferred("OFFER_MEDIAN","SREALITY_LISTINGS");
  const unitRows=property.units.map(unit=>({ ...unit,benchmarkValueCents:calculateSaleBenchmarkValue(unit.areaM2,realized?.pricePerSqmCents) }));
  const complete=Boolean(realized)&&unitRows.every(row=>row.benchmarkValueCents!=null);
  const benchmarkValueCents=complete?unitRows.reduce((sum,row)=>sum+row.benchmarkValueCents!,0):null;
  const realizedRows=snapshots.filter(row=>row.metric==="REALIZED_AVERAGE"),preferredRows=realizedRows.filter(row=>row.source==="SREALITY_PRICE_MAP"),fallbackRows=realizedRows.filter(row=>row.source!=="SREALITY_PRICE_MAP");
  const trend=[...preferredRows,...fallbackRows].filter((row,index,array)=>array.findIndex(candidate=>candidate.marketYear===row.marketYear&&candidate.marketQuarter===row.marketQuarter)===index).sort((a,b)=>b.marketYear-a.marketYear||b.marketQuarter-a.marketQuarter).slice(0,12).reverse().map(row=>({year:row.marketYear,quarter:row.marketQuarter,pricePerSqmCents:safeBigInt(row.pricePerSqmCents,"Benchmark"),sampleCount:row.sampleCount,confidence:row.confidence}));
  const previous=trend.length>1?trend[trend.length-2]:null,current=trend.at(-1)||null;
  const qoqBps=current&&previous&&previous.pricePerSqmCents>0?Math.round((current.pricePerSqmCents-previous.pricePerSqmCents)*10_000/previous.pricePerSqmCents):null;
  return {propertyId:property.id,propertyName:property.name,territoryCode:territoryCode||null,territoryName:property.mfRentLocation?.territoryName||null,realized,offer,unitRows,benchmarkValueCents,coveredUnits:unitRows.filter(row=>row.benchmarkValueCents!=null).length,totalUnits:unitRows.length,qoqBps,trend};
}

export async function loadPortfolioSaleBenchmarks(propertyIds:string[]){
  const ids=[...new Set(propertyIds)].filter(Boolean);if(!ids.length)return [];
  const properties=await prisma.property.findMany({where:{id:{in:ids}},select:{id:true,name:true,mfRentLocation:{select:{territoryCode:true,territoryName:true}},units:{where:{type:"APARTMENT",operationalStatus:{not:"INACTIVE"}},select:{id:true,label:true,areaM2:true}}}});
  const territoryCodes=[...new Set(properties.map(property=>property.mfRentLocation?.territoryCode).filter((value):value is string=>Boolean(value)))];
  const snapshots=territoryCodes.length?await prisma.saleBenchmarkSnapshot.findMany({where:{territoryCode:{in:territoryCodes},mappingQuality:{not:"UNMAPPED"},source:{not:"MANUAL_REFERENCE"}},orderBy:[{marketYear:"desc"},{marketQuarter:"desc"},{retrievedAt:"desc"}]}):[];
  return properties.map(property=>propertyBenchmark(property,snapshots.filter(snapshot=>snapshot.territoryCode===property.mfRentLocation?.territoryCode)));
}

export async function loadPropertySaleBenchmark(propertyId:string){return (await loadPortfolioSaleBenchmarks([propertyId]))[0]||null}
