import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { checkSubscriptionFeature, checkSubscriptionWrite } from "./service";
import type { FeatureKey, SubscriptionDecision } from "./types";

const worker = { id: "subscription-bank-worker", role: "SYSTEM" };
type Scope = { propertyId: string; unitId?: string };
type Db = Prisma.TransactionClient | typeof prisma;

/** Rent banking only. Subscription payment intake must never use this guard. */
export async function checkAutomaticBankOperation(scope: Scope, feature: FeatureKey = "paymentMatching", db: Db = prisma): Promise<SubscriptionDecision> {
  const enabled = await checkSubscriptionFeature(worker, feature, scope, db);
  return enabled.allowed ? checkSubscriptionWrite(worker, scope, db) : enabled;
}

export async function checkAutomaticAccountBankOperation(accountId: string, feature: FeatureKey = "paymentMatching", db: Db = prisma): Promise<SubscriptionDecision> {
  const [unitLinks, propertyLinks, leaseLinks, account] = await Promise.all([
    db.unitOwnership.findMany({ where: { ownerBankAccountId: accountId }, select: { unitId: true, unit: { select: { propertyId: true } } } }),
    db.propertyPaymentAccount.findMany({ where: { ownerBankAccountId: accountId, active: true }, select: { propertyId: true } }),
    db.lease.findMany({ where: { ownerBankAccountId: accountId }, select: { unitId: true, unit: { select: { propertyId: true } } } }),
    db.ownerBankAccount.findUnique({ where: { id: accountId }, select: { owner: { select: { userId: true } } } }),
  ]);
  const units = [...unitLinks, ...leaseLinks];
  const scopes:Scope[] = [...units.map(row=>({propertyId:row.unit.propertyId,unitId:row.unitId})), ...propertyLinks.filter(row=>!units.some(unit=>unit.unit.propertyId===row.propertyId)).map(row=>({propertyId:row.propertyId}))];
  for(const scope of scopes){const decision=await checkAutomaticBankOperation(scope,feature,db);if(!decision.allowed)return decision;}
  if(!scopes.length&&account?.owner.userId){const user={id:account.owner.userId,role:"SYSTEM"};const featureDecision=await checkSubscriptionFeature(user,feature,{},db);if(!featureDecision.allowed)return featureDecision;return checkSubscriptionWrite(user,{},db);}
  return {allowed:true};
}
