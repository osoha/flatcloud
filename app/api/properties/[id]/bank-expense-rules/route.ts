import { NextResponse } from "next/server";
import { PropertyCostCategory, PropertyCostKind } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireManagedProperty } from "@/lib/management";
import { expenseConditionSchema } from "@/lib/bank-expense-rule-policy";
import { expenseRuleAccess, previewExpenseRule, runExpenseRules } from "@/lib/bank-expense-rules";
const schema=z.object({name:z.string().trim().min(1).max(200),bankAccountId:z.string().min(1),targetPropertyId:z.string().min(1),unitId:z.string().nullable(),action:z.enum(["ASSIGN","MATCH","CREATE_COST","IGNORE"]),conditions:expenseConditionSchema,category:z.nativeEnum(PropertyCostCategory),costKind:z.nativeEnum(PropertyCostKind)});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 const {id}=await params,access=await requireManagedProperty(id);
 if(!access||request.headers.get("sec-fetch-site")==="cross-site")return NextResponse.json({error:"Chybí oprávnění."},{status:403});
 try {
  const body=await request.json();
  if(body.operation==="toggle"||body.operation==="apply") {
   const rule=await prisma.bankExpenseRule.findFirst({where:{id:String(body.id),sourcePropertyId:id}});if(!rule)throw new Error("Pravidlo nenalezeno.");
   await expenseRuleAccess(prisma,rule,access.user.id);
   if(body.operation==="toggle"){
    await prisma.$transaction(async tx=>{await tx.bankExpenseRule.update({where:{id:rule.id},data:{active:!rule.active}});await tx.auditLog.create({data:{userId:access.user.id,propertyId:id,action:"BANK_EXPENSE_RULE_TOGGLED",entityType:"BankExpenseRule",entityId:rule.id,details:{active:!rule.active}}});});
    return NextResponse.json({ok:true});
   }
   if(body.confirmed!==true||!Array.isArray(body.ids)||body.ids.length>1000||!body.ids.every((x:unknown)=>typeof x==="string"))throw new Error("Potvrďte náhled vybraných pohybů.");
   const eligible=new Set((await previewExpenseRule(rule)).rows.map(r=>r.id));
   return NextResponse.json(await runExpenseRules(id,body.ids.filter((x:string)=>eligible.has(x)),access.user.id,rule.id));
  }
  const data=schema.parse(body.rule),rule={...data,sourcePropertyId:id};
  if(["MATCH","CREATE_COST"].includes(rule.action)&&rule.conditions.direction!=="OUT")throw new Error("Automatické úhrady a nové náklady vyžadují odchozí pohyb.");
  await expenseRuleAccess(prisma,rule,access.user.id);
  if(body.operation==="preview")return NextResponse.json(await previewExpenseRule(rule));
  if(body.operation!=="save"||body.confirmed!==true)throw new Error("Nejdříve potvrďte náhled pravidla.");
  const saved=await prisma.$transaction(async tx=>{
   const created=await tx.bankExpenseRule.create({data:{...rule,conditions:rule.conditions,createdById:access.user.id}});
   await tx.auditLog.create({data:{userId:access.user.id,propertyId:id,action:"BANK_EXPENSE_RULE_CREATED",entityType:"BankExpenseRule",entityId:created.id,details:{name:rule.name,action:rule.action,conditions:rule.conditions}}});return created;
  });return NextResponse.json({id:saved.id});
 }catch(error){return NextResponse.json({error:error instanceof z.ZodError?"Zkontrolujte podmínky, částky a název pravidla.":error instanceof Error?error.message:"Pravidlo nelze zpracovat."},{status:400});}
}
