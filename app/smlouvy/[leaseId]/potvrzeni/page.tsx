import Link from "next/link";
import { notFound } from "next/navigation";
import { runLeaseActionReminders } from "@/lib/lease-actions/reminders";
import { workflowActor } from "@/lib/lease-actions/service";
import { contractLease } from "@/lib/lease-contracts/service";
import { contractLandlord } from "@/lib/lease-contracts/landlord";
import {
  actionKind,
  nonRenewalText,
  packetStatus,
} from "@/lib/lease-actions/core";
import { prisma } from "@/lib/db";
import { portalEditableUnitWhere } from "@/lib/tenant-portal-access";
import { LeaseActionComposer } from "@/components/LeaseActionComposer";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { formatDate } from "@/lib/lease-contracts/core";
export const dynamic = "force-dynamic";
export default async function Actions({
  params,
  searchParams,
}: {
  params: Promise<{ leaseId: string }>;
  searchParams: Promise<{ ok?: string; error?: string; documentId?: string }>;
}) {
  const actor = await workflowActor();
  if (!actor || actor.role === "TENANT") notFound();
  const { leaseId } = await params,
    lease = await contractLease(actor, leaseId);
  if (!lease || lease.cancelledAt) notFound();
  const query = await searchParams;
  await runLeaseActionReminders(new Date(), leaseId);
  const [documents, packets, users] = await Promise.all([
    prisma.document.findMany({
      where: {
        leaseId,
        propertyId: lease.unit.propertyId,
        OR: [{ unitId: null }, { unitId: lease.unitId }],
        taskEntryId: null,
        meterReadingEvidence: { none: {} },
        deletedAt: null,
        fileAsset: { mimeType: "application/pdf" },
      },
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.leaseActionPacket.findMany({
      where: { leaseId },
      include: { recipients: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: {
        active: true,
        role: { not: "TENANT" },
        OR: [
          { role: { in: ["SUPER_ADMIN", "MANAGER"] } },
          {
            memberships: {
              some: {
                propertyId: lease.unit.propertyId,
                permission: { in: ["EDIT", "ADMIN"] },
              },
            },
          },
          {
            unitMemberships: {
              some: {
                unitId: lease.unitId,
                permission: { in: ["EDIT", "ADMIN"] },
              },
            },
          },
        ],
      },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const signers = [] as Array<{ id: string; name: string }>;
  for (const u of users)
    if (
      await prisma.unit.count({
        where: { id: lease.unitId, ...portalEditableUnitWhere(u) },
      })
    )
      signers.push(u);
  const landlord = contractLandlord(lease).owner,
    tenantNames = [
      lease.tenant.name,
      ...lease.parties.map((p) => p.tenant.name),
    ],
    end = lease.endDate?.toISOString().slice(0, 10) || "";
  const notice =
    end && !lease.terminatedOn
      ? nonRenewalText({
          landlord: landlord?.name || "[doplňte pronajímatele]",
          tenantNames,
          address: `${lease.unit.property.address}, ${lease.unit.property.city} · ${lease.unit.label}`,
          endDate: formatDate(end),
          handover: "Doplňte termín a kontakt pro domluvu předání bytu.",
        })
      : "";
  return (
    <Shell
      user={actor}
      taskPropertyId={lease.unit.propertyId}
      taskLeaseId={leaseId}
    >
      <div className="page">
        <Link href={`/smlouvy/${leaseId}`}>Zpět na smlouvu</Link>
        <h1>Podpisy a potvrzení</h1>
        <p>
          {lease.unit.property.name} · {lease.unit.label} · {lease.tenant.name}
        </p>
        <Flash {...query} />
        <div className="card">
          <LeaseActionComposer
            leaseId={leaseId}
            documents={documents}
            signers={signers}
            defaultDocumentId={
              documents.some((d) => d.id === query.documentId)
                ? query.documentId!
                : ""
            }
            nonRenewal={notice}
          />
        </div>
        <div className="card">
          <h2>Předané dokumenty a sdělení</h2>
          <Link href="/portal/najemnik/podpis" className="secondary">
            Můj podpis pro smlouvy
          </Link>
          {!packets.length && <p>Zatím jste nepředali žádný úkon.</p>}
          {packets.map((p) => (
            <article className="inline-edit-card" key={p.id}>
              <h3>{p.title}</h3>
              <p>
                {packetStatus(p)} · předáno do portálu{" "}
                {p.createdAt.toLocaleDateString("cs-CZ", {
                  timeZone: "Europe/Prague",
                })}
              </p>
              {p.recipients.map((r) => (
                <p key={r.id}>
                  {r.expectedName}:{" "}
                  {r.completedAt
                    ? `${p.kind === "SIGN" ? "Podepsáno" : "Potvrzeno"} ${r.completedAt.toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })}`
                    : r.openedAt
                      ? "Úkon otevřen, potvrzení chybí"
                      : "Dosud neotevřeno"}
                </p>
              ))}
              <Link
                className="secondary"
                href={`/portal/najemnik/potvrzeni/${p.id}`}
              >
                Otevřít dokument a záznam
              </Link>
              {!p.cancelledAt && p.recipients.some((r) => !r.completedAt) && (
                <p>
                  Chybí potvrzení. Zvažte jiné prokazatelné doručení — osobní
                  předání s potvrzením, datovou schránku nebo doporučenou
                  zásilku podle konkrétní situace. Vložení do portálu samo
                  neprokazuje doručení.
                </p>
              )}
              {!p.cancelledAt && p.recipients.every((r) => !r.completedAt) && (
                <form action={`/api/leases/${leaseId}/actions`} method="post">
                  <input type="hidden" name="mode" value="cancel" />
                  <input type="hidden" name="packetId" value={p.id} />
                  <button className="secondary">
                    Zrušit dosud nepotvrzený úkon
                  </button>
                </form>
              )}
              {actionKind(p.kind) === "NON_RENEWAL" && (
                <p>
                  Po skončení nájmu ověřte skutečné odevzdání bytu. Pokud
                  nájemce zůstává, řešte písemnou výzvu; oznámení před koncem ji
                  automaticky nenahrazuje. U cizích vzorů ověřte pravidla
                  obnovení nájmu podle § 2285.
                </p>
              )}
            </article>
          ))}
        </div>
      </div>
    </Shell>
  );
}
