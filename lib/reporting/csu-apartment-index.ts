import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

/** ČSÚ DataStat CEN0401: apartment prices, base index (2015 = 100), quarterly. */
export const CSU_PRICE_INDEX_URL = "https://data.csu.gov.cz/opendata/sady/CEN0401/distribuce/json";
export const CSU_APARTMENT_AVERAGE_URL = "https://data.csu.gov.cz/opendata/sady/CEN0402/distribuce/json";
type Axis = { category?: { index?: Record<string,number>; label?: Record<string,string> } };
type JsonStat = { class?:string; id?:string[]; size?:number[]; dimension?:Record<string,Axis>; value?:Array<number|null>; updated?:string };
export type CsuIndexRow = {territoryCode:string;marketYear:number;marketQuarter:number;indexBasisPoints:number};
export type CsuAverageRow = {territoryCode:string;sourcePeriod:string;pricePerSqmCents:bigint};

function jsonStatAxis(data:JsonStat,name:string,key:string){const index=data.dimension?.[name]?.category?.index?.[key];if(index===undefined||!Number.isSafeInteger(index)||index<0||index>=data.size![data.id!.indexOf(name)])throw new Error(`V datech ČSÚ chybí ${name}/${key}.`);return index}
function jsonStatValue(data:JsonStat,coordinates:Record<string,number>){let offset=0;for(let i=0;i<data.id!.length;i++)offset=offset*data.size![i]+coordinates[data.id![i]];return data.value![offset]}
function checkedDataset(input:unknown,required:string[],maximum:number){if(!input||typeof input!=="object")throw new Error("Datová sada ČSÚ nemá platný formát.");const data=input as JsonStat;
  if(data.class!=="dataset"||!Array.isArray(data.id)||!Array.isArray(data.size)||!Array.isArray(data.value)||!data.dimension||data.id.length!==data.size.length||required.some(axis=>!data.id!.includes(axis)))throw new Error("ČSÚ změnil strukturu datové sady.");
  const total=data.size.reduce((result,n)=>result*n,1);
  if(!data.size.every(n=>Number.isSafeInteger(n)&&n>0)||total!==data.value.length||total>maximum)throw new Error("ČSÚ vrátil neúplnou datovou sadu.");
  const sourceUpdatedAt=new Date(data.updated||"");if(!Number.isFinite(sourceUpdatedAt.getTime())||sourceUpdatedAt.getTime()>Date.now()+86_400_000)throw new Error("ČSÚ vrátil neplatné datum aktualizace.");
  return {data,sourceUpdatedAt};
}

export function parseCsuApartmentIndex(input: unknown): {rows:CsuIndexRow[];sourceUpdatedAt:Date} {
  const required=["REPRCENNEM4","TYPUDAJENEM","IndicatorType","UZ02HN","CASRQ2"];
  const {data,sourceUpdatedAt}=checkedDataset(input,required,500_000);
  const territoryAxis=data.dimension!.UZ02HN?.category?.index||{};
  const quarterAxis=data.dimension!.CASRQ2?.category?.index||{};
  const selected:{territoryCode:string;territory:number;period:string;time:number}[]=[];
  for(const [territoryCode,territory] of Object.entries(territoryAxis)){
    if(territoryCode!=="CZ"&&!/^CZ\d{3}$/.test(territoryCode))continue;
    for(const [period,time] of Object.entries(quarterAxis))if(/^20\d\d-Q[1-4]$/.test(period))selected.push({territoryCode,territory,period,time});
  }
  if(selected.length<10)throw new Error("ČSÚ neobsahuje očekávané čtvrtletní údaje.");
  const coordinates:Record<string,number>={REPRCENNEM4:jsonStatAxis(data,"REPRCENNEM4","10602"),TYPUDAJENEM:jsonStatAxis(data,"TYPUDAJENEM","IZ2015"),IndicatorType:jsonStatAxis(data,"IndicatorType","6144")};
  const rows:CsuIndexRow[]=[];
  for(const item of selected){
    const indexByAxis:Record<string,number>={...coordinates,UZ02HN:item.territory,CASRQ2:item.time};
    const value=jsonStatValue(data,indexByAxis);
    if(value===null)continue;
    if(typeof value!=="number"||!Number.isFinite(value)||value<=0||value>1_000)throw new Error("ČSÚ vrátil neplatnou hodnotu indexu.");
    const [year,quarter]=item.period.split("-Q").map(Number);
    rows.push({territoryCode:item.territoryCode,marketYear:year,marketQuarter:quarter,indexBasisPoints:Math.round(value*100)});
  }
  if(!rows.some(row=>row.territoryCode==="CZ"))throw new Error("Chybí národní index ČSÚ.");
  return {rows,sourceUpdatedAt};
}

