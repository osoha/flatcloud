import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { currentUser, previewContext } from "@/lib/auth";
import { accessiblePropertyWhere } from "@/lib/access";
import { unitReadScope } from "@/lib/bank-account-permissions";
import { prisma } from "@/lib/db";
import { subscriptionsSandboxEnabled } from "@/lib/subscriptions/service";

export const dynamic = "force-dynamic";
const MAX_RECORDS = 50_000;
const MAX_PROPERTIES = 500;
const MAX_UNITS = 5_000;
const MAX_BYTES = 20 * 1024 * 1024;
class ExportError extends Error { constructor(message: string, readonly status: number) { super(message); } }
const tooLarge = () => new ExportError("Export překračuje bezpečnou velikost. Zvolte předplatné s menším portfoliem nebo požádejte správce o export po částech. Žádná data nebyla vynechána.", 413);

/** Original ledger evidence only. Subscription entitlements never widen native ACL. */
export async function GET(request: Request) {
  if (!subscriptionsSandboxEnabled()) return new NextResponse("Not found", { status: 404 });
  const context = await previewContext();
  if ((context.target || context.actor)?.role === "TENANT") return NextResponse.json({ error: "Export portfolia není dostupný v portálu nájemníka." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Přihlášení vypršelo." }, { status: 401 });
  const accountId = new URL(request.url).searchParams.get("accountId");
  if (accountId && accountId.length > 100) return NextResponse.json({ error: "Neplatné předplatné." }, { status: 400 });
  try {
    const data = await prisma.$transaction(async tx => {
      const account = accountId ? await tx.subscriptionAccount.findUnique({ where: { id: accountId }, select: { payerUserId: true, scopes: { select: { propertyId: true, unitId: true }, take: 2001 } } }) : null;
      if (accountId && !account) throw new ExportError("Předplatné nebylo nalezeno.", 404);
      if (account && account.scopes.length > 2000) throw tooLarge();
      const propertyWhere: Prisma.PropertyWhereInput = { AND: [accessiblePropertyWhere(user, { includeInactive: true }), ...(account ? [{ id: { in: [...new Set(account.scopes.map(scope => scope.propertyId))] } }] : [])] };
      const propertyCount = await tx.property.count({ where: propertyWhere });
      if (!propertyCount && account && account.payerUserId !== user.id) throw new ExportError("K datům tohoto předplatného nemáte přístup.", 403);
      if (propertyCount > MAX_PROPERTIES) throw tooLarge();
      const unitWhere: Prisma.UnitWhereInput = { AND: [unitReadScope(user), { property: propertyWhere }, ...(account ? [{ OR: account.scopes.map(scope => scope.unitId ? { id: scope.unitId, propertyId: scope.propertyId } : { propertyId: scope.propertyId }) }] : [])] };
      const leaseWhere: Prisma.LeaseWhereInput = { unit: unitWhere };
      const chargeWhere: Prisma.ChargeWhereInput = { lease: leaseWhere };
      const [unitCount, leaseCount, chargeCount, itemCount, allocationCount] = await Promise.all([
        tx.unit.count({ where: unitWhere }), tx.lease.count({ where: leaseWhere }), tx.charge.count({ where: chargeWhere }),
        tx.chargeItem.count({ where: { charge: chargeWhere } }), tx.paymentAllocation.count({ where: { charge: chargeWhere } }),
      ]);
      if (unitCount > MAX_UNITS || propertyCount + unitCount + leaseCount + chargeCount + itemCount + allocationCount > MAX_RECORDS) throw tooLarge();
      const [properties, units, leases, charges, chargeItems, allocations] = await Promise.all([
        tx.property.findMany({ where: propertyWhere, select: { id: true, propertyCode: true, name: true, address: true, city: true, active: true }, orderBy: { id: "asc" } }),
        tx.unit.findMany({ where: unitWhere, select: { id: true, propertyId: true, label: true, status: true, operationalStatus: true }, orderBy: { id: "asc" } }),
        tx.lease.findMany({ where: leaseWhere, select: { id: true, unitId: true, contractNumber: true, startDate: true, endDate: true, terminatedOn: true, cancelledAt: true, status: true, currency: true, rentCents: true, servicesCents: true }, orderBy: { id: "asc" } }),
        tx.charge.findMany({ where: chargeWhere, select: { id: true, leaseId: true, period: true, dueDate: true, amountCents: true, active: true }, orderBy: { id: "asc" } }),
        tx.chargeItem.findMany({ where: { charge: chargeWhere }, select: { id: true, chargeId: true, name: true, category: true, amountCents: true }, orderBy: { id: "asc" } }),
        tx.paymentAllocation.findMany({ where: { charge: chargeWhere }, select: { id: true, chargeId: true, amountCents: true, transaction: { select: { bookedAt: true } } }, orderBy: { id: "asc" } }),
      ]);
      return { version: 1, exportedAt: new Date().toISOString(), properties, units, leases, charges, chargeItems, paymentAllocations: allocations.map(({ transaction, ...allocation }) => ({ ...allocation, bookedAt: transaction.bookedAt })) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20_000 });
    const serialized = JSON.stringify(data, null, 2);
    if (Buffer.byteLength(serialized, "utf8") > MAX_BYTES) throw tooLarge();
    return new NextResponse(serialized, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="flatberry-data.json"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof ExportError ? error.message : "Data nyní nelze exportovat. Zkuste to znovu." }, { status: error instanceof ExportError ? error.status : 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
