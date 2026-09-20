import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { requirePropertyAccess, requireUnitAccess } from "@/lib/access";
export default async function PropertyReports({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{unitId?:string;view?:string}>}) {
 const user=await requireUser(),{id}=await params,query=await searchParams;
 if(!await requirePropertyAccess(user,id))notFound();
 if(query.unitId&&!await requireUnitAccess(user,id,query.unitId))notFound();
 const target=new URLSearchParams({properties:id,view:query.view||"overview"});if(query.unitId)target.set("unitId",query.unitId);
 redirect(`/reporty?${target}`);
}
