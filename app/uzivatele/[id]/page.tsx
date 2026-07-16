import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { Checkbox, Field, Flash, FormPage, Select } from "@/components/FormUi";
import { propertyPermissions, userRoles } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function UserEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const admin = await requireUser();
  if (admin.role !== "SUPER_ADMIN") redirect("/portfolio");
  const { id } = await params;
  const [edited, properties, query] = await Promise.all([
    prisma.user.findUnique({ where: { id }, include: { memberships: true } }),
    prisma.property.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    searchParams,
  ]);
  if (!edited) notFound();
  const membershipMap = new Map(edited.memberships.map((membership) => [membership.propertyId, membership.permission]));
  return <Shell user={admin}><FormPage title={`Uživatel: ${edited.name}`} description="Globální role a práva k jednotlivým nemovitostem." backHref="/uzivatele"><Flash ok={query.ok} error={query.error}/><form className="card edit-form" action={`/api/users/${edited.id}`} method="post"><div className="form-grid"><Field label="Jméno" name="name" defaultValue={edited.name} required/><Field label="E-mail" name="email" defaultValue={edited.email} type="email" required/><Select label="Globální role" name="role" defaultValue={edited.role} options={Object.entries(userRoles)}/><Checkbox label="Uživatel je aktivní" name="active" defaultChecked={edited.active}/><h2 className="form-section-title field-full">Přístupy k nemovitostem</h2><div className="field-full permission-list">{properties.map((property) => <label className="permission-row" key={property.id}><div><strong>{property.name}</strong><small>{property.address}, {property.city}</small></div><select name={`property:${property.id}`} defaultValue={membershipMap.get(property.id) || ""}><option value="">Bez přístupu</option>{Object.entries(propertyPermissions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}</div></div><div className="form-actions"><a className="secondary" href="/uzivatele">Zrušit</a><button className="primary" type="submit">Uložit uživatele</button></div></form></FormPage></Shell>;
}
