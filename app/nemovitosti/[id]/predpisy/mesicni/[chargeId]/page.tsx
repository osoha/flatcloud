import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { Shell } from "@/components/Shell";
import { Checkbox, Field, Flash, FormCard, FormPage, Textarea } from "@/components/FormUi";
import { dateInput, moneyInput } from "@/lib/forms";
import { money } from "@/lib/format";
import { chargeCategories } from "@/lib/labels";

export const dynamic="force-dynamic";
export default async function EditCharge({params,searchParams}:{params:Promise<{id:string;chargeId:string}>;searchParams:Promise<{ok?:string;error?:string}>}){const user=await requireUser();const {id,chargeId}=await params;const [property,charge,query]=await Promise.all([requirePropertyAccess(user,id),prisma.charge.findFirst({where:{id:chargeId,lease:{unit:{propertyId:id}}},include:{items:true,allocations:true,lease:{include:{tenant:true,unit:true}}}}),searchParams]);if(!property||!charge)notFound();const paid=charge.allocations.reduce((s,a)=>s+a.amountCents,0);return <Shell user={user}><FormPage title={`Měsíční předpis ${charge.period}`} description={`${charge.lease.unit.label} · ${charge.lease.tenant.name}`} backHref={`/nemovitosti/${id}/predpisy/${charge.leaseId}`}><Flash ok={query.ok} error={query.error}/><div className="detail-grid"><div className="card col-5"><h2>Rozpad předpisu</h2><div className="summary-list">{charge.items.map(item=><div key={item.id}><span>{chargeCategories[item.category] || item.name}</span><strong>{money(item.amountCents)}</strong></div>)}<div className="summary-total"><span>Celkem</span><strong>{money(charge.amountCents)}</strong></div><div><span>Uhrazeno</span><strong>{money(paid)}</strong></div></div></div><div className="col-7"><FormCard action={`/api/properties/${id}/charges/${charge.id}`} cancelHref={`/nemovitosti/${id}/predpisy/${charge.leaseId}`}><Field label="Celková částka Kč" name="amount" type="number" step="0.01" defaultValue={moneyInput(charge.amountCents).replace(",",".")} required/><Field label="Datum splatnosti" name="dueDate" type="date" defaultValue={dateInput(charge.dueDate)} required/><Checkbox label="Předpis je aktivní pro tento měsíc" name="active" defaultChecked={charge.active} full/><Textarea label="Poznámka / důvod úpravy" name="note" defaultValue={charge.note}/></FormCard></div></div></FormPage></Shell>}
