import { prisma } from "../db";
import { businessTodayKey, businessDateKey } from "../calendar";
import { leaseContractPilotEnabled } from "../lease-contract/pilot";
import { resolveAutomaticTaskAssignee } from "../task-automation";
export async function runLeaseActionReminders(
  now = new Date(),
  leaseId?: string,
) {
  if (!leaseContractPilotEnabled())
    return {
      created: 0,
      summary: "Podpisové a ukončovací úkoly jsou aktivní pouze v sandboxu.",
    };
  const today = businessTodayKey(now),
    horizon = new Date(now.getTime() + 31 * 86400000),
    recent = new Date(now.getTime() - 31 * 86400000);
  let created = 0;
  const leases = await prisma.lease.findMany({
    where: {
      ...(leaseId ? { id: leaseId } : {}),
      cancelledAt: null,
      terminatedOn: null,
      startDate: { lte: now },
      endDate: { gte: recent, lte: horizon },
      unit: { property: { active: true } },
    },
    include: {
      tenant: true,
      actionPackets: {
        where: { cancelledAt: null },
        include: { recipients: true },
      },
      unit: {
        include: {
          ownerships: { include: { owner: { include: { user: true } } } },
          property: {
            include: { manager: true, owner: { include: { user: true } } },
          },
        },
      },
    },
  });
  for (const lease of leases) {
    const end = businessDateKey(lease.endDate!),
      lead = new Date(lease.endDate!.getTime() - 30 * 86400000),
      subject = `${lease.unit.label} · ${lease.tenant.name}`,
      assigneeId = resolveAutomaticTaskAssignee({
        manager: lease.unit.property.manager,
        propertyOwner: lease.unit.property.owner,
        unitOwnerships: lease.unit.ownerships,
      });
    const add = async (
      key: string,
      title: string,
      description: string,
      dueAt: Date,
    ) => {
      try {
        await prisma.task.create({
          data: {
            dedupeKey: key,
            title,
            description,
            category: "GENERAL",
            propertyId: lease.unit.propertyId,
            unitId: lease.unitId,
            leaseId: lease.id,
            tenantId: lease.tenantId,
            assigneeId,
            dueAt,
            entries: {
              create: {
                kind: "SYSTEM",
                body: "Úkol k podpisům, doručení nebo předání bytu. Žádné oznámení nájemníkovi nebylo automaticky odesláno.",
              },
            },
          },
        });
        created++;
      } catch (error) {
        if (!(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2002"
        ))
          throw error;
      }
    };
    if (today <= end && today >= businessDateKey(lead)) {
      const existingExpiry = await prisma.task.findFirst({
        where: {
          leaseId: lease.id,
          automationRule: { event: "LEASE_EXPIRY" },
          status: { notIn: ["DONE", "CANCELLED"] },
        },
      });
      if (!existingExpiry)
        await add(
          `lease-ending:${lease.id}:${end}`,
          `Rozhodnout o prodloužení nájmu · ${subject}`,
          `Nájem končí ${end}. Rozhodněte o dodatku nebo oznámení neprodloužení. Dokument a potvrzení převzetí připravíte v Podpisech a potvrzeních u smlouvy. Pokud nájemník oznámení nepotvrdí, zajistěte jiné prokazatelné doručení.`,
          lease.endDate!,
        );
    }
    if (today > end)
      await add(
        `lease-handover:${lease.id}:${end}`,
        `Ověřit odevzdání bytu · ${subject}`,
        `Nájem skončil ${end}. Ověřte skutečné odevzdání bytu, klíče a odečty a vložte předávací protokol. Pokud nájemce byt neodevzdal, řešte písemnou výzvu k odevzdání. Nespoléhejte pouze na oznámení před koncem nájmu; u vlastní smlouvy ověřte pravidla obnovení podle § 2285. Tento úkol sám nepotvrzuje vyklizení.`,
        now,
      );
  }
  const packets = await prisma.leaseActionPacket.findMany({
    where: {
      ...(leaseId ? { leaseId } : {}),
      cancelledAt: null,
      recipients: { some: { completedAt: null } },
      lease: { cancelledAt: null, unit: { property: { active: true } } },
      OR: [
        { dueAt: { lt: now } },
        {
          dueAt: null,
          createdAt: { lt: new Date(now.getTime() - 7 * 86400000) },
        },
      ],
    },
    include: {
      lease: {
        include: {
          unit: {
            include: {
              ownerships: { include: { owner: { include: { user: true } } } },
              property: {
                include: { manager: true, owner: { include: { user: true } } },
              },
            },
          },
        },
      },
    },
  });
  for (const p of packets) {
    const lease = p.lease,
      assigneeId = resolveAutomaticTaskAssignee({
        manager: lease.unit.property.manager,
        propertyOwner: lease.unit.property.owner,
        unitOwnerships: lease.unit.ownerships,
      });
    try {
      await prisma.task.create({
        data: {
          dedupeKey: `lease-action-delivery:${p.id}`,
          title: `Chybí ${p.kind === "SIGN" ? "podpis" : "potvrzení převzetí"} · ${p.title}`,
          description:
            "Nájemník nebo podepisující dosud nepotvrdil úkon v portálu. Zkontrolujte stav v Podpisech a potvrzeních. U důležitých jednostranných oznámení zvažte osobní předání s potvrzením, datovou schránku nebo doporučenou zásilku podle konkrétní situace. Uložení do portálu ani odeslání e-mailu samo neprokazuje doručení.",
          category: "GENERAL",
          propertyId: lease.unit.propertyId,
          unitId: lease.unitId,
          leaseId: lease.id,
          tenantId: lease.tenantId,
          assigneeId,
          dueAt: now,
        },
      });
      created++;
    } catch (error) {
      if (!(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2002"
      ))
        throw error;
    }
  }
  return { created, summary: `Smluvní a doručovací úkoly: ${created} nových.` };
}
