import { isFlatcloudMember } from "@/lib/user-context-policy";
import { currentUser, canSeeAll } from "@/lib/auth";
import { PropertyOwnershipMode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { boolValue, text } from "@/lib/forms";
import { audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
import { safeBuildingType, technicalDataJson } from "@/lib/property-technical";
import { consolidationBasisPoints, safePropertyManagementScope } from "@/lib/ownership-scope";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return go(request, "/login");
  const internal=canSeeAll(user.role);
  if(!internal&&(process.env.PUBLIC_REGISTRATION_ENABLED!=="true"||user.role!=="OWNER_VIEWER"))return go(request,"/portfolio");
  try {
    const form = await request.formData();
    const requestedOwnerId=internal?text(form,"ownerId",true)!:null;
    if(internal&&!await prisma.owner.findFirst({where:{id:requestedOwnerId!,active:true},select:{id:true}}))throw new Error("Vybraný vlastník neexistuje nebo není aktivní.");
    const modeRaw = (text(form, "ownershipMode") || "WHOLE_OBJECT") as PropertyOwnershipMode;
    const ownershipMode = Object.values(PropertyOwnershipMode).includes(modeRaw) ? modeRaw : PropertyOwnershipMode.WHOLE_OBJECT;
    const communicationOwnerId = internal?text(form, "communicationOwnerId") || requestedOwnerId:null;
    const managerId = internal?text(form, "managerId"):null;
    if (managerId && !await prisma.user.findFirst({ where: { id: managerId, active: true }, select: { id: true } })) throw new Error("Vybraný správce neexistuje.");
    const wholeObject = boolValue(form, "wholeObjectOwner");
    const managementScope = safePropertyManagementScope(text(form, "managementScope"));
    const flatcloudConsolidationBasisPoints = consolidationBasisPoints(text(form, "flatcloudConsolidationPercent"));
    const property = await prisma.$transaction(async tx=>{
      const ownerId=internal?requestedOwnerId!:(await tx.owner.upsert({where:{userId:user.id},create:{userId:user.id,name:user.name,email:user.email,type:"PERSON",affiliation:"EXTERNAL"},update:{},select:{id:true}})).id;
      return tx.property.create({ data: {
      name: text(form, "name", true)!, address: text(form, "address", true)!, city: text(form, "city", true)!,
      postalCode: text(form, "postalCode"), note: text(form, "note"), technicalData: technicalDataJson({ buildingType: safeBuildingType(text(form, "buildingType")) }),
      ownerId, ownershipMode, communicationOwnerId, managerId, ...(isFlatcloudMember(user) ? {managementScope, flatcloudConsolidationBasisPoints} : {}),
      ownerships: { create: { ownerId, shareBasisPoints: wholeObject ? 10000 : 0 } },
      memberships: internal ? managerId && managerId!==user.id ? {create:{userId:managerId,permission:"ADMIN"}} : undefined : {create:{userId:user.id,permission:"ADMIN"}},
    } });
    });
    await audit(user.id, "PROPERTY_CREATED", "Property", property.id, { propertyCode: property.propertyCode, ownerId:property.ownerId, ownershipMode, communicationOwnerId, managerId, ...(isFlatcloudMember(user) ? {managementScope, flatcloudConsolidationBasisPoints} : {}) });
    return goWithMessage(request, `/nemovitosti/${property.id}/prehled`, "ok", "Nemovitost byla vytvořena.");
  } catch (error) {
    return goWithMessage(request, "/nemovitosti/nova", "error", error instanceof Error ? error.message : "Nemovitost se nepodařilo vytvořit.");
  }
}
