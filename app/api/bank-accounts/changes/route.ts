import { after } from "next/server";
import { currentUser } from "@/lib/auth";
import { scheduleBankAccountChange } from "@/lib/bank-account-changes";
import { processTenantPortalNotifications } from "@/lib/tenant-portal-notifications";
import { go, goWithMessage } from "@/lib/route-response";
export async function POST(request:Request){
 const user=await currentUser();if(!user)return go(request,"/login");
 try{
  const f=await request.formData();const revisions=JSON.parse(String(f.get("revisions")||"{}"));
  if(!revisions||typeof revisions!=="object"||Array.isArray(revisions))throw new Error("Obnovte formulář změny.");
  const change=await scheduleBankAccountChange(user,{requestId:String(f.get("requestId")||""),accountId:String(f.get("accountId")||""),unitIds:f.getAll("unitIds").map(String),effectiveDate:String(f.get("effectiveDate")||""),reason:String(f.get("reason")||""),revisions,confirmed:f.get("confirm")==="on",noticeAllowed:f.get("noticeAllowed")==="on"});
  after(async()=>{try{await processTenantPortalNotifications();}catch{console.error("Bank account notice mail remains queued.");}});
  return goWithMessage(request,`/bankovni-ucty/zmeny/${change.id}`,"ok","Změna je potvrzena. Oznámení a doklady o doručení najdete níže.");
 }catch(error){return goWithMessage(request,"/bankovni-ucty","error",error instanceof Error?error.message:"Změnu se nepodařilo potvrdit.");}
}
