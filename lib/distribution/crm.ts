import { DistributionOpportunityStage, DistributionOptionStatus, Prisma } from "@prisma/client";
import { canSeeAll } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const distributionOpportunityStages: Record<DistributionOpportunityStage, string> = { NEW: "Nový", CONTACTED: "Kontaktován", QUALIFIED: "Kvalifikován", VIEWING: "Prohlídka", OFFER: "Nabídka", RESERVED: "Rezervace", WON: "Uzavřeno", LOST: "Ztraceno" };
export const distributionOptionStatuses: Record<DistributionOptionStatus, string> = { NONE: "Bez opce", PREPARING: "Příprava opce", OFFERED: "Opce nabídnuta", SIGNED: "Opce podepsána", EXERCISED: "Opce využita", EXPIRED: "Opce vypršela", CANCELLED: "Opce zrušena" };
type Actor = { id: string; role: string; allProperties?: boolean };
type OpportunityInput = {
  stage: DistributionOpportunityStage;
  askingPriceCents: number | null;
  offeredPriceCents: number | null;
  nextActionAt: Date | null;
  note?: string | null;
  optionStatus?: DistributionOptionStatus;
  optionExpiresAt?: Date | null;
  optionPriceCents?: number | null;
  optionReference?: string | null;
};

function assertInternal(actor: Actor) { if (!canSeeAll(actor.role)) throw new Error("Distribuční CRM je dostupné pouze interním správcům FlatCloud."); }
function validPrice(value: number | null | undefined) { return value == null || (Number.isSafeInteger(value) && value > 0); }
const allowedOptionTransitions: Record<DistributionOptionStatus, DistributionOptionStatus[]> = {
  NONE: ["PREPARING", "OFFERED", "SIGNED"],
  PREPARING: ["NONE", "OFFERED", "CANCELLED"],
  OFFERED: ["PREPARING", "SIGNED", "EXPIRED", "CANCELLED"],
  SIGNED: ["EXERCISED", "EXPIRED", "CANCELLED"],
  EXERCISED: ["NONE", "PREPARING"],
  EXPIRED: ["NONE", "PREPARING"],
  CANCELLED: ["NONE", "PREPARING"],
};
function assertOptionTransition(from: DistributionOptionStatus, to: DistributionOptionStatus) {
  if (from !== to && !allowedOptionTransitions[from].includes(to)) throw new Error("Tento přechod stavu opce není povolen.");
}
function optionInput(input: OpportunityInput, fallback: { optionStatus: DistributionOptionStatus; optionExpiresAt: Date | null; optionPriceCents: bigint | null; optionReference: string | null } = { optionStatus: "NONE", optionExpiresAt: null, optionPriceCents: null, optionReference: null }) {
  const optionStatus = input.optionStatus ?? fallback.optionStatus;
  const optionExpiresAt = input.optionExpiresAt === undefined ? fallback.optionExpiresAt : input.optionExpiresAt;
  const optionPriceValue = input.optionPriceCents === undefined ? fallback.optionPriceCents : input.optionPriceCents;
  const optionReference = input.optionReference === undefined ? fallback.optionReference : input.optionReference?.trim() || null;
  if (!Object.values(DistributionOptionStatus).includes(optionStatus)) throw new Error("Vyberte platný stav opce.");
  if ((typeof optionPriceValue === "number" && !validPrice(optionPriceValue)) || (typeof optionPriceValue === "bigint" && optionPriceValue <= BigInt(0))) throw new Error("Cena opce musí být vyšší než nula.");
  if (["OFFERED", "SIGNED"].includes(optionStatus) && (!optionExpiresAt || optionPriceValue === null)) throw new Error("Nabídnutá nebo podepsaná opce vyžaduje cenu a datum platnosti.");
  if (["SIGNED", "EXERCISED"].includes(optionStatus) && !optionReference) throw new Error("Podepsaná nebo využitá opce vyžaduje referenci dokumentu.");
  return { optionStatus, optionExpiresAt: optionStatus === "NONE" ? null : optionExpiresAt, optionPriceCents: optionStatus === "NONE" || optionPriceValue === null ? null : BigInt(optionPriceValue), optionReference: optionStatus === "NONE" ? null : optionReference };
}
function eventData(opportunityId: string, fromStage: DistributionOpportunityStage | null, input: OpportunityInput, option: ReturnType<typeof optionInput>, actorId: string) {
  return { opportunityId, fromStage, toStage: input.stage, optionStatus: option.optionStatus, askingPriceCents: input.askingPriceCents === null ? null : BigInt(input.askingPriceCents), offeredPriceCents: input.offeredPriceCents === null ? null : BigInt(input.offeredPriceCents), optionPriceCents: option.optionPriceCents, optionReference: option.optionReference, optionExpiresAt: option.optionExpiresAt, nextActionAt: input.nextActionAt, note: input.note?.trim() || null, createdById: actorId };
}

