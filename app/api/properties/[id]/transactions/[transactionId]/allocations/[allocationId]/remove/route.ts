import { currentUser } from "@/lib/auth";
import { unallocatePayment } from "@/lib/payment-corrections";
import { go,goWithMessage } from "@/lib/route-response";
export async function POST(request:Request,{params}:{params:Promise<{id:string;transactionId:string;allocationId:string}>}){const user=await currentUser();if(!user)return go(request,"/login");const{id,transactionId,allocationId}=await params,back=`/nemovitosti/${id}/platby/${transactionId}`;try{await unallocatePayment(user,id,transactionId,allocationId);return goWithMessage(request,back,"ok","Přiřazení platby bylo odpárováno.")}catch(error){return goWithMessage(request,back,"error",error instanceof Error?error.message:"Přiřazení se nepodařilo odpárovat.")}}
