import {actualUser} from "@/lib/auth";
import {issueTenantReceipt} from "@/lib/tenant-payment-receipts";
import {goWithMessage,go} from "@/lib/route-response";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{tenantId:string}>}) {
  const {tenantId}=await params,user=await actualUser();if(!user)return new Response("Forbidden",{status:403});
  const path=`/portal/najemnik/${tenantId}`;
  try{const form=await request.formData(),receipt=await issueTenantReceipt(user,tenantId,String(form.get("chargeId")||""));return go(request,`/api/portal/tenants/${tenantId}/receipts/${receipt.id}`);}
  catch(error){return goWithMessage(request,path,"error",error instanceof Error?error.message:"Doklad se nepodařilo vystavit.");}
}
