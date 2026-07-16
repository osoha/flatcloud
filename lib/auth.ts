import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";

function getSessionSecret() {
  const configured = process.env.SESSION_SECRET;
  if (!configured || configured.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET musí být v produkci nastaven a mít alespoň 32 znaků.");
    return new TextEncoder().encode("development-secret-change-me-123456");
  }
  return new TextEncoder().encode(configured);
}
export async function createSession(userId: string) { const token=await new SignJWT({userId}).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("12h").sign(getSessionSecret()); const store=await cookies(); store.set("fc_session",token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:43200,priority:"high"}); }
export async function clearSession(){const store=await cookies();store.delete("fc_session");}
export async function currentUser(){const store=await cookies();const token=store.get("fc_session")?.value;if(!token)return null;try{const{payload}=await jwtVerify(token,getSessionSecret());if(typeof payload.userId!=="string")return null;return prisma.user.findFirst({where:{id:payload.userId,active:true}})}catch{return null}}
export async function requireUser(){const user=await currentUser();if(!user)redirect("/login");return user}
export function canSeeAll(role:string){return role==="SUPER_ADMIN"||role==="MANAGER"}
export function hasAllPropertyAccess(user:{role:string;allProperties?:boolean}){return canSeeAll(user.role)||Boolean(user.allProperties)}
export function canManageProperty(role:string){return role==="SUPER_ADMIN"||role==="MANAGER"||role==="PROPERTY_MANAGER"}
