import { currentUser } from "@/lib/auth";
import { cancelManualPayment } from "@/lib/payment-corrections";
import { go,goWithMessage } from "@/lib/route-response";
export async function POST(request:Request,{params}:{params:Promise<{id:string;transactionId:string}>}){const user=await currentUser();if(!user)return go(request,"/login");const{id,transactionId}=await params,back=`/nemovitosti/${id}/platby/${transactionId}`;try{await cancelManualPayment(user,id,transactionId);return goWithMessage(request,back,"ok","Ruční platba byla stornována a zůstává zachována v historii.")}catch(error){return goWithMessage(request,back,"error",error instanceof Error?error.message:"Ruční platbu se nepodařilo stornovat.")}}
