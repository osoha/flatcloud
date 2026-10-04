import type { Prisma } from "@prisma/client";
import { tenantAccessWhere } from "./access";
import { text } from "./forms";

export async function createLeaseOccupants(tx: Prisma.TransactionClient, leaseId: string, primaryTenantId: string, form: FormData, createdById?: string) {
  const rows = [...new Set([...form.keys()].map(key => /^occupantName:(\d+)$/.exec(key)?.[1]).filter((id): id is string => Boolean(id)))];
  if (rows.length > 20) throw new Error("Najednou lze přidat nejvýše 20 obyvatel.");
  const selected = new Set<string>();
  const actor = createdById ? await tx.user.findUniqueOrThrow({ where: { id: createdById } }) : null;
  for (const id of rows) {
    const profileId = text(form, `occupantProfile:${id}`);
    const name = text(form, `occupantName:${id}`, true)!;
    if (name.length > 200) throw new Error("Jméno obyvatele je příliš dlouhé.");
    if (profileId) {
      if (profileId === primaryTenantId || selected.has(profileId)) throw new Error("Stejnou osobu není třeba mezi obyvatele přidávat dvakrát.");
      if (!actor || !await tx.tenant.findFirst({ where: { id: profileId, type: "PERSON", AND: tenantAccessWhere(actor) }, select: { id: true } })) throw new Error("Vybraný obyvatel není dostupná fyzická osoba.");
      selected.add(profileId);
    }
    await tx.occupant.create({ data: { leaseId, name, email: text(form, `occupantEmail:${id}`), phone: text(form, `occupantPhone:${id}`) } });
  }
}
