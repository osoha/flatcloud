import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bankAccountReadScope } from "@/lib/bank-account-permissions";
import { syncInboundMailbox } from "@/lib/inbound-bank/sync";
import { go, goWithMessage } from "@/lib/route-response";
export async function POST(request:Request,{params}:{params:Promise<{accountId:string}>}){
 const user=await currentUser();if(!user)return go(request,"/login");const{accountId}=await params,back=`/bankovni-ucty#ucet-${accountId}`;
 const account=await prisma.ownerBankAccount.findFirst({where:{id:accountId,...bankAccountReadScope(user)}});
 if(!account)return new Response("Not found",{status:404});
 try{await syncInboundMailbox();const updated=await prisma.ownerBankAccount.findUnique({where:{id:accountId},select:{notificationVerifiedAt:true}});return goWithMessage(request,back,"ok",updated?.notificationVerifiedAt?"Bankovní notifikace tohoto účtu jsou ověřené.":"Ověřovací oznámení zatím nedorazilo. Zkontrolujte nastavení banky a zkuste kontrolu později.");}
 catch{return goWithMessage(request,back,"error","Kontrolu schránky se nepodařilo dokončit. Zkuste ji později nebo kontaktujte správce.");}
}
