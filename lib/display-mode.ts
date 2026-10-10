import { cookies, headers } from "next/headers";
import { prisma } from "./db";
import { checkSubscriptionFeature, summaryForUser, subscriptionsEnabled } from "./subscriptions/service";
import { subscriptionScopeForPath } from "./subscriptions/request-guard";

export type DisplayMode = "basic" | "pro";

export function displayModeCookie(userId: string) {
  return `flatberry-mode-${userId}`;
}

export async function displayMode(userId: string, fallback: DisplayMode = "pro"): Promise<DisplayMode> {
  const value = (await cookies()).get(displayModeCookie(userId))?.value;
  const mode=value === "basic" || value === "pro" ? value : fallback;
  if(mode==="pro"&&!(await profiDisplayAllowed(userId,true)))return "basic";
  return mode;
}

/** A mixed portfolio can use Profi globally; a Free object itself stays Basic. */
export async function profiDisplayAllowed(userId:string, scoped=false):Promise<boolean>{
  if(!(await subscriptionsEnabled()))return true;
  const user=await prisma.user.findUnique({where:{id:userId},select:{id:true,role:true,flatcloudMember:true,allProperties:true}});
  if(!user)return false;
  if(user.role==="SUPER_ADMIN")return true;
  if(scoped){const requestHeaders=await headers();const scope=await subscriptionScopeForPath(requestHeaders.get("x-flatberry-path")||"");if(scope.propertyId)return (await checkSubscriptionFeature(user,"profi",scope)).allowed;}
  const summaries=await summaryForUser(userId);
  return summaries.some(summary=>summary.features.profi||!summary.enrolled);
}
