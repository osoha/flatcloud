import { currentUser } from "@/lib/auth";
import { unitAccessWhere, leaseAccessWhere } from "@/lib/access";
import { prisma } from "@/lib/db";
import { directoryTenantOption, directoryTenantSelect, LEASE_TENANT_PAGE_SIZE, LeaseTenantDirectoryScope, leaseTenantAccessWhere, tenantDirectoryWhere } from "@/lib/lease-tenant-directory";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || user.role === "TENANT") return new Response("Nemáte oprávnění.", { status: 403 });
  const { id } = await params;
  if (!await prisma.unit.findFirst({ where: unitAccessWhere(user, id), select: { id: true } })) return new Response("Nemovitost nebyla nalezena.", { status: 404 });
  const query = new URL(request.url).searchParams;
  const scope = query.get("scope") || "PROPERTY";
  const page = Math.max(1, Math.min(100000, Number(query.get("page")) || 1));
  if (!["PROPERTY", "MINE", "AVAILABLE"].includes(scope) || !Number.isInteger(page)) return new Response("Neplatný filtr.", { status: 400 });
  function parseDate(value: string | null) {
    if (!value) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Neplatné datum.");
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Neplatné datum.");
    return date;
  }
  try {
    const startDate = parseDate(query.get("startDate"));
    const endDate = parseDate(query.get("endDate"));
    if (startDate && endDate && endDate < startDate) throw new Error("Konec období musí být po začátku.");
    const excludeLeaseId = query.get("excludeLeaseId") || undefined;
    if (excludeLeaseId && !await prisma.lease.findFirst({ where: { AND: [{ id: excludeLeaseId }, leaseAccessWhere(user, id)] }, select: { id: true } })) return new Response("Smlouva nebyla nalezena.", { status: 404 });
    const selectedIds = (query.get("selected") || "").split(",").filter(Boolean).slice(0, 25);
    const where = tenantDirectoryWhere(user, id, { scope: scope as LeaseTenantDirectoryScope, q: query.get("q") || "", free: query.get("free") === "1", startDate, endDate, excludeLeaseId });
    const [rows, selected] = await Promise.all([
      prisma.tenant.findMany({ where, select: directoryTenantSelect, orderBy: [{ name: "asc" }, { id: "asc" }], skip: (page - 1) * LEASE_TENANT_PAGE_SIZE, take: LEASE_TENANT_PAGE_SIZE + 1 }),
      selectedIds.length ? prisma.tenant.findMany({ where: { AND: [leaseTenantAccessWhere(user, id), { id: { in: selectedIds } }] }, select: directoryTenantSelect }) : Promise.resolve([]),
    ]);
    const visible = rows.slice(0, LEASE_TENANT_PAGE_SIZE);
    const known = [...new Map([...visible, ...selected].map(row => [row.id, row])).values()];
    return Response.json({ options: visible.map(directoryTenantOption), selected: selected.map(directoryTenantOption), accounts: Object.fromEntries(known.map(row => [row.id, row.payerAccounts])), page, hasMore: rows.length > LEASE_TENANT_PAGE_SIZE }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return new Response(error instanceof Error ? error.message : "Výběr se nepodařilo načíst.", { status: 400 }); }
}
