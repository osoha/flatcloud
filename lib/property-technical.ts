import { Prisma } from "@prisma/client";
import { boolValue, floatValue, intValue, moneyToCents, text } from "./forms";

export type PropertyTechnicalData = {
  buildingType?: string | null;
  constructionType?: string | null;
  yearBuilt?: number | null;
  yearRenovated?: number | null;
  floorsAbove?: number | null;
  floorsBelow?: number | null;
  totalAreaM2?: number | null;
  builtUpAreaM2?: number | null;
  landAreaM2?: number | null;
  heatingType?: string | null;
  hotWaterType?: string | null;
  energyRating?: string | null;
  elevatorCount?: number | null;
  parkingSpaces?: number | null;
  electricityEan?: string | null;
  gasEic?: string | null;
  cadastralArea?: string | null;
  parcelNumber?: string | null;
  landRegistryNumber?: string | null;
  buildingNumber?: string | null;
  insurer?: string | null;
  policyNumber?: string | null;
  annualInsuranceCents?: number | null;
  barrierFree?: boolean;
  hasCellars?: boolean;
  hasBalconies?: boolean;
  technicalNote?: string | null;
};

function optionalInt(form: FormData, key: string) {
  const raw = String(form.get(key) ?? "").trim();
  return raw ? intValue(form, key) : null;
}

export function parsePropertyTechnicalForm(form: FormData): PropertyTechnicalData {
  const annualInsuranceRaw = String(form.get("annualInsurance") ?? "").trim();
  return {
    buildingType: text(form, "buildingType"),
    constructionType: text(form, "constructionType"),
    yearBuilt: optionalInt(form, "yearBuilt"),
    yearRenovated: optionalInt(form, "yearRenovated"),
    floorsAbove: optionalInt(form, "floorsAbove"),
    floorsBelow: optionalInt(form, "floorsBelow"),
    totalAreaM2: floatValue(form, "totalAreaM2"),
    builtUpAreaM2: floatValue(form, "builtUpAreaM2"),
    landAreaM2: floatValue(form, "landAreaM2"),
    heatingType: text(form, "heatingType"),
    hotWaterType: text(form, "hotWaterType"),
    energyRating: text(form, "energyRating"),
    elevatorCount: optionalInt(form, "elevatorCount"),
    parkingSpaces: optionalInt(form, "parkingSpaces"),
    electricityEan: text(form, "electricityEan"),
    gasEic: text(form, "gasEic"),
    cadastralArea: text(form, "cadastralArea"),
    parcelNumber: text(form, "parcelNumber"),
    landRegistryNumber: text(form, "landRegistryNumber"),
    buildingNumber: text(form, "buildingNumber"),
    insurer: text(form, "insurer"),
    policyNumber: text(form, "policyNumber"),
    annualInsuranceCents: annualInsuranceRaw ? moneyToCents(form, "annualInsurance") : null,
    barrierFree: boolValue(form, "barrierFree"),
    hasCellars: boolValue(form, "hasCellars"),
    hasBalconies: boolValue(form, "hasBalconies"),
    technicalNote: text(form, "technicalNote"),
  };
}

export function readPropertyTechnicalData(value: Prisma.JsonValue | null | undefined): PropertyTechnicalData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as PropertyTechnicalData;
}

export function technicalDataJson(value: PropertyTechnicalData): Prisma.InputJsonObject {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== "")) as Prisma.InputJsonObject;
}

export const buildingTypeOptions: [string, string][] = [
  ["", "Neuvedeno"],
  ["APARTMENT_BUILDING", "Bytový dům"],
  ["COMMERCIAL", "Komerční objekt"],
  ["MIXED", "Smíšený objekt"],
  ["FAMILY_HOUSE", "Rodinný dům"],
  ["OTHER", "Jiný typ"],
];

export const constructionTypeOptions: [string, string][] = [
  ["", "Neuvedeno"],
  ["BRICK", "Cihlová"],
  ["PANEL", "Panelová"],
  ["MIXED", "Smíšená"],
  ["WOOD", "Dřevěná"],
  ["STEEL", "Ocelová"],
  ["OTHER", "Jiná"],
];

export const energyRatingOptions: [string, string][] = [
  ["", "Neuvedeno / bez PENB"],
  ...["A", "B", "C", "D", "E", "F", "G"].map((rating) => [rating, `Třída ${rating}`] as [string, string]),
];

export function optionLabel(options: [string, string][], value?: string | null) {
  return options.find(([key]) => key === value)?.[1] || value || "Neuvedeno";
}