export function parseCsuApartmentAverage(input:unknown):{rows:CsuAverageRow[];sourceUpdatedAt:Date}{
  const {data,sourceUpdatedAt}=checkedDataset(input,["VELSKUPOBC","Uz023h22","IndicatorType","REPRCENNEM","CAS1R3R1"],500_000);
  const territoryAxis=data.dimension!.Uz023h22?.category?.index||{},periodAxis=data.dimension!.CAS1R3R1?.category?.index||{};
  const coordinates:Record<string,number>={VELSKUPOBC:jsonStatAxis(data,"VELSKUPOBC","0"),IndicatorType:jsonStatAxis(data,"IndicatorType","7432"),REPRCENNEM:jsonStatAxis(data,"REPRCENNEM","10602")};
  const rows:CsuAverageRow[]=[];
  for(const [territoryCode,territory] of Object.entries(territoryAxis)){
    if(territoryCode!=="CZ"&&!/^CZ\d{3}$/.test(territoryCode)&&!/^CZ\d{3}[0-9A-C]$/.test(territoryCode))continue;
    for(const [sourcePeriod,time] of Object.entries(periodAxis)){
      if(!/^20\d\d(?:-20\d\d)?$/.test(sourcePeriod))continue;
      const value=jsonStatValue(data,{...coordinates,Uz023h22:territory,CAS1R3R1:time});
      if(value===null)continue;
      if(typeof value!=="number"||!Number.isFinite(value)||value<=0||value>1_000_000)throw new Error("ČSÚ vrátil neplatnou kupní cenu bytu.");
      rows.push({territoryCode,sourcePeriod,pricePerSqmCents:BigInt(Math.round(value*100))});
    }
  }
  if(!rows.some(row=>row.territoryCode==="CZ"))throw new Error("Chybí národní průměrná cena bytů ČSÚ.");
  return {rows,sourceUpdatedAt};
}

export async function syncCsuApartmentIndex(fetcher:typeof fetch=fetch){
  const response=await fetcher(CSU_PRICE_INDEX_URL,{signal:AbortSignal.timeout(20_000),headers:{Accept:"application/json"}});
  if(!response.ok)throw new Error(`ČSÚ DataStat: HTTP ${response.status}.`);
  const raw=await response.text();
  if(raw.length>20_000_000)throw new Error("Soubor ČSÚ je mimo očekávanou velikost.");
  const sourceHash=createHash("sha256").update(raw).digest("hex");
  const {rows,sourceUpdatedAt}=parseCsuApartmentIndex(JSON.parse(raw));
  const old=await prisma.csuApartmentPriceIndex.findMany({select:{id:true,territoryCode:true,marketYear:true,marketQuarter:true,indexBasisPoints:true}});
  const byKey=new Map(old.map(row=>[`${row.territoryCode}:${row.marketYear}:${row.marketQuarter}`,row]));
  const fresh=rows.filter(row=>!byKey.has(`${row.territoryCode}:${row.marketYear}:${row.marketQuarter}`));
  const changed=rows.filter(row=>{const previous=byKey.get(`${row.territoryCode}:${row.marketYear}:${row.marketQuarter}`);return previous&&previous.indexBasisPoints!==row.indexBasisPoints});
  if(fresh.length||changed.length)await prisma.$transaction(async tx=>{
    if(fresh.length)await tx.csuApartmentPriceIndex.createMany({data:fresh.map(row=>({...row,sourceUpdatedAt,sourceHash})),skipDuplicates:true});
    for(const row of changed){const previous=byKey.get(`${row.territoryCode}:${row.marketYear}:${row.marketQuarter}`)!;await tx.csuApartmentPriceIndex.update({where:{id:previous.id},data:{indexBasisPoints:row.indexBasisPoints,sourceUpdatedAt,sourceHash}})}
  },{timeout:60_000});
  return {newRows:fresh.length,correctedRows:changed.length,latestQuarter:rows.filter(row=>row.territoryCode==="CZ").sort((a,b)=>b.marketYear-a.marketYear||b.marketQuarter-a.marketQuarter)[0],sourceUpdatedAt};
}

export async function syncCsuApartmentAverage(fetcher:typeof fetch=fetch){
  const response=await fetcher(CSU_APARTMENT_AVERAGE_URL,{signal:AbortSignal.timeout(20_000),headers:{Accept:"application/json"}});
  if(!response.ok)throw new Error(`ČSÚ DataStat: HTTP ${response.status}.`);
  const raw=await response.text();if(raw.length>20_000_000)throw new Error("Soubor ČSÚ je mimo očekávanou velikost.");
  const sourceHash=createHash("sha256").update(raw).digest("hex");
  const {rows,sourceUpdatedAt}=parseCsuApartmentAverage(JSON.parse(raw));
  const old=await prisma.csuApartmentAverage.findMany({select:{id:true,territoryCode:true,sourcePeriod:true,pricePerSqmCents:true}});
  const byKey=new Map(old.map(row=>[`${row.territoryCode}:${row.sourcePeriod}`,row]));
  const fresh=rows.filter(row=>!byKey.has(`${row.territoryCode}:${row.sourcePeriod}`));
  const changed=rows.filter(row=>{const previous=byKey.get(`${row.territoryCode}:${row.sourcePeriod}`);return previous&&previous.pricePerSqmCents!==row.pricePerSqmCents});
  if(fresh.length||changed.length)await prisma.$transaction(async tx=>{
    if(fresh.length)await tx.csuApartmentAverage.createMany({data:fresh.map(row=>({...row,sourceUpdatedAt,sourceHash})),skipDuplicates:true});
    for(const row of changed){const previous=byKey.get(`${row.territoryCode}:${row.sourcePeriod}`)!;await tx.csuApartmentAverage.update({where:{id:previous.id},data:{pricePerSqmCents:row.pricePerSqmCents,sourceUpdatedAt,sourceHash}})}
  },{timeout:60_000});
  return {newRows:fresh.length,correctedRows:changed.length,latestPeriod:rows.filter(row=>row.territoryCode==="CZ").map(row=>row.sourcePeriod).sort().at(-1)};
}
