import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireManagedProperty } from "@/lib/management";
import { hasAllPropertyAccess } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { PageHeading } from "@/components/PageHeading";
import { BankExpenseRules } from "@/components/BankExpenseRules";
export const dynamic="force-dynamic";
export default async function Rules({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{transaction?:string}>}) {
 const {id}=await params,access=await requireManagedProperty(id);if(!access)notFound();const query=await searchParams;
 const [accounts,targets,rules,initial]=await Promise.all([
 prisma.bankAccount.findMany({where:{propertyId:id},select:{id:true,accountName:true,ibanMasked:true}}),
 prisma.property.findMany({where:{active:true,...(hasAllPropertyAccess(access.user)?{}:{memberships:{some:{userId:access.user.id,permission:{in:["EDIT","ADMIN"]}}}})},select:{id:true,name:true,units:{select:{id:true,label:true}}},orderBy:{name:"asc"}}),
 prisma.bankExpenseRule.findMany({where:{sourcePropertyId:id},orderBy:{createdAt:"desc"}}),
 query.transaction?prisma.bankTransaction.findFirst({where:{id:query.transaction,bankAccount:{propertyId:id}},select:{bankAccountId:true,counterpartyIban:true,counterpartyName:true,variableSymbol:true,message:true,amountCents:true}}):null]);
 const authors=new Map((await prisma.user.findMany({where:{id:{in:rules.map(r=>r.createdById)}},select:{id:true,name:true}})).map(u=>[u.id,u.name]));
 return <Shell user={access.user}><div className="page"><Link href={`/nemovitosti/${id}/bankovni-vydaje`}>← Bankovní výdaje</Link><PageHeading>Pravidla bankovních výdajů</PageHeading><BankExpenseRules propertyId={id} accounts={accounts.map(a=>({id:a.id,label:(a.accountName||"Bankovní účet")+" · "+a.ibanMasked}))} targets={targets} rules={rules.map(r=>({...r,lastUsedAt:r.lastUsedAt?.toISOString()||null,createdBy:authors.get(r.createdById)||"Uživatel"}))} initial={initial||undefined}/></div></Shell>;
}
