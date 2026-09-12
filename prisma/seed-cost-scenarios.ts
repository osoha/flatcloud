import type { Prisma, PrismaClient, PropertyCostCategory, PropertyCostKind, PropertyCostStatus } from "@prisma/client";
import { allocateCostAmount, allocationBasisPoints } from "../lib/property-cost-allocations";

const marker = "DEMO_ASSET_FINANCE_R18A_V1";
const cents = (value: number) => value * 100;

type DemoCost = {
  property: "Moskevská" | "Karla Aksamita" | "Dům ve správě";
  kind: PropertyCostKind;
  status: PropertyCostStatus;
  category: PropertyCostCategory;
  title: string;
  amount: number;
  effectiveAt: string;
  vendor?: string;
  documentNumber?: string;
  allocation?: "area" | "direct";
};

const costs: DemoCost[] = [
  { property: "Moskevská", kind: "OPEX", status: "ACTUAL", category: "INSURANCE", title: "Pojištění domu 2024", amount: 38_400, effectiveAt: "2024-01-15", vendor: "Kooperativa pojišťovna", documentNumber: "POJ-2024-MOS" },
  { property: "Moskevská", kind: "OPEX", status: "ACTUAL", category: "REPAIRS", title: "Oprava střešní vpusti", amount: 64_900, effectiveAt: "2024-09-12", vendor: "Střechy Sever s.r.o.", documentNumber: "FV-240912" },
  { property: "Moskevská", kind: "OPEX", status: "ACTUAL", category: "INSURANCE", title: "Pojištění domu 2025", amount: 41_200, effectiveAt: "2025-01-13", vendor: "Kooperativa pojišťovna", documentNumber: "POJ-2025-MOS" },
  { property: "Moskevská", kind: "OPEX", status: "ACTUAL", category: "UTILITIES", title: "Elektřina společných prostor", amount: 58_700, effectiveAt: "2025-03-31", vendor: "ČEZ Prodej, a.s.", documentNumber: "CEZ-250331" },
  { property: "Moskevská", kind: "OPEX", status: "ACTUAL", category: "MAINTENANCE", title: "Roční servis výtahu", amount: 72_500, effectiveAt: "2025-05-22", vendor: "Výtahy Servis s.r.o.", documentNumber: "VS-250522" },
  { property: "Moskevská", kind: "OPEX", status: "ACTUAL", category: "TAX", title: "Daň z nemovitých věcí", amount: 44_800, effectiveAt: "2025-05-31", vendor: "Finanční úřad", documentNumber: "DZN-2025-MOS" },
  { property: "Moskevská", kind: "CAPEX", status: "ACTUAL", category: "EQUIPMENT", title: "Výměna vstupního systému", amount: 238_000, effectiveAt: "2025-07-18", vendor: "AccessPro s.r.o.", documentNumber: "AP-250718", allocation: "area" },
  { property: "Moskevská", kind: "OPEX", status: "ACTUAL", category: "FINANCING", title: "Úroky z investičního úvěru 2025", amount: 486_200, effectiveAt: "2025-12-31", vendor: "Česká spořitelna", documentNumber: "UROK-2025-MOS" },
  { property: "Moskevská", kind: "OPEX", status: "ACTUAL", category: "MANAGEMENT", title: "Správa objektu 2025", amount: 144_000, effectiveAt: "2025-12-31", vendor: "FlatCloud Services", documentNumber: "FC-2025-MOS" },
  { property: "Moskevská", kind: "OPEX", status: "ACTUAL", category: "INSURANCE", title: "Pojištění domu 2026", amount: 43_900, effectiveAt: "2026-01-15", vendor: "Kooperativa pojišťovna", documentNumber: "POJ-2026-MOS" },
  { property: "Moskevská", kind: "OPEX", status: "COMMITTED", category: "REPAIRS", title: "Oprava domovních rozvodů", amount: 126_000, effectiveAt: "2026-10-15", vendor: "Instal Sever s.r.o.", documentNumber: "OBJ-2026-104" },
  { property: "Moskevská", kind: "CAPEX", status: "COMMITTED", category: "CONSTRUCTION", title: "Projekt revitalizace fasády", amount: 185_000, effectiveAt: "2026-10-31", vendor: "Ateliér Linie s.r.o.", documentNumber: "SOD-2026-17" },

  { property: "Karla Aksamita", kind: "OPEX", status: "ACTUAL", category: "INSURANCE", title: "Pojištění domu 2024", amount: 31_900, effectiveAt: "2024-01-18", vendor: "Generali Česká pojišťovna", documentNumber: "POJ-2024-KA" },
  { property: "Karla Aksamita", kind: "OPEX", status: "ACTUAL", category: "REPAIRS", title: "Lokální oprava střechy", amount: 83_500, effectiveAt: "2024-10-04", vendor: "Teplické střechy s.r.o.", documentNumber: "TS-241004" },
  { property: "Karla Aksamita", kind: "OPEX", status: "ACTUAL", category: "UTILITIES", title: "Voda a elektřina společných prostor", amount: 49_600, effectiveAt: "2025-03-31", vendor: "ČEZ Prodej, a.s.", documentNumber: "CEZ-250331-KA" },
  { property: "Karla Aksamita", kind: "OPEX", status: "ACTUAL", category: "TAX", title: "Daň z nemovitých věcí", amount: 36_400, effectiveAt: "2025-05-31", vendor: "Finanční úřad", documentNumber: "DZN-2025-KA" },
  { property: "Karla Aksamita", kind: "CAPEX", status: "ACTUAL", category: "CONSTRUCTION", title: "Rekonstrukce jednotky 2.02", amount: 1_180_000, effectiveAt: "2025-08-29", vendor: "Reko Teplice s.r.o.", documentNumber: "RT-250829", allocation: "direct" },
  { property: "Karla Aksamita", kind: "OPEX", status: "ACTUAL", category: "FINANCING", title: "Úroky z úvěru 2025", amount: 318_400, effectiveAt: "2025-12-31", vendor: "ČSOB", documentNumber: "UROK-2025-KA" },
  { property: "Karla Aksamita", kind: "OPEX", status: "ACTUAL", category: "MANAGEMENT", title: "Správa objektu 2025", amount: 126_000, effectiveAt: "2025-12-31", vendor: "FlatCloud Services", documentNumber: "FC-2025-KA" },
  { property: "Karla Aksamita", kind: "OPEX", status: "ACTUAL", category: "INSURANCE", title: "Pojištění domu 2026", amount: 34_600, effectiveAt: "2026-01-18", vendor: "Generali Česká pojišťovna", documentNumber: "POJ-2026-KA" },
  { property: "Karla Aksamita", kind: "OPEX", status: "ACTUAL", category: "MAINTENANCE", title: "Revize elektroinstalace", amount: 28_900, effectiveAt: "2026-04-22", vendor: "Elektrorevize Novák", documentNumber: "ER-260422" },
  { property: "Karla Aksamita", kind: "OPEX", status: "COMMITTED", category: "LEGAL", title: "Právní revize nájemní dokumentace", amount: 42_000, effectiveAt: "2026-10-20", vendor: "Lex Property s.r.o.", documentNumber: "OBJ-2026-28" },
  { property: "Karla Aksamita", kind: "CAPEX", status: "PLANNED", category: "EQUIPMENT", title: "Obnova měřidel a odečtů", amount: 325_000, effectiveAt: "2026-11-15", allocation: "area" },
  { property: "Karla Aksamita", kind: "CAPEX", status: "PLANNED", category: "CONSTRUCTION", title: "Příprava zateplení dvora", amount: 1_450_000, effectiveAt: "2026-12-01" },

  { property: "Dům ve správě", kind: "OPEX", status: "ACTUAL", category: "INSURANCE", title: "Pojištění spravovaného domu 2025", amount: 54_200, effectiveAt: "2025-02-03", vendor: "Allianz pojišťovna", documentNumber: "POJ-2025-KOR" },
  { property: "Dům ve správě", kind: "OPEX", status: "ACTUAL", category: "MAINTENANCE", title: "Servis kotelny", amount: 96_800, effectiveAt: "2025-09-16", vendor: "Pražské kotelny s.r.o.", documentNumber: "PK-250916" },
  { property: "Dům ve správě", kind: "OPEX", status: "ACTUAL", category: "MANAGEMENT", title: "Externí správa domu 2025", amount: 150_000, effectiveAt: "2025-12-31", vendor: "FlatCloud Services", documentNumber: "FC-2025-KOR" },
  { property: "Dům ve správě", kind: "OPEX", status: "ACTUAL", category: "UTILITIES", title: "Energie společných prostor", amount: 62_400, effectiveAt: "2026-06-30", vendor: "PRE, a.s.", documentNumber: "PRE-260630" },
  { property: "Dům ve správě", kind: "OPEX", status: "COMMITTED", category: "REPAIRS", title: "Oprava vstupních dveří", amount: 78_000, effectiveAt: "2026-10-30", vendor: "Truhlářství Praha", documentNumber: "OBJ-2026-61" },
  { property: "Dům ve správě", kind: "CAPEX", status: "PLANNED", category: "EQUIPMENT", title: "Modernizace kotelny", amount: 780_000, effectiveAt: "2026-12-01", allocation: "area" },
];

