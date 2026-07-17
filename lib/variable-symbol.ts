import type { Prisma } from "@prisma/client";
import { readPropertyTechnicalData } from "./property-technical";

type PropertyForVs = { address: string; technicalData?: Prisma.JsonValue | null };
type UnitForVs = { label: string; leases: { id?: string }[] };

function digits(value: string | null | undefined) {
  return (value || "").replace(/\D/g, "");
}

function buildingNumber(property: PropertyForVs) {
  const technical = readPropertyTechnicalData(property.technicalData);
  const technicalDigits = digits(technical.buildingNumber);
  if (technicalDigits) return technicalDigits;
  const slashNumber = property.address.match(/\b\d+\s*\/\s*\d+[a-zA-Z]?\b/)?.[0];
  if (slashNumber) return digits(slashNumber);
  return digits(property.address.match(/\b\d+[a-zA-Z]?\b/)?.[0]);
}

function unitNumber(label: string) {
  const explicit = label.match(/(?:byt|bj|jednotka|č\.?)[^\d]{0,8}(\d+)/i)?.[1];
  if (explicit) return explicit;
  const matches = label.match(/\d+/g);
  return matches?.at(-1) || "";
}

export function validateVariableSymbol(value: string) {
  if (!/^\d{1,10}$/.test(value)) throw new Error("Variabilní symbol musí obsahovat 1 až 10 číslic.");
  return value;
}

export function proposedVariableSymbol(property: PropertyForVs, unit: UnitForVs, used: Set<string>) {
  const building = buildingNumber(property);
  const unitPartRaw = unitNumber(unit.label);
  if (!building || !unitPartRaw) return null;
  const unitPart = unitPartRaw.padStart(2, "0");
  let order = unit.leases.length + 1;
  for (let attempts = 0; attempts < 99; attempts += 1, order += 1) {
    const candidate = `${building}${unitPart}${String(order).padStart(2, "0")}`;
    if (candidate.length > 10) return null;
    if (!used.has(candidate)) return candidate;
  }
  return null;
}
export async function assertUniqueVariableSymbol(tx: Prisma.TransactionClient, value: string, excludeLeaseId?: string) {
  const lockKey = `flatcloud:lease-variable-symbol:${value}`;
  await tx.$queryRaw<Array<{ locked: number }>>`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  const duplicate = await tx.lease.findFirst({
    where: { variableSymbol: value, ...(excludeLeaseId ? { id: { not: excludeLeaseId } } : {}) },
    select: { id: true },
  });
  if (duplicate) throw new Error("Variabilní symbol už používá jiná smlouva v evidenci.");
}

