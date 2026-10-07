import { currentUser } from "@/lib/auth";
import { accessibleBankNotice } from "@/lib/bank-account-notice-access";
export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await currentUser(),{id}=await params;if(!user)return new Response("Not found",{status:404});
 const notice=await accessibleBankNotice(user,id);if(!notice)return new Response("Not found",{status:404});
 return new Response(new Uint8Array(notice.pdfData),{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="oznameni-platebni-udaje-${notice.id}.pdf"`,"Cache-Control":"private, no-store"}});
}
