import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { text, boolValue, dateValue } from "./forms";
import { assertUniqueVariableSymbol } from "./variable-symbol";
import { leaseStatusAt } from "./lease-lifecycle-core";

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)); }
function day(form: FormData, key: string) {
  const raw = text(form, key, true)!;
  const value = dateValue(form, key, true)!;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || value.toISOString().slice(0, 10) !== raw) throw new Error("Neplatné datum účinnosti.");
  return value;
}
export async function transferOwnership(input: { propertyId: string; unitId?: string; actorId: string; form: FormData }) {
  const { propertyId, unitId, actorId, form } = input;
  const payment = text(form, "mode") === "payment-recipient";
  if (!boolValue(form, "confirm")) throw new Error("Změnu je nutné výslovně potvrdit.");
  const requestId = text(form, "requestId", true)!;
  if (!/^[a-f0-9-]{36}$/.test(requestId)) throw new Error("Obnovte formulář změny.");
  const reason = text(form, "reason", true)!;
  const effectiveAt = day(form, "effectiveAt");
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date());
  if (effectiveAt.toISOString().slice(0, 10) > today) throw new Error("Budoucí převod potvrďte nejdříve v den jeho účinnosti.");
  const ownerId = text(form, "ownerId", true)!;
  const accountId = payment ? text(form, "ownerBankAccountId", true)! : null;
  if (payment && !unitId) throw new Error("Příjemce plateb se potvrzuje u jednotky.");
  const expected = text(form, "expectedOwnerId", true)!;
  const expectedAccount = text(form,"expectedAccountId");
  const fingerprint = createHash("sha256").update(JSON.stringify({propertyId,unitId,actorId,payment,reason,effectiveAt,ownerId,accountId,expected,expectedAccount,previousValidFrom:text(form,"previousValidFrom")})).digest("hex");
  const auditId = `ownership:${requestId}`;
  return prisma.$transaction(async tx => {
    // The property lock serializes property/unit transfers and recipient confirmations.
    await tx.$queryRaw`SELECT id FROM "Property" WHERE id = ${propertyId} FOR UPDATE`;
    const repeated = await tx.auditLog.findUnique({ where: { id: auditId } });
    if (repeated) {
      if ((repeated.details as Prisma.JsonObject)?.fingerprint !== fingerprint) throw new Error("Tento požadavek už byl použit pro jinou změnu.");
      return;
    }
    const property = await tx.property.findUniqueOrThrow({ where: { id: propertyId } });
    const rows = unitId
      ? await tx.unitOwnership.findMany({ where: { unitId, unit: { propertyId } }, include: { owner: true } })
      : await tx.propertyOwnership.findMany({ where: { propertyId }, include: { owner: true } });
    if (unitId && !await tx.unit.findFirst({ where: { id: unitId, propertyId } })) throw new Error("Jednotka nebyla nalezena.");
    if (rows.length > 1) throw new Error("Více spoluvlastníků vyžaduje samostatnou změnu podílů; hromadné nahrazení není povoleno.");
    if (!payment && ((rows[0] && rows[0].shareBasisPoints !== 10000) || (!unitId && property.ownershipMode !== "WHOLE_OBJECT"))) throw new Error("Tento převod vyžaduje jednoho 100% vlastníka. Změna spoluvlastnických podílů nebo profilu SVJ se nesmí vydávat za převod celého vlastnictví.");
    const oldOwnerId = rows[0]?.ownerId || property.ownerId;
    if (oldOwnerId !== expected) throw new Error("Vlastník se mezitím změnil. Obnovte formulář.");
    const owner = await tx.owner.findFirst({ where: { id: ownerId, active: true } });
    if (!owner) throw new Error("Aktivní vlastník nebyl nalezen.");
    const before = json({ property: { id: property.id, ownerId: property.ownerId, communicationOwnerId: property.communicationOwnerId, active: property.active }, ownerships: rows });
    const entityType = unitId ? "Unit" : "Property";
    const entityId = unitId || propertyId;
    if (payment) {
      if (ownerId !== oldOwnerId || !rows[0]) throw new Error("Účet musí patřit aktuálnímu vlastníkovi jednotky.");
      if (("ownerBankAccountId" in rows[0] ? rows[0].ownerBankAccountId : null) !== expectedAccount) throw new Error("Příjemce plateb se mezitím změnil. Obnovte formulář.");
      // Applying a historical/future account to today's lease would rewrite its meaning.
      if (effectiveAt.toISOString().slice(0,10) !== today) throw new Error("Změnu příjemce plateb lze potvrdit pouze k dnešku.");
      const account = await tx.ownerBankAccount.findFirst({ where: { id: accountId!, ownerId, active: true } });
      if (!account) throw new Error("Účet nepatří aktuálnímu vlastníkovi nebo není aktivní.");
      const leases = await tx.lease.findMany({ where: { unitId }, select: { id:true, ownerBankAccountId:true, variableSymbol:true, startDate:true,endDate:true,terminatedOn:true,cancelledAt:true } });
      const affected = leases.filter(lease => leaseStatusAt(lease) !== "ENDED");
      for (const lease of affected) await assertUniqueVariableSymbol(tx, account.id, lease.variableSymbol, lease.id);
      await tx.unitOwnership.update({ where: { id: rows[0].id }, data: { ownerBankAccountId: account.id } });
      await tx.propertyPaymentAccount.upsert({ where:{ propertyId_ownerBankAccountId:{propertyId,ownerBankAccountId:account.id}},update:{active:true},create:{propertyId,ownerBankAccountId:account.id,active:true} });
      if (affected.length) await tx.lease.updateMany({ where:{id:{in:affected.map(l=>l.id)}},data:{ownerBankAccountId:account.id} });
      await tx.auditLog.create({ data:{id:auditId,userId:actorId,propertyId,entityType,entityId,action:"OWNERSHIP_PAYMENT_RECIPIENT_CONFIRMED",details:{fingerprint,reason,effectiveAt:effectiveAt.toISOString(),before,previousLeases:json(affected),after:json({owner,account,leaseIds:affected.map(l=>l.id)})}} });
      return;
    }
    if (ownerId === oldOwnerId) throw new Error("Vyberte nového vlastníka; účet se mění samostatně.");
    const scopeKey = unitId ? `unit:${unitId}` : `property:${propertyId}`;
    const periods = await tx.ownershipPeriod.findMany({ where:{scopeKey},orderBy:{validFrom:"asc"} });
    const open = periods.filter(p=>p.validTo===null);
    if (open.length > 1 || (open[0] && (open[0].ownerId!==oldOwnerId || open[0].shareBasisPoints!==10000))) throw new Error("Potvrzená historie neodpovídá aktuálnímu vlastníkovi; nejprve prověřte vlastnická období.");
    if (periods.some(p=>p.validFrom>=effectiveAt || (p.validTo && p.validTo>=effectiveAt))) throw new Error("Datum převodu překrývá již potvrzenou historii.");
    const previousTo = new Date(effectiveAt); previousTo.setUTCDate(previousTo.getUTCDate()-1);
    if (open[0]) {
      await tx.ownershipPeriod.update({where:{id:open[0].id},data:{validTo:previousTo}});
    } else {
      const previousFrom = day(form,"previousValidFrom");
      if (previousFrom>=effectiveAt || periods.some(p=>!p.validTo || p.validTo>=previousFrom)) throw new Error("Počátek původního vlastnictví musí předcházet převodu a nesmí překrývat historii.");
      await tx.ownershipPeriod.create({data:{scopeKey,propertyId,unitId,ownerId:oldOwnerId,shareBasisPoints:rows[0]?.shareBasisPoints||10000,validFrom:previousFrom,validTo:previousTo,sourceNote:reason,confirmedById:actorId}});
    }
    await tx.ownershipPeriod.create({data:{scopeKey,propertyId,unitId,ownerId,shareBasisPoints:10000,validFrom:effectiveAt,sourceNote:reason,confirmedById:actorId}});
    // Keep the current-state row ID; its complete old contents live in the immutable audit snapshot.
    // No ownership row, document, lease, grant or payment is deleted.
    if (unitId) {
      if (rows[0]) await tx.unitOwnership.update({where:{id:rows[0].id},data:{ownerId,ownerBankAccountId:null,shareBasisPoints:10000,note:reason}});
      else await tx.unitOwnership.create({data:{unitId,ownerId,ownerBankAccountId:null,shareBasisPoints:10000,note:reason}});
    } else {
      if (rows[0]) await tx.propertyOwnership.update({where:{id:rows[0].id},data:{ownerId,shareBasisPoints:10000,note:reason}});
      else await tx.propertyOwnership.create({data:{propertyId,ownerId,shareBasisPoints:10000,note:reason}});
      await tx.property.update({where:{id:propertyId},data:{ownerId}});
    }
    await tx.auditLog.create({data:{id:auditId,userId:actorId,propertyId,entityType,entityId,action:"OWNERSHIP_TRANSFER_CONFIRMED",details:{fingerprint,reason,effectiveAt:effectiveAt.toISOString(),before,previousPeriods:json(periods),after:json({owner,ownerBankAccountId:unitId?null:undefined})}}});
  }, { timeout: 15000 });
}

