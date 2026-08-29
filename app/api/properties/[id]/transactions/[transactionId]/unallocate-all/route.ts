import { currentUser } from "@/lib/auth";
import { unallocateAllPayment } from "@/lib/payment-corrections";
import { go,goWithMessage } from "@/lib/route-response";
export async function POST(request:Request,{params}:{params:Promise<{id:string;transactionId:string}>}){const user=await currentUser();if(!user)return go(request,"/login");const{id,transactionId}=await params,back=`/nemovitosti/${id}/platby/${transactionId}`;try{await unallocateAllPayment(user,id,transactionId);return goWithMessage(request,back,"ok","Všechna přiřazení nájemného byla odpárována. Případné zaúčtování kauce zůstalo beze změny.")}catch(error){return goWithMessage(request,back,"error",error instanceof Error?error.message:"Přiřazení se nepodařilo odpárovat.")}}
