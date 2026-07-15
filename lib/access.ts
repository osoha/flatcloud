import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { canSeeAll } from "./auth";

const propertyInclude = {
  owner: true,
  ownerships: { include: { owner: true }, orderBy: { createdAt: "asc" as const } },
  bankAccounts: { include: { owner: true, connectedBy: true }, orderBy: { bankName: "asc" as const } },
  matchingRules: { orderBy: [{ priority: "asc" as const }, { createdAt: "asc" as const }] },
  memberships: { include: { user: true }, orderBy: { user: { name: "asc" as const } } },
  invitations: { include: { invitedBy: true }, orderBy: { createdAt: "desc" as const } },
  units: {
    orderBy: { label: "asc" as const },
    include: {
      ownerships: { include: { owner: true }, orderBy: { createdAt: "asc" as const } },
      leases: {
        orderBy: { startDate: "desc" as const },
        include: {
          tenant: true,
          paymentItems: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
          charges: { include: { allocations: true, items: true }, orderBy: { period: "desc" as const } },
        },
      },
    },
  },
} satisfies Prisma.PropertyInclude;

export async function accessibleProperties(user:{id:string;role:string}){
  return prisma.property.findMany({
    where: { ...(canSeeAll(user.role) ? {} : { memberships:{some:{userId:user.id}} }), active: true },
    include: propertyInclude,
    orderBy:{name:"asc"}
  });
}

export async function requirePropertyAccess(user:{id:string;role:string},propertyId:string){
  return prisma.property.findFirst({
    where:{id:propertyId,...(canSeeAll(user.role)?{}:{memberships:{some:{userId:user.id}}})},
    include: propertyInclude,
  });
}
