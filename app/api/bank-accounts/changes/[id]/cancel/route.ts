import { after } from "next/server";
import { currentUser } from "@/lib/auth";
import { cancelBankAccountChange } from "@/lib/bank-account-changes";
import { processTenantPortalNotifications } from "@/lib/tenant-portal-notifications";
import { go,goWithMessage } from "@/lib/route-response";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await currentUser();if(!user)return go(request,"/login");const{id}=await params,back=`/bankovni-ucty/zmeny/${id}`;
 try{const f=await request.formData();if(f.get("confirm")!=="on")throw new Error("Potvrďte zrušení i navazující oznámení nájemníkům.");await cancelBankAccountChange(user,id);after(async()=>{try{await processTenantPortalNotifications();}catch{console.error("Cancellation notice remains queued.");}});return goWithMessage(request,back,"ok","Plánovaná změna byla zrušena a vzniklo navazující oznámení.");}
 catch(error){return goWithMessage(request,back,"error",error instanceof Error?error.message:"Zrušení se nepodařilo.");}
}
