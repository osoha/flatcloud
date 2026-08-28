import { pathToFileURL } from "node:url";
import { PaymentStatus } from "@prisma/client";
import { prisma } from "../lib/db";
import { expectedTransactionStatus } from "../lib/matching";

const include = { allocations: { include: { charge: { include: { allocations: true, securityDepositOffsets: true, creditApplications: true } } } }, securityDepositReceipts: true } as const;
type RepairDb = Pick<typeof prisma, "bankTransaction">;

export async function repairPaymentStatuses(db: RepairDb, apply: boolean) {
  const transactions = await db.bankTransaction.findMany({ include, orderBy: { createdAt: "asc" } });
  const report = { scanned: transactions.length, unchanged: 0, fixed: 0, ignoredSkipped: 0, invalidSkipped: 0, transitions: {} as Record<string, number> };
  for (const transaction of transactions) {
    if (transaction.status === PaymentStatus.IGNORED) { report.ignoredSkipped += 1; continue; }
    const expected = expectedTransactionStatus(transaction);
    if (expected.invalid || !expected.status) { report.invalidSkipped += 1; continue; }
    if (expected.status === transaction.status) { report.unchanged += 1; continue; }
    const transition = `${transaction.status} -> ${expected.status}`;
    report.transitions[transition] = (report.transitions[transition] || 0) + 1;
    if (apply) {
      await db.bankTransaction.update({ where: { id: transaction.id }, data: { status: expected.status } });
      report.fixed += 1;
    }
  }
  return report;
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && process.env.ALLOW_PAYMENT_STATUS_REPAIR !== "1") throw new Error("--apply vyžaduje ALLOW_PAYMENT_STATUS_REPAIR=1.");
  console.log(JSON.stringify({ ...(await repairPaymentStatuses(prisma, apply)), dryRun: !apply }, null, 2));
  await prisma.$disconnect();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
