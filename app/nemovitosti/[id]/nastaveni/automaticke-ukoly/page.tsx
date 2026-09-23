import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/PageHeading";
import { PropertySubnav } from "@/components/PropertySubnav";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { requireUser,hasAllPropertyAccess } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { effectiveAutomationEnabled } from "@/lib/task-automation";

export const dynamic="force-dynamic";
export default async function PropertyAutomation({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{ok?:string;error?:string}>}){
  const user=await requireUser(),{id}=await params,query=await searchParams,property=await requirePropertyAccess(user,id);if(!property)notFound();const membership=property.memberships.find(row=>row.userId===user.id);const canManage=hasAllPropertyAccess(user)||membership?.permission==="EDIT"||membership?.permission==="ADMIN";if(!canManage)notFound();
  const rules=await prisma.taskAutomationRule.findMany({include:{overrides:{where:{propertyId:id}}},orderBy:{name:"asc"}});
  return <Shell user={user} taskPropertyId={id}><div className="page"><div className="breadcrumb"><Link href={`/nemovitosti/${id}/prehled`}>{property.name}</Link><span>›</span><Link href={`/nemovitosti/${id}/nastaveni`}>Nastavení</Link><span>›</span><span>Automatické úkoly</span></div><div className="page-title"><div><PageHeading>Automatické úkoly</PageHeading><p>{property.name} · místní výjimky oproti globálnímu katalogu</p></div></div><PropertySubnav propertyId={id} active="nastaveni"/><Flash ok={query.ok} error={query.error}/><div className="notice"><strong>Tři jasné volby</strong><span>„Převzít výchozí“ sleduje globální nastavení. Globální vypnutí má vždy přednost, místní volba se však uchová pro případ opětovného povolení.</span></div><div className="automation-property-list">{rules.map(rule=>{const mode=rule.overrides[0]?.mode||"INHERIT",enabled=effectiveAutomationEnabled(rule,mode);return <form className="card automation-property-row" id={rule.id} action={`/api/properties/${id}/task-automation`} method="post" key={rule.id}><input type="hidden" name="ruleId" value={rule.id}/><div><span className={`status ${enabled?"ok":""}`}>{enabled?"Zapnuto":"Vypnuto"}</span><h2>{rule.name}</h2><p>{rule.description}</p><small>{!rule.globalEnabled?"Vypnuto super-adminem":mode==="INHERIT"?`Převzato z globálního nastavení · výchozí ${rule.defaultEnabled?"zapnuto":"vypnuto"}`:"Místní výjimka"}</small></div><label className="field"><span>Nastavení objektu</span><select name="mode" defaultValue={mode}><option value="INHERIT">Převzít výchozí</option><option value="ENABLED">Zapnout</option><option value="DISABLED">Vypnout</option></select></label><button className="secondary" type="submit">Uložit</button></form>})}</div></div></Shell>;
}
