import { currentUser } from "@/lib/auth";
import { editableUnitWhere } from "@/lib/access";
import { prisma } from "@/lib/db";
/** A unit editor may manage their own meters without a house-wide grant. */
export async function requireManagedUnit(propertyId: string, unitId: string) {
  const user = await currentUser();
  if (!user) return null;
  const unit = await prisma.unit.findFirst({ where: { AND: [{ id: unitId, propertyId }, editableUnitWhere(user, propertyId)] }, select: { id: true } });
  return unit ? { user, unit } : null;
}