const budgets = [
  ["Moskevská", 2024, "OPEX", "MAINTENANCE", "Provoz a údržba", 215_000], ["Moskevská", 2024, "CAPEX", "CONSTRUCTION", "Investiční rezerva", 350_000],
  ["Moskevská", 2025, "OPEX", "MAINTENANCE", "Provoz a údržba", 390_000], ["Moskevská", 2025, "OPEX", "FINANCING", "Finanční náklady", 510_000],
  ["Moskevská", 2025, "CAPEX", "EQUIPMENT", "Technické vybavení", 260_000], ["Moskevská", 2026, "OPEX", "REPAIRS", "Opravy a servis", 310_000],
  ["Karla Aksamita", 2024, "OPEX", "MAINTENANCE", "Provoz a údržba", 180_000], ["Karla Aksamita", 2024, "CAPEX", "CONSTRUCTION", "Investiční rezerva", 250_000],
  ["Karla Aksamita", 2025, "OPEX", "MAINTENANCE", "Provoz a údržba", 315_000], ["Karla Aksamita", 2025, "OPEX", "FINANCING", "Finanční náklady", 340_000],
  ["Karla Aksamita", 2025, "CAPEX", "CONSTRUCTION", "Rekonstrukce jednotek", 1_250_000], ["Karla Aksamita", 2026, "OPEX", "MAINTENANCE", "Provoz a údržba", 345_000],
  ["Karla Aksamita", 2026, "CAPEX", "CONSTRUCTION", "Rozvoj domu", 1_800_000], ["Karla Aksamita", 2026, "CAPEX", "EQUIPMENT", "Měřidla a odečty", 350_000],
  ["Dům ve správě", 2025, "OPEX", "MAINTENANCE", "Provoz spravovaného domu", 365_000], ["Dům ve správě", 2025, "CAPEX", "EQUIPMENT", "Technická rezerva", 450_000],
  ["Dům ve správě", 2026, "OPEX", "MAINTENANCE", "Provoz spravovaného domu", 410_000], ["Dům ve správě", 2026, "CAPEX", "EQUIPMENT", "Modernizace technologií", 850_000],
] as const satisfies ReadonlyArray<readonly [DemoCost["property"], number, PropertyCostKind, PropertyCostCategory, string, number]>;

