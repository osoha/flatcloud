import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requirePropertyAccess, unitAccessWhere } from "@/lib/access";
import { Shell } from "@/components/Shell";
import { Checkbox, Field, Flash, FormCard, FormPage, Select, Textarea } from "@/components/FormUi";
import { tenantTypes } from "@/lib/labels";

export const dynamic="force-dynamic";
export default async function EditTenant({params,searchParams}:{params:Promise<{id:string;tenantId:string}>;searchParams:Promise<{ok?:string;error?:string}>}){const user=await requireUser();const {id,tenantId}=await params;const [property,tenant,query]=await Promise.all([requirePropertyAccess(user,id),prisma.tenant.findFirst({where:{id:tenantId,leases:{some:{unit:unitAccessWhere(user,id)}}}}),searchParams]);if(!property||!tenant)notFound();return <Shell user={user}><FormPage title={`Upravit nájemníka: ${tenant.name}`} backHref={`/nemovitosti/${id}/najemnici`}><Flash ok={query.ok} error={query.error}/><FormCard action={`/api/properties/${id}/tenants/${tenant.id}`} cancelHref={`/nemovitosti/${id}/najemnici`}><Select label="Typ" name="type" defaultValue={tenant.type} options={Object.entries(tenantTypes)}/><Field label="Jméno / název firmy" name="name" defaultValue={tenant.name} required/><Field label="E-mail" name="email" type="email" defaultValue={tenant.email}/><Field label="Telefon" name="phone" defaultValue={tenant.phone}/><Field label="Kontaktní adresa" name="address" defaultValue={tenant.address} full/><Textarea label="Známé účty plátce" name="payerAccounts" defaultValue={tenant.payerAccounts.join("\n")} placeholder="Jeden účet na řádek"/><Textarea label="Poznámka" name="note" defaultValue={tenant.note}/><Checkbox label="Aktivní nájemník" name="active" defaultChecked={tenant.active} full/></FormCard></FormPage></Shell>}
