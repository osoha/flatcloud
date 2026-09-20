import { isFlatcloudMember } from "@/lib/user-context-policy";
import { NextResponse } from "next/server";
import { requireUser,hasAllPropertyAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseHistoricalQuarterKpis } from "@/lib/reporting/historical-quarter-input";
import { createManualBaselineSnapshot } from "@/lib/reporting/manual-baseline-service";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const user=await requireUser();const{id}=await params;const membership=hasAllPropertyAccess(user)?true:Boolean(await prisma.userProperty.findFirst({where:{userId:user.id,propertyId:id,permission:{in:["EDIT","ADMIN"]}},select:{propertyId:true}}));const corporateProperty=await prisma.property.findFirst({where:{id,active:true,flatcloudConsolidationBasisPoints:{gt:0}},select:{id:true}});if(!membership||!isFlatcloudMember(user)||!corporateProperty)return NextResponse.json({error:"Forbidden"},{status:403});
  try{const form=await request.formData();const year=Number(String(form.get("year")??"")),quarter=Number(String(form.get("quarter")??""));const sourceNote=String(form.get("sourceNote")??"");await createManualBaselineSnapshot({propertyId:id,year,quarter,sourceNote,createdById:user.id,kpis:parseHistoricalQuarterKpis(form)});return NextResponse.redirect(new URL(`/nemovitosti/${id}/nastaveni/reporting?ok=${encodeURIComponent("Historická data byla uložena jako nová revize.")}#historie`,request.url),303);}catch{return NextResponse.redirect(new URL(`/nemovitosti/${id}/nastaveni/reporting?error=${encodeURIComponent("Historická data se nepodařilo uložit. Zkontrolujte zadané hodnoty.")}#historie`,request.url),303);}}