export async function ensureDemoCostScenarios(prisma: PrismaClient, adminId: string) {
  if (await prisma.auditLog.findFirst({ where: { action: marker }, select: { id: true } })) {
    console.log("Demo nákladová data R18A již existují.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    const properties = await tx.property.findMany({
      where: { OR: [
        { name: "Moskevská", address: "Moskevská 18" },
        { name: "Karla Aksamita", address: "Karla Aksamita 12" },
        { name: "Dům ve správě", address: "Korunní 42" },
      ] },
      include: { units: { orderBy: { label: "asc" }, select: { id: true, areaM2: true } } },
    });
    const byName = new Map(properties.map((property) => [property.name, property]));
    const missing = ["Moskevská", "Karla Aksamita", "Dům ve správě"].filter((name) => !byName.has(name));
    if (missing.length) throw new Error(`R18A nemůže vložit náklady, chybí demo objekty: ${missing.join(", ")}.`);

    for (const input of costs) {
      const property = byName.get(input.property)!;
      const amountCents = cents(input.amount);
      const unitId = input.allocation === "direct" ? property.units[1]?.id : undefined;
      const shares = input.allocation === "area" ? allocationBasisPoints("area", property.units) : [];
      const allocations = shares.length ? allocateCostAmount(amountCents, shares) : [];
      const effectiveAt = new Date(`${input.effectiveAt}T12:00:00Z`);
      if (await tx.propertyCost.findFirst({ where: { propertyId: property.id, title: input.title, effectiveAt, note: marker }, select: { id: true } })) continue;
      await tx.propertyCost.create({ data: {
        propertyId: property.id, unitId, kind: input.kind, status: input.status, category: input.category,
        title: input.title, amountCents, effectiveAt, vendor: input.vendor,
        documentNumber: input.documentNumber, note: marker,
        allocations: allocations.length ? { create: allocations } : undefined,
      } });
    }

    for (const [name, year, kind, category, title, amount] of budgets) {
      const propertyId = byName.get(name)!.id;
      if (await tx.propertyBudgetLine.findFirst({ where: { propertyId, year, title, note: { startsWith: marker } }, select: { id: true } })) continue;
      await tx.propertyBudgetLine.create({ data: { propertyId, year, kind, category, title, amountCents: cents(amount), note: marker } });
    }

    const moskevska = byName.get("Moskevská")!;
    const moskevskaLoan = await tx.propertyLoan.findFirst({ where: { propertyId: moskevska.id, active: true }, orderBy: { createdAt: "asc" } });
    if (moskevskaLoan) {
      const snapshots = [
        ["2024-12-31", 10_260_000, 489, 78_000], ["2025-03-31", 10_020_000, 489, 78_000], ["2025-06-30", 9_780_000, 489, 78_000],
        ["2025-09-30", 9_540_000, 489, 78_000], ["2025-12-31", 9_300_000, 489, 78_000], ["2026-03-31", 9_060_000, 489, 78_000],
      ] as const;
      for (const [date, outstanding, rate, debtService] of snapshots) {
        const asOfDate = new Date(`${date}T12:00:00Z`);
        if (await tx.propertyLoanSnapshot.findFirst({ where: { loanId: moskevskaLoan.id, asOfDate }, select: { id: true } })) continue;
        await tx.propertyLoanSnapshot.create({ data: { loanId: moskevskaLoan.id, asOfDate, outstandingPrincipalCents: BigInt(cents(outstanding)), annualInterestRateBps: rate, monthlyDebtServiceCents: BigInt(cents(debtService)), note: marker } });
      }
    }

    const karla = byName.get("Karla Aksamita")!;
    let karlaLoan = await tx.propertyLoan.findFirst({ where: { propertyId: karla.id, label: "Úvěr na akvizici 2023", active: true } });
    if (!karlaLoan) karlaLoan = await tx.propertyLoan.create({ data: {
      propertyId: karla.id, lender: "ČSOB", label: "Úvěr na akvizici 2023", principalCents: BigInt(cents(8_500_000)),
      outstandingPrincipalCents: BigInt(cents(6_520_000)), annualInterestRateBps: 535, rateType: "FIXED",
      fixedUntil: new Date("2027-12-31T12:00:00Z"), maturityDate: new Date("2043-12-31T12:00:00Z"), monthlyDebtServiceCents: BigInt(cents(61_500)), note: marker,
    } });
    const karlaSnapshots = [
      ["2024-12-31", 7_520_000], ["2025-03-31", 7_370_000], ["2025-06-30", 7_220_000],
      ["2025-09-30", 7_070_000], ["2025-12-31", 6_920_000], ["2026-08-31", 6_520_000],
    ] as const;
    for (const [date, outstanding] of karlaSnapshots) {
      const asOfDate = new Date(`${date}T12:00:00Z`);
      if (await tx.propertyLoanSnapshot.findFirst({ where: { loanId: karlaLoan.id, asOfDate }, select: { id: true } })) continue;
      await tx.propertyLoanSnapshot.create({ data: { loanId: karlaLoan.id, asOfDate, outstandingPrincipalCents: BigInt(cents(outstanding)), annualInterestRateBps: 535, monthlyDebtServiceCents: BigInt(cents(61_500)), note: marker } });
    }

    await tx.auditLog.create({ data: { userId: adminId, action: marker, entityType: "System", details: {
      marker, costs: costs.length, budgets: budgets.length, properties: Array.from(byName.keys()), syntheticDocuments: false,
    } satisfies Prisma.InputJsonValue } });
  });

  console.log(`Demo nákladová data R18A vložena: ${costs.length} nákladů, ${budgets.length} rozpočtových řádků.`);
}
