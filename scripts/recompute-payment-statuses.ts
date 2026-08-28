import { prisma } from "../lib/db";
import { recomputeTransactionStatus } from "../lib/matching";

const apply = process.argv.includes("--apply");
if (apply && process.env.ALLOW_PAYMENT_STATUS_REPAIR !== "1") throw new Error("Apply vyžaduje ALLOW_PAYMENT_STATUS_REPAIR=1.");
const transactions = await prisma.bankTransaction.findMany({ where: { status: { not: "IGNORED" } }, select: { id: true, status: true } });
let fixed = 0;
for (const transaction of transactions) {
  const before = transaction.status;
  await recomputeTransactionStatus(transaction.id);
  const after = (await prisma.bankTransaction.findUnique({ where: { id: transaction.id }, select: { status: true } }))?.status;
  if (before !== after) {
    fixed += 1;
    console.log(`${transaction.id}: ${before} -> ${after}`);
  }
}
console.log(JSON.stringify({ scanned: transactions.length, fixed: apply ? fixed : 0, dryRun: !apply }));
await prisma.$disconnect();
