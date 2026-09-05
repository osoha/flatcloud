import { UnitDisposition, UnitOperationalStatus, UnitType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { floatValue, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const rawDisposition = text(form, "disposition");
    const disposition = rawDisposition && Object.values(UnitDisposition).includes(rawDisposition as UnitDisposition)
      ? (rawDisposition as UnitDisposition)
      : null;
    if (rawDisposition && !disposition) throw new Error("Neplatn√° dispozice jednotky.");
    const dispositionCustom = text(form, "dispositionCustom");
    if (disposition === "OTHER" && !dispositionCustom) throw new Error("U jin√© dispozice dopl≈àte vlastn√≠ oznaƒçen√≠.");
    const ownerId = text(form, "ownerId", true)!;
    const ownerBankAccountId = text(form, "ownerBankAccountId");
    const [property, owner, account] = await Promise.all([
      prisma.property.findUnique({ where: { id }, select: { id: true } }),
      prisma.owner.findFirst({where:{id:ownerId,active:true},select:{id:true}}),
      ownerBankAccountId?prisma.ownerBankAccount.findFirst({ where: { id: ownerBankAccountId, ownerId, active: true }, select: { id: true } }):Promise.resolve(null),
    ]);
    if (!property) throw new Error("Nemovitost nebyla nalezena.");
    if (!owner) throw new Error("Vyberte aktivn√≠ho vlastn√≠ka.");
    if (ownerBankAccountId&&!account) throw new Error("Vybran√Ω bankovn√≠ √∫ƒçet nepat≈ô√≠ zvolen√©mu vlastn√≠kovi nebo nen√≠ aktivn√≠.");
    const unit = await prisma.$transaction(async (tx) => {
      if(ownerBankAccountId)await tx.propertyPaymentAccount.upsert({
        where: { propertyId_ownerBankAccountId: { propertyId: id, ownerBankAccountId } },
        update: { active: true },
        create: { propertyId: id, ownerBankAccountId, active: true },
      });
      const operationalStatus = (text(form, "operationalStatus") || "STANDARD") as UnitOperationalStatus;
      return tx.unit.create({
      data: {
        propertyId: id,
        label: text(form, "label", true)!,
        floor: text(form, "floor"),
        type: (text(form, "type") || "APARTMENT") as UnitType,
        disposition,
        dispositionCustom: disposition === "OTHER" ? dispositionCustom : null,
        operationalStatus,
        areaM2: floatValue(form, "areaM2"),
        note: text(form, "note"),
        ownerships: { create: { ownerId, ownerBankAccountId:ownerBankAccountId||null, shareBasisPoints: 10000 } },
        operationalStatusEvents: { create: { status: operationalStatus, source: "USER_CHANGE", createdById: access.user.id, effectiveAt: new Date() } },
      },
      });
    });
    await audit(access.user.id, "UNIT_CREATED", "Unit", unit.id, { propertyId: id, unitCode: unit.unitCode, label: unit.label, ownerId, ownerBankAccountId }, id);
    return goWithMessage(request, `/nemovitosti/${id}/jednotky`, "ok", ownerBankAccountId?"Jednotka byla vytvo≈ôena.":"Jednotka byla vytvo≈ôena bez √∫ƒçtu. Dopl≈àte jej p≈ôed zalo≈æen√≠m n√°jemn√≠ smlouvy.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/nova`, "error", error instanceof Error ? error.message : "Jednotku se nepoda≈ôilo vytvo≈ôit.");
  }
}
◊M:„éy˜v∏’Ô=ÔŒ=oΩ˙Ôøtﬂw·¶ûﬂV¸˜o\È≠¶ü⁄¶/ÈÆä^Æÿû≥¯ù˛È‚∂œÎ¢Î^∂