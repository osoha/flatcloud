import { Prisma, TenantType } from "@prisma/client";
import { dateValue, stringArray, text } from "./forms";
import { normalizePayerAccount } from "./owner-bank-account";
import { validIllustration, suggestedIllustration } from "./illustration-library";

export function tenantIdentityFromForm(form: FormData, type: TenantType) {
  if (type !== TenantType.PERSON) return { dateOfBirth: null, identityDocumentNumber: null, passportNumber: null };
  const dateOfBirth = dateValue(form, "dateOfBirth");
  if (dateOfBirth && (dateOfBirth.toISOString().slice(0, 10) !== text(form, "dateOfBirth") || dateOfBirth > new Date() || dateOfBirth.getUTCFullYear() < 1850)) throw new Error("Zadejte platné datum narození v minulosti.");
  const identityDocumentNumber = text(form, "identityDocumentNumber"), passportNumber = text(form, "passportNumber");
  if ([identityDocumentNumber, passportNumber].some(value => value && value.length > 80)) throw new Error("Číslo dokladu může mít nejvýše 80 znaků.");
  return { dateOfBirth, identityDocumentNumber, passportNumber };
}

export function tenantDataFromForm(form: FormData): Prisma.TenantCreateInput {
  const typeRaw = text(form, "tenantType") || text(form, "type") || "PERSON";
  const type = Object.values(TenantType).includes(typeRaw as TenantType) ? typeRaw as TenantType : TenantType.PERSON;
  const permanentAddress = type === TenantType.PERSON ? text(form, "permanentAddress") : null;
  const billingAddress = type === TenantType.COMPANY ? text(form, "billingAddress") : null;
  const billingEmail = type === TenantType.COMPANY ? text(form, "billingEmail") : null;
  const communicationEmail = type === TenantType.COMPANY ? text(form, "communicationEmail") : text(form, "email");
  return {
    type,
    ...tenantIdentityFromForm(form, type),
    avatarChoice: validIllustration(form.get("avatarChoice"), type === TenantType.COMPANY ? "company" : "person")
      ? String(form.get("avatarChoice")) : suggestedIllustration(type === TenantType.COMPANY ? "company" : "person", crypto.randomUUID()),
    name: text(form, "name", true)!,
    email: communicationEmail || billingEmail,
    phone: text(form, "phone"),
    address: permanentAddress || billingAddress,
    ico: type === TenantType.COMPANY ? text(form, "ico") : null,
    permanentAddress,
    correspondenceAddress: text(form, "correspondenceAddress"),
    billingAddress,
    billingEmail,
    communicationEmail,
    note: text(form, "tenantNote") || text(form, "note"),
    payerAccounts: Array.from(new Set(stringArray(form, "payerAccounts").map(normalizePayerAccount).filter(Boolean))),
    active: true,
  };
}
