import { currentUser } from "@/lib/auth";
import { text } from "@/lib/forms";
import { reassignPayment } from "@/lib/payment-corrections";
import { go,goWithMessage } from "@/lib/route-response";
export async function POST(request:Request,{params}:{params:Promise<{id:string;transactionId:string}>}){const user=await currentUser();if(!user)return go(request,"/login");const{id,transactionId}=await params,back=`/nemovitosti/${id}/platby/${transactionId}`;try{const form=await request.formData(),targetLeaseId=text(form,"targetLeaseId",true)!;await reassignPayment(user,id,transactionId,targetLeaseId);return goWithMessage(request,back,"ok","Platba byla přepárována k vybranému nájemnímu vztahu.")}catch(error){return goWithMessage(request,back,"error",error instanceof Error?error.message:"Platbu se nepodařilo přepárovat.")}}
