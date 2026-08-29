import type { Prisma } from "@prisma/client";
import { hasAllPropertyAccess } from "./auth";
import { prisma } from "./db";

type User = { id: string; role: string; allProperties?: boolean };
export type TaskAuthorizationTarget = { propertyId: string; unitId: string | null; leaseId?: string | null; lease?: { unitId: string } | null };
export function authoritativeTaskUnitId(task: TaskAuthorizationTarget) { return task.unitId || task.lease?.unitId || null; }
export function taskEditScope(task:TaskAuthorizationTarget){const unitId=authoritativeTaskUnitId(task);return unitId?{mode:"UNIT" as const,propertyId:task.propertyId,unitId}:{mode:"PROPERTY" as const,propertyId:task.propertyId}}
export function canEditTaskFromGrants(scope:ReturnType<typeof taskEditScope>,grants:{wholePropertyIds:string[];unitIds:string[]},allProperties=false){return allProperties||grants.wholePropertyIds.includes(scope.propertyId)||(scope.mode==="UNIT"&&grants.unitIds.includes(scope.unitId))}
export async function canEditTask(user: User, task: TaskAuthorizationTarget, client: Prisma.TransactionClient | typeof prisma = prisma) {
  if (hasAllPropertyAccess(user)) return true;
  const unitId = authoritativeTaskUnitId(task);
  const propertyGrant=await client.userProperty.findFirst({ where: { userId: user.id, propertyId: task.propertyId, permission: { in: ["EDIT", "ADMIN"] } }, select: { propertyId: true } });
  if(propertyGrant)return true;
  if (!unitId) return false;
  return Boolean(await client.userUnit.findFirst({where:{userId:user.id,unitId,permission:{in:["EDIT","ADMIN"]},unit:{propertyId:task.propertyId}},select:{unitId:true}}));
}
