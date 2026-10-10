import type { NextRequest } from "next/server";
import { prisma } from "../db";
import { previewContextFromTokens } from "../auth";
import { PREVIEW_COOKIE } from "../user-context-policy";
import { checkSubscriptionFeature, checkSubscriptionWrite, subscriptionsEnabled } from "./service";
import { isSubscriptionRead, subscriptionFeatureForRequest, subscriptionWriteException } from "./request-policy";
import type { SubscriptionDecision, SubscriptionUserContext } from "./types";

type Scope = { propertyId?: string; unitId?: string };
const allowed: SubscriptionDecision = { allowed: true };

async function leaseScope(leaseId: string): Promise<Scope> {
  const lease = await prisma.lease.findUnique({ where: { id: leaseId }, select: { unitId: true, unit: { select: { propertyId: true } } } });
  return lease ? { propertyId: lease.unit.propertyId, unitId: lease.unitId } : {};
}

export async function subscriptionScopeForPath(path: string, _query: URLSearchParams = new URLSearchParams()): Promise<Scope> {
  const distributionUnit = path.match(/^\/api\/distribution\/properties\/([^/]+)\/units\/([^/]+)(?:\/|$)/);
  if(distributionUnit)return {propertyId:distributionUnit[1],unitId:distributionUnit[2]};
  const propertyMatch = path.match(/^\/(?:api\/properties|nemovitosti)\/([^/]+)(?:\/|$)/);
  if (propertyMatch && !["nova"].includes(propertyMatch[1])) {
    const transactionMatch=path.match(/\/(?:transactions|platby)\/([^/]+)(?:\/|$)/);
    if(transactionMatch&&transactionMatch[1]!=="nova"){
      const transaction=await prisma.bankTransaction.findFirst({where:{id:transactionMatch[1],bankAccount:{propertyId:propertyMatch[1]}},select:{suggestedLease:{select:{unitId:true}},allocations:{select:{charge:{select:{lease:{select:{unitId:true}}}}}},securityDepositReceipts:{select:{lease:{select:{unitId:true}}}}}});
      const anchors=transaction?[...new Set([...(transaction.suggestedLease?[transaction.suggestedLease.unitId]:[]),...transaction.allocations.map(row=>row.charge.lease.unitId),...transaction.securityDepositReceipts.map(row=>row.lease.unitId)])]:[];
      if(anchors.length===1)return {propertyId:propertyMatch[1],unitId:anchors[0]};
    }
    const unitMatch = path.match(/\/(?:units|jednotky)\/([^/]+)(?:\/|$)/);
    const unitId = unitMatch && !["batch", "hromadne", "nova"].includes(unitMatch[1]) ? unitMatch[1] : undefined;
    const leaseMatch = path.match(/\/(?:leases|smlouvy|predpisy)\/([^/]+)(?:\/|$)/);
    if (leaseMatch && leaseMatch[1] !== "nova" && leaseMatch[1] !== "mesicni") {
      const scope = await leaseScope(leaseMatch[1]);
      // Never let a mismatching entity parameter select a different paid portfolio.
      if (scope.propertyId === propertyMatch[1]) return scope;
    }
    return { propertyId: propertyMatch[1], ...(unitId ? { unitId } : {}) };
  }
  const leaseMatch = path.match(/^\/(?:api\/leases|smlouvy)\/([^/]+)(?:\/|$)/);
  if (leaseMatch) return leaseScope(leaseMatch[1]);
  const taskMatch = path.match(/^\/(?:api\/tasks|ukoly)\/([^/]+)(?:\/|$)/);
  const portalTask = path.match(/^\/api\/portal\/tenants\/[^/]+\/(?:conversations|defects)\/([^/]+)(?:\/|$)/);
  if (taskMatch || portalTask) {
    const task = await prisma.task.findUnique({ where: { id: (taskMatch || portalTask)![1] }, select: { propertyId: true, unitId: true } });
    if (task?.propertyId) return { propertyId: task.propertyId, ...(task.unitId ? { unitId: task.unitId } : {}) };
  }
  const documentMatch = path.match(/^\/api\/documents\/([^/]+)(?:\/|$)/);
  if (documentMatch && documentMatch[1] !== "upload") {
    const document = await prisma.document.findUnique({ where: { id: documentMatch[1] }, select: { propertyId: true, unitId: true } });
    if (document) return { propertyId: document.propertyId, ...(document.unitId ? { unitId: document.unitId } : {}) };
  }
  const accountMatch = path.match(/^\/api\/bank-accounts\/([^/]+)(?:\/|$)/);
  if (accountMatch && !["changes", "notices"].includes(accountMatch[1])) {
    const links = await prisma.unitOwnership.findMany({ where: { ownerBankAccountId: accountMatch[1] }, select: { unitId: true, unit: { select: { propertyId: true } } }, take: 2 });
    if (links.length === 1) return { propertyId: links[0].unit.propertyId, unitId: links[0].unitId };
  }
  const inboxMatch = path.match(/^\/(?:api\/inbound-payments|platby\/nesparovane\/email)\/([^/]+)(?:\/|$)/);
  if (inboxMatch) {
    const inbox = await prisma.inboxPayment.findUnique({ where: { id: inboxMatch[1] }, select: { propertyId: true } });
    if (inbox?.propertyId) return { propertyId: inbox.propertyId };
  }
  // Collection selectors are authorized by their native handlers. An unrelated
  // query parameter must never redirect the entitlement check to a paid object.
  return {};
}

