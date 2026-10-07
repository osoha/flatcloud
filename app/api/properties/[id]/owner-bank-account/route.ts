import { currentUser } from "@/lib/auth";
import { go,goWithMessage } from "@/lib/route-response";
export async function POST(request:Request){
 const user=await currentUser();if(!user)return go(request,"/login");
 return goWithMessage(request,"/bankovni-ucty","error","Přidání a změnu účtu dokončete zde, včetně ověření a oznámení nájemníkům.");
}
