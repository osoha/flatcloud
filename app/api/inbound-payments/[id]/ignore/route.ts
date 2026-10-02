import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/management";
import { parseBankNotification } from "@/lib/inbound-bank/bank-email";
import { go,goWithMessage } from "@/lib/route-response";
import { reconcileInboxReview } from "@/lib/bank-review-tasks";
import { requireInboxBankAccess } from "@/lib/account-banking-access";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const user=await currentUser();if(!user)return go(request,"/login");const {id}=await params;
  try {
    const {row,accounts}=await requireInboxBankAccess(user,id);
    if(row.transactionId)throw new Error("Zaúčtovaný pohyb vyřešte v evidenci plateb nebo bankovních výdajů.");
    const createRule=(await request.formData()).get("createRule")==="1";
    if(createRule&&!accounts.length)throw new Error("Nejprve musí být rozpoznán bankovní účet.");
    const parsed=parseBankNotification({messageId:row.messageId,subject:row.subject,from:row.sender,returnPath:row.returnPath,authenticationResults:row.authenticationResults,date:row.receivedAt,text:row.rawExcerpt});
    const bankLike=parsed.bankLike||row.bank!=="UNKNOWN"||row.amountCents!==null||Boolean(row.recipientAccount||row.counterpartyAccount||row.variableSymbol);
    const note=`${row.parseNote||""} Ručně označeno jako nerelevantní.`.trim();
    await prisma.inboxPayment.update({where:{id},data:{status:"IGNORED",parseNote:bankLike?note:`Nerelevantní e-mail: ${note}`}});
    await audit(user.id,"INBOUND_PAYMENT_IGNORED","InboxPayment",id);
    await reconcileInboxReview(id);
    return goWithMessage(request,createRule?`/platby/banka/pravidla?inbox=${id}`:user.role==="SUPER_ADMIN"?"/platby/nesparovane":"/platby/banka?stav=ignorovane","ok","Pohyb byl ignorován. Zůstává dostupný v historii účtu.");
  }catch(error){return goWithMessage(request,`/platby/nesparovane/email/${id}`,"error",error instanceof Error?error.message:"Pohyb se nepodařilo ignorovat.");}
}
