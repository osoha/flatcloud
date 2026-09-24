import { NextResponse } from "next/server";
import { expenseImportPreview } from "@/lib/bank-expense-import-preview";
import { runExpenseRules } from "@/lib/bank-expense-rules";
import { prisma } from "@/lib/db";
import { requireManagedProperty } from "@/lib/management";
import { goWithMessage } from "@/lib/route-response";
import { serializableTransaction } from "@/lib/serializable";
import { parseExpenseStatement, expenseAccountIdentity } from "@/lib/bank-expense-values";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params,back=`/nemovitosti/${id}/bankovni-vydaje`;
  const access=await requireManagedProperty(id);
  if(!access)return goWithMessage(request,back,"error","Nemáte oprávnění importovat výdaje.");
  try {
    const form=await request.formData();
    if(form.get("operation")!=="preview"&&form.get("confirmed")!=="on")throw new Error("Potvrďte rozsah výpisu a směr částek.");
    const accountId=String(form.get("accountId")||"");
    const link=await prisma.propertyPaymentAccount.findFirst({where:{propertyId:id,ownerBankAccountId:accountId,active:true,ownerBankAccount:{active:true}},include:{ownerBankAccount:true}});
    if(!link)throw new Error("Vyberte aktivní účet vlastníka přiřazený k domu.");
    const file=form.get("file");
    if(!(file instanceof File)||file.size>2_000_000)throw new Error("Vyberte CSV do 2 MB.");
    const records=parseExpenseStatement(await file.text());
    const ownerAccount=link.ownerBankAccount;
    if(ownerAccount.currency!=="CZK")throw new Error("Import vyžaduje účet v CZK.");
    const identity=expenseAccountIdentity(ownerAccount);
    if(!identity)throw new Error("Účet nemá platný identifikátor.");
    const previewOnly=form.get("operation")==="preview";
    const result=await serializableTransaction(async tx=>{
      const preview=await expenseImportPreview(tx,records,identity,ownerAccount.ownerId);
      if(previewOnly)return {preview,created:0,duplicate:0,skipped:0,ids:[] as string[]};
      if(form.get("previewToken")!==preview.token)throw new Error("Výpis nebo evidence se změnily. Nejprve znovu zobrazte náhled importu.");
      if(preview.rows.some(r=>r.state==="conflict"))throw new Error("Stejné ID má odlišné údaje. Opravte výpis.");
      const allowed=new Set(form.getAll("allowSuspect").map(String));
      const skip=new Set(preview.rows.filter(r=>r.state==="suspect"&&!allowed.has(r.id)).map(r=>r.id));
      // One ledger per physical account, independent of selected house or filename.
      const bank=await tx.bankAccount.upsert({where:{provider_externalAccountId:{provider:"expense-statement",externalAccountId:identity}},update:{},create:{propertyId:id,ownerId:ownerAccount.ownerId,provider:"expense-statement",externalAccountId:identity,bankName:"Import výpisu",accountName:"Výdaje a vratky",iban:identity,ibanMasked:identity,currency:"CZK"}});
      if(bank.propertyId!==id)throw new Error("Tento sdílený účet již má import u jiného domu. Importujte tam a přiřazujte náklady cílových domů v jeho přehledu.");
      if(bank.ownerId!==ownerAccount.ownerId)throw new Error("Identita vlastníka účtu nesouhlasí.");
      let created=0,duplicate=0;
      const existing=new Map((await tx.bankTransaction.findMany({where:{bankAccountId:bank.id,externalId:{in:records.map(r=>r.externalId)}}})).map(r=>[r.externalId,r]));
      const pending=[];
      for(const record of records) {
        if(skip.has(record.externalId))continue;
        const previous=existing.get(record.externalId);
        if(previous) {
          if(previous.amountCents!==record.amountCents||previous.bookedAt.getTime()!==record.bookedAt.getTime()||previous.currency!==record.currency||previous.counterpartyIban!==record.counterpartyIban||previous.variableSymbol!==record.variableSymbol||previous.counterpartyName!==record.counterpartyName||previous.message!==record.message)throw new Error(`ID ${record.externalId} již existuje s jinými údaji. Import nebyl proveden; ověřte výpis.`);
          duplicate++;continue;
        }
        pending.push({...record,bankAccountId:bank.id,recipientAccount:identity,source:"expense-statement",status:"IGNORED" as const,matchNote:"K posouzení v Bankovních výdajích; nejde o příjem nájemného."});created++;
      }
      await tx.bankTransaction.createMany({data:pending});
      await tx.auditLog.create({data:{userId:access.user.id,propertyId:id,action:"BANK_EXPENSE_IMPORTED",entityType:"BankAccount",entityId:bank.id,details:{filename:file.name,created,duplicate,source:"CSV",accountId}}});
      const ids=(await tx.bankTransaction.findMany({where:{bankAccountId:bank.id,externalId:{in:pending.map(r=>r.externalId)}},select:{id:true}})).map(r=>r.id);
      return {created,duplicate,skipped:skip.size,ids,preview:null};
    });
    if(result.preview)return NextResponse.json(result.preview,{headers:{"Cache-Control":"no-store"}});
    const rules=await runExpenseRules(id,result.ids,access.user.id);
    return NextResponse.json({ok:true,message:`Importováno ${result.created} pohybů, ${result.duplicate} již evidovaných a ${result.skipped} možných duplicit přeskočeno. Pravidla použita: ${rules.applied}.`,back});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Import se nezdařil."},{status:400});}
}
