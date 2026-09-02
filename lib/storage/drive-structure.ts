import type { DocumentCategory } from "@prisma/client";
import { formatPropertyBusinessId } from "../business-identity";

export const PROPERTY_FOLDER_TREE = {
  documents: "01_Dokumenty",
  contracts: "01_Smlouvy",
  protocols: "02_Protokoly",
  technical: "03_Technická dokumentace",
  invoices: "04_Faktury a nabídky",
  energy: "05_Energie a pojištění",
  legal: "06_Právní",
  other: "99_Ostatní",
  photos: "02_Fotografie",
  reports: "03_Reporty",
  archive: "99_Archiv",
} as const;

export const DOCUMENT_CATEGORY_FOLDER: Record<DocumentCategory, keyof typeof PROPERTY_FOLDER_TREE> = {
  CONTRACT: "contracts",
  CONTRACT_ADDENDUM: "contracts",
  HANDOVER_PROTOCOL: "protocols",
  INSPECTION_PROTOCOL: "protocols",
  TECHNICAL_DOCUMENT: "technical",
  INVOICE: "invoices",
  OFFER: "invoices",
  ENERGY_CERTIFICATE: "energy",
  INSURANCE: "energy",
  LEGAL: "legal",
  PHOTO: "photos",
  OTHER: "other",
};

export function safeDriveName(value: string, fallback = "Nemovitost", maximumLength = 180) {
  return value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximumLength) || fallback;
}

export function propertyDriveFolderName(propertyCode: string, propertyName: string) {
  return `${formatPropertyBusinessId(propertyCode)}_${safeDriveName(propertyName)}`;
}
