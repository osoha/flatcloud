import { leaseAccessWhere } from "../access";
import { prisma } from "../db";
import { contractingPartyNames } from "../lease-parties";
import { domesticAccountLabel, formatIban } from "../owner-bank-account";
import { rentPaymentPayload } from "../rent-payment-qr";
import { paymentCoverVersions } from "./core";

export async function loadPaymentCover(actor: { id: string; role: string; allProperties?: boolean }, leaseId: string, now = new Date()) {
  const lease = await prisma.lease.findFirst({ where: { id: leaseId, AND: leaseAccessWhere(actor) }, include: {
    tenant: true, parties: { include: { tenant: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
    ownerBankAccount: true, paymentItems: true, unit: { include: { property: true } },
  } });
  if (!lease) return null;
  const versions = paymentCoverVersions(lease, now);
  return { lease, versions, issuedAt: now, tenantNames: contractingPartyNames(lease),
    address: [lease.unit.property.address, [lease.unit.property.postalCode, lease.unit.property.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    account: lease.ownerBankAccount ? domesticAccountLabel(lease.ownerBankAccount.accountNumber, lease.ownerBankAccount.bankCode) || formatIban(lease.ownerBankAccount.iban) || "Neuvedeno" : "Neuvedeno",
    qrFor: (totalCents: number) => rentPaymentPayload(lease.ownerBankAccount, lease.variableSymbol, totalCents, lease.currency),
  };
}
