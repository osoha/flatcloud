import { ChargeCategory, Prisma } from "@prisma/client";
import { businessDateKey } from "./calendar";

type Tx = Prisma.TransactionClient;
type FinancialItem = {
  id: string;
  category: ChargeCategory;
  amountCents: number;
  validFrom: Date;
  validTo: Date | null;
  active: boolean;
};
type Proposal = { effectiveFrom: Date; status: string };

const recurringCategories = new Set<ChargeCategory>([
  ChargeCategory.RENT,
  ChargeCategory.SERVICES,
]);

function nextBusinessDay(value: Date) {
  return new Date(value.getTime() + 86_400_000);
}

export function futureLeaseFinancialChangeDates(
  input: { paymentItems: FinancialItem[]; rentChangeProposals?: Proposal[] },
  cutoff: Date,
) {
  const cutoffKey = businessDateKey(cutoff);
  const dates = new Set<string>();
  for (const item of input.paymentItems) {
    if (!item.active || !recurringCategories.has(item.category)) continue;
    const fromKey = businessDateKey(item.validFrom);
    if (fromKey > cutoffKey) dates.add(fromKey);
    if (item.validTo) {
      const followingKey = businessDateKey(nextBusinessDay(item.validTo));
      if (followingKey > cutoffKey) dates.add(followingKey);
    }
  }
  for (const proposal of input.rentChangeProposals || []) {
    if (
      proposal.status === "CONFIRMED" &&
      businessDateKey(proposal.effectiveFrom) > cutoffKey
    ) {
      dates.add(businessDateKey(proposal.effectiveFrom));
    }
  }
  return [...dates].sort();
}

export async function closeLeaseFinancialVersionsAt(
  tx: Tx,
  leaseId: string,
  cutoff: Date,
) {
  const lease = await tx.lease.findUniqueOrThrow({
    where: { id: leaseId },
    include: {
      paymentItems: {
        where: {
          active: true,
          category: { in: [ChargeCategory.RENT, ChargeCategory.SERVICES] },
        },
        orderBy: [{ validFrom: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  const paymentItems = lease.paymentItems;
  const cutoffKey = businessDateKey(cutoff);
  const amountAtCutoff = (category: ChargeCategory) => {
    const effective = paymentItems.filter(
      (item) =>
        item.category === category &&
        businessDateKey(item.validFrom) <= cutoffKey &&
        (!item.validTo || businessDateKey(item.validTo) >= cutoffKey),
    );
    return effective.length
      ? effective.reduce((sum, item) => sum + item.amountCents, 0)
      : null;
  };
  const rentCents = amountAtCutoff(ChargeCategory.RENT) ?? lease.rentCents;
  const servicesCents =
    amountAtCutoff(ChargeCategory.SERVICES) ?? lease.servicesCents;
  const deactivatedItemIds: string[] = [];
  const closedItemIds: string[] = [];

  for (const item of paymentItems) {
    if (businessDateKey(item.validFrom) > cutoffKey) {
      await tx.leasePaymentItem.update({
        where: { id: item.id },
        data: { active: false },
      });
      deactivatedItemIds.push(item.id);
    } else if (!item.validTo || businessDateKey(item.validTo) > cutoffKey) {
      await tx.leasePaymentItem.update({
        where: { id: item.id },
        data: { validTo: cutoff },
      });
      closedItemIds.push(item.id);
    }
  }

  await tx.lease.update({
    where: { id: leaseId },
    data: { rentCents, servicesCents },
  });
  return { rentCents, servicesCents, deactivatedItemIds, closedItemIds };
}
