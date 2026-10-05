import {editableUnitWhere} from "./access";
import {prisma} from "./db";
import {leaseStatusAt} from "./lease-lifecycle-core";
import type {Prisma} from "@prisma/client";

export function tenantPortalContactMatches(email:string,tenant:{email:string|null;communicationEmail:string|null}) {
  const contact=(tenant.communicationEmail||tenant.email||"").trim().toLowerCase();
  return Boolean(contact)&&contact===email.trim().toLowerCase();
}

export async function hasTenantPortalAccess(userId:string,email:string,tenantId:string,db:Prisma.TransactionClient=prisma) {
  const access=await db.tenantPortalAccess.findUnique({where:{userId_tenantId:{userId,tenantId}},select:{tenant:{select:{email:true,communicationEmail:true}}}});
  return Boolean(access&&tenantPortalContactMatches(email,access.tenant));
}

export async function activeTenantLease(userId:string,tenantId:string,leaseId:string,db:Prisma.TransactionClient=prisma) {
  const user=await db.user.findFirst({where:{id:userId,active:true},select:{email:true}});
  if(!user||!await hasTenantPortalAccess(userId,user.email,tenantId,db))return null;
  const lease=await db.lease.findFirst({where:{id:leaseId,OR:[{tenantId},{parties:{some:{tenantId,role:"CONTRACTING_PARTY"}}}]},include:{unit:{include:{ownerships:{include:{owner:{include:{user:true}}}},property:{include:{manager:true,owner:{include:{user:true}}}}}}}});
  return lease&&leaseStatusAt(lease)==="ACTIVE"?lease:null;
}

/** Preview/manage rights are always restricted to editable units on the server. */
export async function manageableTenantLeaseIds(user: {id:string;role:string;allProperties?:boolean}, tenantId:string) {
  const leases=await prisma.lease.findMany({where:{unit:portalEditableUnitWhere(user),OR:[{tenantId},{parties:{some:{tenantId,role:{in:["CONTRACTING_PARTY","PAYER"]}}}}]},select:{id:true}});
  return leases.map(lease=>lease.id);
}
export function tenantPortalStatus(tenant: {email:string|null;communicationEmail:string|null;portalAccesses:Array<{user:{active:boolean;email:string}}>;portalInvitations:Array<{status?:string;expiresAt:Date;email:string}>}, now=new Date()) {
  if(tenant.portalAccesses.some(access=>access.user.active&&tenantPortalContactMatches(access.user.email,tenant)))return {tone:"ok",label:"Portál aktivní"};
  if(tenant.portalInvitations.some(invite=>(!invite.status||invite.status==="PENDING")&&invite.expiresAt>now&&tenantPortalContactMatches(invite.email,tenant)))return {tone:"warn",label:"Čeká na přijetí pozvánky"};
  return {tone:"neutral",label:"Dosud nepozván"};
}

export function portalEditableUnitWhere(user:{id:string;role:string;allProperties?:boolean}) {
  // A read-only all-properties grant must never become a portal-management grant.
  return editableUnitWhere({...user,allProperties:false});
}
