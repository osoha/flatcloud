import { Prisma, TenantType } from "@prisma/client";
import { stringArray, text } from "./forms";
import { normalizePayerAccount } from "./owner-bank-account";

export function tenantDataFromForm(form: FormData): Prisma.TenantCreateInput {
  const typeRaw = text(form, "tenantType") || text(form, "type") || "PERSON";
  const type = Object.values(TenantType).includes(typeRaw as TenantType) ? typeRaw as TenantType : TenantType.PERSON;
  const permanentAddress = type === TenantType.PERSON ? text(form, "permanentAddress") : null;
  const billingAddress = type === TenantType.COMPANY ? text(form, "billingAddress") : null;
  const billingEmail = type === TenantType.COMPANY ? text(form, "billingEmail") : null;
  const communicationEmail = type === TenantType.COMPANY ? text(form, "communicationEmail") : text(form, "email");
  return {
    type,
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
