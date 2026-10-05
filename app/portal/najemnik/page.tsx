import {TenantPortalFrame} from "@/components/TenantPortalFrame";
import Link from "next/link";
import {redirect} from "next/navigation";
import {actualUser} from "@/lib/auth";
import {prisma} from "@/lib/db";
import {tenantPortalContactMatches} from "@/lib/tenant-portal-access";

export const dynamic="force-dynamic";
export default async function TenantPortalIndex(){
  const user=await actualUser();if(!user)redirect("/login");
  const accesses=(await prisma.tenantPortalAccess.findMany({where:{userId:user.id},include:{tenant:true},orderBy:{createdAt:"asc"}})).filter(a=>tenantPortalContactMatches(user.email,a.tenant));
  if(accesses.length===1)redirect(`/portal/najemnik/${accesses[0].tenantId}`);
  return <TenantPortalFrame user={user}><main className="page"><h1>Portál nájemníka</h1>{accesses.length?<div className="card"><h2>Vyberte svůj nájem</h2>{accesses.map(a=><p key={a.tenantId}><Link href={`/portal/najemnik/${a.tenantId}`}>{a.tenant.name}</Link></p>)}</div>:<div className="card">K účtu zatím není přiřazený nájemní vztah.</div>}</main></TenantPortalFrame>;
}
