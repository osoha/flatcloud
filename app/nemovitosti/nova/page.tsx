import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, canSeeAll } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { Field, Flash, FormCard, FormPage, Select, Textarea } from "@/components/FormUi";

export const dynamic = "force-dynamic";
export default async function NewProperty({ searchParams }: { searchParams: Promise<{ok?:string;error?:string}> }) {
  const user = await requireUser();
  if (!canSeeAll(user.role)) redirect("/portfolio");
  const [owners, query] = await Promise.all([prisma.owner.findMany({ where: { active: true }, orderBy: { name: "asc" } }), searchParams]);
  if (!owners.length) redirect("/vlastnici?error=" + encodeURIComponent("Nejprve přidejte vlastníka nebo SPV."));
  return <Shell user={user}><FormPage title="Přidat nemovitost" description="Nemovitost bude samostatnou datovou a přístupovou jednotkou." backHref="/portfolio"><Flash ok={query.ok} error={query.error}/><FormCard action="/api/properties" cancelHref="/portfolio" submitLabel="Vytvořit nemovitost"><Select label="Hlavní evidenční vlastník / SPV" name="ownerId" required options={owners.map(o=>[o.id,o.name])}/><Field label="Interní název objektu" name="name" required placeholder="např. Moskevská"/><Field label="Ulice a číslo" name="address" required/><Field label="Město" name="city" required/><Field label="PSČ" name="postalCode"/><Textarea label="Interní poznámka" name="note"/></FormCard></FormPage></Shell>;
}