/** Server helper for collection routes: call after native context authorization. */
export async function assertSubscriptionWrite(user: SubscriptionUserContext, scope: Scope) {
  const decision = await checkSubscriptionWrite(user, scope);
  if (!decision.allowed) throw new Error(decision.message || "Předplatné tohoto portfolia umožňuje pouze čtení.");
}

export async function assertSubscriptionFeature(user: SubscriptionUserContext, feature: Parameters<typeof checkSubscriptionFeature>[1], scope: Scope = {}) {
  const decision = await checkSubscriptionFeature(user, feature, scope);
  if (!decision.allowed) throw new Error(decision.message || "Tato funkce není součástí tarifu tohoto portfolia.");
}

/** Runs before all route handlers. Existing ACL checks remain authoritative. */
export async function checkSubscriptionRequest(request: NextRequest): Promise<SubscriptionDecision> {
  const path = request.nextUrl.pathname;
  if(isSubscriptionRead(request.method)&&["/guide/","/illustrations/","/fonts/","/landing/","/templates/"].some(root=>path.startsWith(root)))return allowed;
  if (["/api/auth/", "/api/account/", "/api/subscriptions/", "/api/admin/subscriptions/", "/ucet"].some(root => path === root || path.startsWith(root))
    || ["/api/health", "/login", "/registrace", "/zapomenute-heslo", "/nove-heslo"].includes(path)
    || path.startsWith("/_next/") || path.startsWith("/api/admin/user-preview")) return allowed;
  if (!(await subscriptionsEnabled())) return allowed;
  const context = await previewContextFromTokens(request.cookies.get("fc_session")?.value, request.cookies.get(PREVIEW_COOKIE)?.value,true);
  if (context.requested && !context.target) return allowed; // Native authentication rejects the stale preview.
  const user = context.target || context.actor;
  if (!user || (!context.requested && user.role === "SUPER_ADMIN")) return allowed;
  const read = isSubscriptionRead(request.method);
  const scope = await subscriptionScopeForPath(path, request.nextUrl.searchParams);
  // Small ordinary forms can supply a scope. Uploaded files are checked in their
  // native collection route after authorization, without buffering a second copy.
  const payloadScope = ["/api/tasks", "/api/documents/upload", "/api/payments/manual"].includes(path)
    || /^\/api\/portal\/tenants\/[^/]+\/(?:receipts|readings|messages|contact-change-requests|conversations)$/.test(path);
  const contentType=request.headers.get("content-type")||"";
  if (!read && payloadScope && !scope.propertyId && (contentType.startsWith("application/x-www-form-urlencoded")||contentType.startsWith("application/json"))) {
    const length = Number(request.headers.get("content-length") || "0");
    if (length < 64_000) {
      try {
        const form = contentType.startsWith("application/json")?new FormData():await request.clone().formData();
        if(contentType.startsWith("application/json")){const body=await request.clone().json();if(body&&typeof body==="object"&&typeof body.leaseId==="string")form.set("leaseId",body.leaseId);}
        const chargeId = form.get("chargeId"), leaseId = form.get("leaseId"), propertyId = form.get("propertyId"), unitId = form.get("unitId");
        const receipt=/^\/api\/portal\/tenants\/[^/]+\/receipts$/.test(path);
        if (receipt&&typeof chargeId === "string" && chargeId) {
          const charge = await prisma.charge.findUnique({ where: { id: chargeId }, select: { leaseId: true } });
          if (charge) Object.assign(scope, await leaseScope(charge.leaseId));
        } else if (!receipt&&typeof leaseId === "string" && leaseId) Object.assign(scope, await leaseScope(leaseId));
        else if (["/api/tasks","/api/documents/upload"].includes(path)&&typeof unitId === "string" && unitId) {
          const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { propertyId: true } });
          if (unit) Object.assign(scope, { propertyId: unit.propertyId, unitId });
        } else if (["/api/tasks","/api/documents/upload"].includes(path)&&typeof propertyId === "string" && propertyId) scope.propertyId = propertyId;
      } catch { /* malformed form is rejected by the native route */ }
    }
  }
  let scopes:Scope[]=[scope];
  const exactPortalHandler=/^\/api\/portal\/tenants\/[^/]+\/(?:receipts|readings|messages|contact-change-requests|conversations)$/.test(path);
  const group = path.match(/^\/api\/reporting-groups\/([^/]+)(?:\/|$)/) || path.match(/^\/reporty\/(?:kvartalni|vyrocni)\/([^/]+)(?:\/|$)/);
  if(group){const properties=await prisma.reportingGroupProperty.findMany({where:{reportingGroupId:group[1]},select:{propertyId:true}});if(properties.length)scopes=properties.map(row=>({propertyId:row.propertyId}));}
  // Tenant accounts are not subscription payers. Resolve their actual tenancies
  // rather than treating a tenant's own absent subscription as legacy access.
  const tenant=path.match(/^\/api\/portal\/tenants\/([^/]+)(?:\/|$)/);
  if(tenant&&!read&&!scope.propertyId&&!exactPortalHandler){
    const leases=await prisma.lease.findMany({where:{OR:[{tenantId:tenant[1]},{parties:{some:{tenantId:tenant[1],role:"CONTRACTING_PARTY"}}}],status:{in:["ACTIVE","FUTURE"]}},select:{unitId:true,unit:{select:{propertyId:true}}}});
    if(leases.length)scopes=leases.map(lease=>({propertyId:lease.unit.propertyId,unitId:lease.unitId}));
  }
  const feature = subscriptionFeatureForRequest(path, request.method, request.nextUrl.searchParams);
  if (feature && !(exactPortalHandler&&!scope.propertyId)) {
    for(const actualScope of scopes){const decision = await checkSubscriptionFeature(user, feature, actualScope);if (!decision.allowed) return decision;}
  }
  // A manual payment may be corrected in Basic. Imported bank transactions need
  // payment matching even when a caller invokes the allocation endpoint directly.
  const transaction = path.match(/^\/api\/properties\/[^/]+\/transactions\/([^/]+)\/(?:allocate|reassign|unallocate-all|allocations|deposit|ignore)(?:\/|$)/);
  if (transaction && !read) {
    const payment = await prisma.bankTransaction.findUnique({ where: { id: transaction[1] }, select: { source: true } });
    if (payment && payment.source !== "manual") {
      const decision = await checkSubscriptionFeature(user, "paymentMatching", scope);
      if (!decision.allowed) return decision;
    }
  }
  if (!read && !subscriptionWriteException(path)) {
    // These collection handlers assert their actual authorized payload scope.
    const deferred = ["/api/documents/upload", "/api/tasks", "/api/payments/manual"].includes(path)||exactPortalHandler;
    if (!deferred || scope.propertyId) {
      for(const actualScope of scopes){const decision = await checkSubscriptionWrite(user, actualScope);if (!decision.allowed) return decision;}
    }
  }
  return allowed;
}
