import { currentUser, canSeeAll } from "@/lib/auth";
import { isFlatcloudMember } from "@/lib/user-context-policy";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { goWithMessage } from "@/lib/route-response";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 const user=await currentUser();if(!user||!canSeeAll(user.role)||!isFlatcloudMember(user))return NextResponse.json({error:"Nemáte oprávnění upravit kontakty."},{status:403});
 try {const{id}=await params,form=await request.formData();const field=(key:string,max=250)=>String(form.get(key)||"").trim().slice(0,max);const data={name:field("name"),email:field("email")||null,phone:field("phone")||null,source:field("source")||null,note:field("note",2000)||null};if(data.name.length<2||!data.email&&!data.phone)throw new Error("Doplňte jméno a alespoň e-mail nebo telefon.");if(data.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))throw new Error("Zkontrolujte e-mail.");await prisma.$transaction(async tx=>{const previous=await tx.distributionProspect.findFirst({where:{id,active:true}});if(!previous)throw new Error("Kontakt není dostupný.");await tx.distributionProspect.update({where:{id},data});await tx.auditLog.create({data:{userId:user.id,action:"DISTRIBUTION_PROSPECT_UPDATED",entityType:"DistributionProspect",entityId:id,details:{changedFields:Object.keys(data).filter(key=>data[key as keyof typeof data]!==previous[key as keyof typeof data])}}});});return goWithMessage(request,"/distribuce/zajemci#adresar","ok","Kontakt byl uložen.");}catch(error){return goWithMessage(request,"/distribuce/zajemci#adresar","error",error instanceof Error?error.message:"Kontakt nelze uložit.");}
}