export async function createDistributionProspect(actor: Actor, input: { name: string; email?: string | null; phone?: string | null; source?: string | null; note?: string | null }) {
  assertInternal(actor);
  if (input.name.trim().length < 2) throw new Error("Doplňte jméno zájemce.");
  if (!input.email && !input.phone) throw new Error("Doplňte alespoň e-mail nebo telefon zájemce.");
  return prisma.$transaction(async (tx) => {
    const prospect = await tx.distributionProspect.create({ data: { name: input.name.trim(), email: input.email || null, phone: input.phone || null, source: input.source || null, note: input.note || null, createdById: actor.id } });
    await tx.auditLog.create({ data: { userId: actor.id, action: "DISTRIBUTION_PROSPECT_CREATED", entityType: "DistributionProspect", entityId: prospect.id, details: { name: prospect.name, source: prospect.source, hasEmail: Boolean(prospect.email), hasPhone: Boolean(prospect.phone) } } });
    return prospect;
  });
}

export async function createDistributionOpportunity(actor: Actor, input: OpportunityInput & { prospectId: string; unitId: string }) {
  assertInternal(actor);
  if (!Object.values(DistributionOpportunityStage).includes(input.stage)) throw new Error("Vyberte platnou fázi příležitosti.");
  if (!validPrice(input.askingPriceCents) || !validPrice(input.offeredPriceCents)) throw new Error("Cena musí být vyšší než nula.");
  const option = optionInput(input);
  return prisma.$transaction(async (tx) => {
    const [prospect, unit] = await Promise.all([
      tx.distributionProspect.findFirst({ where: { id: input.prospectId, active: true }, select: { id: true } }),
      tx.unit.findFirst({ where: { id: input.unitId, property: { active: true, flatcloudConsolidationBasisPoints:{gt:0} } }, select: { id: true, propertyId: true } }),
    ]);
    if (!prospect) throw new Error("Aktivní zájemce nebyl nalezen.");
    if (!unit) throw new Error("Jednotka není součástí potvrzeného aktiva FlatCloud.");
    const opportunity = await tx.distributionOpportunity.create({ data: { prospectId: input.prospectId, unitId: input.unitId, stage: input.stage, askingPriceCents: input.askingPriceCents === null ? null : BigInt(input.askingPriceCents), offeredPriceCents: input.offeredPriceCents === null ? null : BigInt(input.offeredPriceCents), nextActionAt: input.nextActionAt, note: input.note?.trim() || null, ...option, createdById: actor.id } });
    await tx.distributionOpportunityEvent.create({ data: eventData(opportunity.id, null, input, option, actor.id) });
    await tx.auditLog.create({ data: { userId: actor.id, propertyId: unit.propertyId, action: "DISTRIBUTION_OPPORTUNITY_CREATED", entityType: "DistributionOpportunity", entityId: opportunity.id, details: { prospectId: input.prospectId, unitId: input.unitId, stage: input.stage, optionStatus: option.optionStatus, askingPriceCents: input.askingPriceCents, offeredPriceCents: input.offeredPriceCents, nextActionAt: input.nextActionAt?.toISOString() || null } } });
    return opportunity;
  });
}

export async function updateDistributionOpportunity(actor: Actor, id: string, input: OpportunityInput) {
  assertInternal(actor);
  if (!Object.values(DistributionOpportunityStage).includes(input.stage)) throw new Error("Vyberte platnou fázi příležitosti.");
  if (!validPrice(input.askingPriceCents) || !validPrice(input.offeredPriceCents)) throw new Error("Cena musí být vyšší než nula.");
  return prisma.$transaction(async (tx) => {
    const current = await tx.distributionOpportunity.findFirst({ where: { id, unit: { property: { active: true, flatcloudConsolidationBasisPoints:{gt:0} } } }, select: { id: true, stage: true, askingPriceCents: true, offeredPriceCents: true, nextActionAt: true, note: true, optionStatus: true, optionExpiresAt: true, optionPriceCents: true, optionReference: true, unit: { select: { propertyId: true } } } });
    if (!current) throw new Error("Příležitost nebyla nalezena v interním rozsahu FlatCloud.");
    const option = optionInput(input, current);
    assertOptionTransition(current.optionStatus, option.optionStatus);
    const updated = await tx.distributionOpportunity.update({ where: { id }, data: { stage: input.stage, askingPriceCents: input.askingPriceCents === null ? null : BigInt(input.askingPriceCents), offeredPriceCents: input.offeredPriceCents === null ? null : BigInt(input.offeredPriceCents), nextActionAt: input.nextActionAt, note: input.note?.trim() || null, ...option } });
    await tx.distributionOpportunityEvent.create({ data: eventData(id, current.stage, input, option, actor.id) });
    await tx.auditLog.create({ data: { userId: actor.id, propertyId: current.unit.propertyId, action: "DISTRIBUTION_OPPORTUNITY_UPDATED", entityType: "DistributionOpportunity", entityId: id, details: { before: { stage: current.stage, optionStatus: current.optionStatus, askingPriceCents: current.askingPriceCents?.toString() || null, offeredPriceCents: current.offeredPriceCents?.toString() || null, nextActionAt: current.nextActionAt?.toISOString() || null }, after: { stage: input.stage, optionStatus: option.optionStatus, askingPriceCents: input.askingPriceCents, offeredPriceCents: input.offeredPriceCents, nextActionAt: input.nextActionAt?.toISOString() || null } } satisfies Prisma.InputJsonObject } });
    return updated;
  });
}