export async function correctOwnershipPeriod(actorId: string, form: FormData) {
  const periodId = text(form,"periodId",true)!;
  const reason = text(form,"reason",true)!;
  if (!boolValue(form,"confirm")) throw new Error("Opravu je nutné výslovně potvrdit.");
  const from = day(form,"validFrom");
  const to = text(form,"validTo") ? day(form,"validTo") : null;
  const expected = text(form,"expectedUpdatedAt",true)!;
  const found = await prisma.ownershipPeriod.findUniqueOrThrow({where:{id:periodId}});
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "Property" WHERE id = ${found.propertyId} FOR UPDATE`;
    const old = await tx.ownershipPeriod.findUniqueOrThrow({where:{id:periodId}});
    if(old.updatedAt.toISOString()!==expected) throw new Error("Období se mezitím změnilo. Obnovte formulář.");
    if(Boolean(old.validTo)!==Boolean(to)) throw new Error("Oprava období nesmí nahradit převod nebo znovu otevřít ukončené vlastnictví.");
    const today = new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Prague"}).format(new Date());
    if(!to && from.toISOString().slice(0,10)>today) throw new Error("Aktuální vlastnictví nelze opravou odsunout do budoucnosti.");
    if(to && to<from) throw new Error("Konec období musí následovat po jeho začátku.");
    const overlap = await tx.ownershipPeriod.findFirst({where:{scopeKey:old.scopeKey,id:{not:old.id},validFrom:{lte:to||new Date("9999-12-31T12:00:00Z")},OR:[{validTo:null},{validTo:{gte:from}}]}});
    if(overlap) throw new Error("Oprava překrývá jiné potvrzené období.");
    const updated = await tx.ownershipPeriod.update({where:{id:old.id},data:{validFrom:from,validTo:to,sourceNote:reason}});
    await tx.auditLog.create({data:{userId:actorId,propertyId:old.propertyId,entityType:old.unitId?"Unit":"Property",entityId:old.unitId||old.propertyId,action:"OWNERSHIP_PERIOD_CORRECTED",details:{reason,effectiveAt:from.toISOString(),before:json(old),after:json(updated)}}});
  });
}
