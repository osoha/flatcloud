import { existsSync, readFileSync } from "node:fs";
import { calculateSecurityDepositSnapshot } from "../lib/security-deposit-core";

const read = (path: string) => readFileSync(path, "utf8");
const checks: Array<[string, boolean]> = [
  ["tenant entry", read("app/najemnici/page.tsx").includes("/najemnici/novy") && existsSync("app/najemnici/novy/page.tsx")],
  ["lease entry", existsSync("app/smlouvy/nova/page.tsx")],
  ["registry tabs", read("app/najemnici/page.tsx").includes("registry-tabs") && read("app/smlouvy/page.tsx").includes("registry-tabs")],
  ["access filtering", read("app/najemnici/page.tsx").includes("leaseAccessWhere(user)")],
  ["property icon", existsSync("components/PropertyIcon.tsx")],
  ["UNIT_ONLY", read("lib/property-technical.ts").includes("UNIT_ONLY")],
  ["deposit schema", read("prisma/schema.prisma").includes("model SecurityDepositTerm") && read("prisma/schema.prisma").includes("model SecurityDepositMovement")],
  ["deposit migration checks", read("prisma/migrations/20260828080000_v21_6_security_deposits/migration.sql").includes("amountCents_check")],
  ["version", JSON.parse(read("package.json")).version === "1.21.6"],
  ["CI", read(".github/workflows/ci.yml").includes("verify:v21.6")],
  ["deposit APIs", existsSync("app/api/properties/[id]/leases/[leaseId]/deposit/terms/route.ts") && existsSync("app/api/properties/[id]/leases/[leaseId]/deposit/movements/route.ts")],
  ["settlement APIs", existsSync("app/api/properties/[id]/leases/[leaseId]/settlement/route.ts") && existsSync("app/api/properties/[id]/leases/[leaseId]/settlement/apply/route.ts")],
  ["deposit from bank", existsSync("app/api/properties/[id]/transactions/[transactionId]/deposit/route.ts")],
  ["deposit UI", read("app/smlouvy/[leaseId]/page.tsx").includes("Kauce") && existsSync("app/kauce/page.tsx")],
  ["credit source of truth", read("lib/credit.ts").includes("remainingCreditCents") && !read("prisma/schema.prisma").includes("remainingCents")],
  ["account verification source", read("prisma/schema.prisma").includes("notificationVerifiedAt") && read("lib/bank-email-verification.ts").includes("verificationCodeForAccount")],
  ["reset deposit transactions", read("scripts/reset-test-tenants.ts").includes("securityDepositMovements") && read("scripts/reset-test-tenants.ts").includes("recomputeTransactionStatus")],
  ["shared payment status", read("app/api/payments/manual/route.ts").includes("recomputeTransactionStatus") && read("app/api/properties/[id]/payments/manual/route.ts").includes("recomputeTransactionStatus")],
  ["charge three sources", read("lib/charges.ts").includes("securityDepositOffsets") && read("lib/charges.ts").includes("creditApplications")],
  ["manual bank deposit", read("app/api/properties/[id]/transactions/[transactionId]/deposit/route.ts").includes("SecurityDepositMovementType.RECEIVED")],
  ["property quick actions", read("app/nemovitosti/[id]/[section]/page.tsx").includes(`/najemnici/novy`) && read("app/nemovitosti/[id]/[section]/page.tsx").includes(`/smlouvy/nova`)],
  ["new property building type select", read("app/nemovitosti/nova/page.tsx").includes('label="Typ objektu"') && read("app/nemovitosti/nova/page.tsx").includes("buildingTypeOptions")],
  ["safe building type persistence", read("app/api/properties/route.ts").includes("safeBuildingType") && read("app/api/properties/route.ts").includes("technicalDataJson")],
  ["deposit card fields", ["Sjednáno", "Drženo", "Chybí doplatit / přebytek", "Naběhlý úrok", "K vrácení dnes", "Stav"].every((text) => read("app/smlouvy/[leaseId]/page.tsx").includes(text))],
  ["deposit actions", ["Přijmout kauci", "Vrátit kauci", "Započíst", "Upravit podmínky", "Korekce jistiny / úroku"].every((text) => read("app/smlouvy/[leaseId]/page.tsx").includes(text))],
  ["deposit warnings", read("app/smlouvy/[leaseId]/page.tsx").includes("skutečné složení není potvrzeno") && read("app/smlouvy/[leaseId]/page.tsx").includes("trojnásobek")],
  ["zero interest allowed", read("app/smlouvy/[leaseId]/page.tsx").includes("Nulová sazba zůstává povolena") && read("lib/security-deposit-core.ts").includes("parsed < 0")],
  ["deposit histories", read("app/smlouvy/[leaseId]/page.tsx").includes("Historie pohybů") && read("app/smlouvy/[leaseId]/page.tsx").includes("Historie podmínek")],
  ["settlement UI", read("app/smlouvy/[leaseId]/page.tsx").includes("Vyúčtování / kredity") && read("app/smlouvy/[leaseId]/page.tsx").includes("Přidat výsledek vyúčtování")],
  ["credit application UI", read("app/smlouvy/[leaseId]/page.tsx").includes("Započíst přeplatek") && read("app/smlouvy/[leaseId]/page.tsx").includes("Historie použití")],
  ["global deposit tabs", ["Aktivní", "K vypořádání", "Vypořádané", "Vše"].every((text) => read("app/kauce/page.tsx").includes(text))],
  ["deposit sidebar", read("components/Shell.tsx").includes('href="/kauce"')],
  ["bank deposit UI", read("app/nemovitosti/[id]/platby/[transactionId]/page.tsx").includes("Zaúčtovat jako kauci") && read("app/nemovitosti/[id]/platby/[transactionId]/page.tsx").includes("securityDepositReceipts")],
  ["account-level verification UI", read("app/nemovitosti/[id]/[section]/page.tsx").includes("link.ownerBankAccount.notificationVerifiedAt") && read("app/nemovitosti/[id]/jednotky/[unitId]/page.tsx").includes("ownershipPaymentAccount?.notificationVerifiedAt")],
  ["legacy link verification ignored", !read("lib/bank-verification-scope.ts").includes("!link?.ownerBankAccount") && !read("app/api/properties/[id]/owner-bank-account/route.ts").includes("propertyPaymentAccount.updateMany")],
  ["shared charge includes", read("lib/access.ts").includes("securityDepositOffsets: true, creditApplications: true")],
  ["portfolio shared paid", read("app/portfolio/page.tsx").includes("paidCents(charge)")],
  ["reports shared paid", read("app/reporty/[report]/page.tsx").includes("paidCents(charge)")],
  ["single transaction recompute", read("lib/matching.ts").includes("await recomputeTransactionStatus(transactionId)") && !read("app/api/payments/manual/route.ts").includes("PaymentStatus")],
];
const snapshot = calculateSecurityDepositSnapshot({ depositCents: 3_000_000, asOf: new Date("2026-01-31T00:00:00Z"), terms: [{ agreedAmountCents: 3_000_000, annualRateBps: 500, effectiveFrom: new Date("2026-01-01T00:00:00Z") }], movements: [{ type: "RECEIVED", amountCents: 3_000_000, effectiveAt: new Date("2026-01-01T00:00:00Z") }] });
checks.push(["ACT/365 30 000 Kč at 5 %", snapshot.accruedInterestCents === 12_329]);
if (checks.some(([, ok]) => !ok)) throw new Error(checks.filter(([, ok]) => !ok).map(([name]) => `FAIL: ${name}`).join("\n"));
console.log(`V21.6 verification passed (${checks.length} checks).`);
