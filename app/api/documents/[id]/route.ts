import { currentUser } from "@/lib/auth";
import { softDeleteDocument } from "@/lib/documents/service";
import { goWithMessage, safeInternalReturnPath } from "@/lib/route-response";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const user=await currentUser();if(!user)return new Response("Unauthorized",{status:401});const form=await request.formData();const returnTo=safeInternalReturnPath(form.get("returnTo"),"/dokumenty");try{await softDeleteDocument(user,(await params).id);return goWithMessage(request,returnTo,"ok","Dokument byl odstraněn.")}catch(error){return goWithMessage(request,returnTo,"error",error instanceof Error?error.message:"Dokument se nepodařilo odstranit.")}}
