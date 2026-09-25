import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { PREVIEW_COOKIE, PREVIEW_DURATION_SECONDS, isCorporatePath, isFlatcloudMember, previewRequestAllowed } from "./user-context-policy";
import { sessionVersionMatches } from "./password-reset-policy";

function getSessionSecret() {
  const configured = process.env.SESSION_SECRET;
  if (!configured || configured.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET musí být v produkci nastaven a mít alespoň 32 znaků.");
    return new TextEncoder().encode("development-secret-change-me-123456");
  }
  return new TextEncoder().encode(configured);
}
export async function createSession(userId: string, sessionVersion: number) { const token=await new SignJWT({userId,sessionVersion}).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("12h").sign(getSessionSecret()); const store=await cookies(); store.set("fc_session",token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:43200,priority:"high"}); }
export async function clearSession(){const store=await cookies();store.delete("fc_session");store.delete(PREVIEW_COOKIE);}
export async function actualUser(){const store=await cookies();const token=store.get("fc_session")?.value;if(!token)return null;try{const{payload}=await jwtVerify(token,getSessionSecret());if(typeof payload.userId!=="string")return null;const user=await prisma.user.findFirst({where:{id:payload.userId,active:true},select:{id:true,email:true,name:true,passwordHash:true,sessionVersion:true,role:true,active:true,allProperties:true,flatcloudMember:true,phone:true,title:true,avatarMimeType:true,avatarChoice:true,onboardingStatus:true,createdAt:true,updatedAt:true}});return user && sessionVersionMatches(payload.sessionVersion,user.sessionVersion) ? user : null}catch{return null}}
export async function requireUser(){const user=await currentUser();if(!user)redirect((await cookies()).has(PREVIEW_COOKIE)?"/nahled/omezeni":"/login");return user}
export function canSeeAll(role:string){return role==="SUPER_ADMIN"||role==="MANAGER"}
export function hasAllPropertyAccess(user:{role:string;allProperties?:boolean}){return canSeeAll(user.role)||Boolean(user.allProperties)}
export function canManageProperty(role:string){return role==="SUPER_ADMIN"||role==="MANAGER"||role==="PROPERTY_MANAGER"}

export async function previewContext() {
  const actor = await actualUser();
  const token = (await cookies()).get(PREVIEW_COOKIE)?.value;
  if (!actor || !token) return { actor, target: null, requested: Boolean(token) };
  try {
    if (actor.role !== "SUPER_ADMIN") throw new Error("Forbidden");
    const { payload } = await jwtVerify(token, getSessionSecret(), { audience: "flatberry-user-preview", algorithms: ["HS256"] });
    if (payload.actorId !== actor.id || payload.actorVersion !== actor.sessionVersion || typeof payload.targetId !== "string") throw new Error("Invalid preview");
    const target = await prisma.user.findFirst({where:{id:payload.targetId,active:true},select:{id:true,email:true,name:true,passwordHash:true,sessionVersion:true,role:true,active:true,allProperties:true,flatcloudMember:true,phone:true,title:true,avatarMimeType:true,avatarChoice:true,onboardingStatus:true,createdAt:true,updatedAt:true}});
    if (!target || target.sessionVersion !== payload.targetVersion) throw new Error("Target changed");
    return { actor, target, requested: true };
  } catch { return { actor, target: null, requested: true }; }
}
export async function startUserPreview(actor: NonNullable<Awaited<ReturnType<typeof actualUser>>>, target: {id:string;sessionVersion:number}) {
  if (actor.role !== "SUPER_ADMIN" || actor.id === target.id) throw new Error("Náhled není povolen.");
  const token = await new SignJWT({actorId:actor.id,actorVersion:actor.sessionVersion,targetId:target.id,targetVersion:target.sessionVersion})
    .setProtectedHeader({alg:"HS256"}).setAudience("flatberry-user-preview").setIssuedAt().setExpirationTime(`${PREVIEW_DURATION_SECONDS}s`).sign(getSessionSecret());
  (await cookies()).set(PREVIEW_COOKIE,token,{httpOnly:true,sameSite:"strict",secure:process.env.NODE_ENV==="production",path:"/",maxAge:43200});
}
export async function currentUser() {
  const context = await previewContext();
  // A stale/revoked preview never silently falls back to the administrator's data.
  if (context.requested && !context.target) return null;
  const user = context.target || context.actor;
  const requestHeaders = await headers();
  const path = requestHeaders.get("x-flatberry-path") || "";
  if (context.requested && !previewRequestAllowed(requestHeaders.get("x-flatberry-method") || "POST", path)) return null;
  if (user && isCorporatePath(path) && !isFlatcloudMember(user)) {
    if (path.startsWith("/api/")) return null;
    redirect("/portfolio");
  }
  return user;
}
