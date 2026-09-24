import { NextResponse } from "next/server";
import { requirePropertyAdmin } from "@/lib/management";
import { prisma } from "@/lib/db";
import { collaboratorScope } from "@/lib/collaborator-search";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
 const {id}=await params,access=await requirePropertyAdmin(id);
 if(!access)return NextResponse.json({error:"Přístup není povolen."},{status:403});
 const q=(new URL(request.url).searchParams.get("q")||"").trim();
 if(q.length<2||q.length>150)return NextResponse.json({users:[]},{headers:{"Cache-Control":"no-store"}});
 const users=await prisma.user.findMany({where:{AND:[await collaboratorScope(access.user),{OR:[{name:{contains:q,mode:"insensitive"}},{email:{contains:q,mode:"insensitive"}}]}]},select:{id:true,name:true,email:true},orderBy:{name:"asc"},take:8});
 return NextResponse.json({users},{headers:{"Cache-Control":"private, no-store"}});
}
