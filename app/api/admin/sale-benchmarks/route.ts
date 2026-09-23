import { NextResponse } from "next/server";
import { SaleBenchmarkMappingQuality, SaleBenchmarkMetric, SaleBenchmarkSource } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { boolValue, dateValue, intValue, parseCzkToCents, text } from "@/lib/forms";
import { go, goWithMessage } from "@/lib/route-response";
import { parseSaleBenchmarkCsv, saleBenchmarkCsvHeader, upsertSaleBenchmarkSnapshot, type SaleBenchmarkInput } from "@/lib/reporting/sale-benchmark";

const template=`\uFEFF${saleBenchmarkCsvHeader}\r\nSREALITY_PRICE_MAP;REALIZED_AVERAGE;ward;14977;Černice;cernice-14977;620106/cernice;620106;Černice;Plzeň;2026;3;2025-09-01;2026-08-31;94800;10;EXACT;true;10;0;https://www.sreality.cz/cenova-mapa/hledani/byty/plzensky-kraj-2/plzen-mesto-12/plzen-1243/cernice-14977;manual-pilot-1;sale-benchmark-v1;2026-09-22T12:00:00Z\r\nSREALITY_LISTINGS;OFFER_MEDIAN;ward;14977;Černice;cernice-14977;620106/cernice;620106;Černice;Plzeň;2026;3;2026-09-22;2026-09-22;101667;5;EXACT;true;5;0;https://www.sreality.cz/hledani/prodej/byty/plzen?region=Černice;manual-pilot-1;sale-benchmark-v1;2026-09-22T12:00:00Z\r\n`;

export async function GET(request:Request){
  const user=await currentUser();if(!user)return go(request,"/login");if(user.role!=="SUPER_ADMIN")return go(request,"/portfolio");
  return new NextResponse(template,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=flatberry-prodejni-benchmark-vzor.csv","Cache-Control":"private, no-store"}});
}

function manualInput(form:FormData):SaleBenchmarkInput{
  const source=text(form,"source",true)! as SaleBenchmarkSource,metric=text(form,"metric",true)! as SaleBenchmarkMetric,mappingQuality=text(form,"mappingQuality",true)! as SaleBenchmarkMappingQuality;
  return {source,metric,sourceLocalityType:text(form,"sourceLocalityType",true)!,sourceLocalityId:text(form,"sourceLocalityId",true)!,sourceLocalityName:text(form,"sourceLocalityName",true)!,sourceSeoName:text(form,"sourceSeoName"),territoryCode:text(form,"territoryCode",true)!,ruianCadastralCode:text(form,"ruianCadastralCode"),cadastralName:text(form,"cadastralName",true)!,municipalityName:text(form,"municipalityName"),marketYear:intValue(form,"marketYear"),marketQuarter:intValue(form,"marketQuarter"),windowFrom:dateValue(form,"windowFrom",true)!,windowTo:dateValue(form,"windowTo",true)!,pricePerSqmCents:parseCzkToCents(text(form,"pricePerSqmCzk",true)!),sampleCount:intValue(form,"sampleCount"),mappingQuality,baselinePartial:boolValue(form,"baselinePartial"),acceptedSampleCount:text(form,"acceptedSampleCount")?intValue(form,"acceptedSampleCount"):null,rejectedSampleCount:intValue(form,"rejectedSampleCount"),sourceUrl:text(form,"sourceUrl"),parserVersion:text(form,"parserVersion",true)!,methodVersion:text(form,"methodVersion",true)!,retrievedAt:new Date()};
}

export async function POST(request:Request){
  const user=await currentUser();if(!user)return go(request,"/login");if(user.role!=="SUPER_ADMIN")return goWithMessage(request,"/portfolio","error","Prodejní benchmark může spravovat pouze super-admin.");
  try{
    const form=await request.formData(),file=form.get("file");let rows:SaleBenchmarkInput[];
    if(file instanceof File&&file.size){if(file.size>2_000_000)throw new Error("CSV může mít nejvýše 2 MB.");rows=parseSaleBenchmarkCsv(await file.text())}else rows=[manualInput(form)];
    let changed=0,unchanged=0;
    await prisma.$transaction(async tx=>{for(const row of rows){const result=await upsertSaleBenchmarkSnapshot(user,row,tx);if(result.changed)changed++;else unchanged++}});
    return goWithMessage(request,"/nastaveni/cenovy-benchmark","ok",`Import dokončen: ${changed} změněných, ${unchanged} beze změny.`);
  }catch(error){return goWithMessage(request,"/nastaveni/cenovy-benchmark","error",error instanceof Error?error.message:"Benchmark se nepodařilo uložit.")}
}
