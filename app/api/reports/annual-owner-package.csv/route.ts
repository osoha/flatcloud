import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { businessDateKey } from "@/lib/calendar";
import { loadAnnualOwnerPackage, normalizeAnnualPackageYear } from "@/lib/reporting/annual-owner-package";

function csvCell(value:string|number){const text=String(value);return /[;"\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text}
function row(values:Array<string|number>){return values.map(csvCell).join(";")}
export async function GET(request:NextRequest){
  const user=await requireUser();const ownerId=request.nextUrl.searchParams.get("ownerId")||undefined;const year=normalizeAnnualPackageYear(request.nextUrl.searchParams.get("year")||undefined);const data=await loadAnnualOwnerPackage(user,{ownerId,year});
  if(!data.selectedOwner)return NextResponse.json({error:"Vyberte dostupného vlastníka."},{status:400});
  const lines=[row(["ROČNÍ PODKLADY VLASTNÍKA",data.selectedOwner.name,year]),row(["UPOZORNĚNÍ","Pracovní export; nejde o daňové přiznání ani účetní závěrku."]),"",row(["SOUHRN","Kč"]),row(["Přijaté úhrady",data.totals.incomeCents/100]),row(["Z toho nájemné",data.totals.rentIncomeCents/100]),row(["Z toho služby",data.totals.servicesIncomeCents/100]),row(["Z toho kauce",data.totals.depositIncomeCents/100]),row(["Skutečné výdaje",data.totals.expenseCents/100]),row(["Pracovní rozdíl bez kaucí",data.totals.differenceCents/100]),"",row(["KONTROLA ÚPLNOSTI","Závažnost","Popis"]),...data.issues.map((issue)=>row([issue.code,issue.severity,issue.message])),"",
    row(["PŘÍJMY","Datum","Nemovitost","Jednotka","Nájemník","VS","Přijato Kč","Podíl vlastníka %","Částka vlastníka Kč","Nájemné Kč","Služby Kč","Kauce Kč","Ostatní Kč","Pravidlo"]),...data.incomeRows.map((item)=>row([item.id,businessDateKey(item.bookedAt),item.propertyName,item.unitLabel,item.tenantName,item.variableSymbol||"",item.receivedCents/100,item.ownerShareBasisPoints/100,item.ownerAmountCents/100,item.rentCents/100,item.servicesCents/100,item.depositCents/100,item.otherCents/100,item.allocationNote])),"",
    row(["VÝDAJE","Datum","Nemovitost","Náklad","Typ","Kategorie","Číslo dokladu","Zdrojová částka Kč","Částka vlastníka Kč","Počet souborů","Pravidlo"]),...data.expenseRows.map((item)=>row([item.id,businessDateKey(item.effectiveAt),item.propertyName,item.title,item.kind,item.category,item.documentNumber||"",item.sourceAmountCents/100,item.ownerAmountCents/100,item.documentCount,item.allocationNote])),"",
    row(["ÚVĚRY","Nemovitost","Úvěr","Věřitel","Jistina Kč","Sazba %","Stav k","Zaplacený úrok"]),...data.loanRows.map((item)=>row([item.id,item.propertyName,item.label,item.lender,item.outstandingPrincipalCents/100,item.annualInterestRateBps/100,item.asOfDate?businessDateKey(item.asOfDate):"aktuální karta","Nedoloženo"]))];
  const filename=`rocni-podklady-${year}-${data.selectedOwner.name.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-|-$/g,"").toLowerCase()||"vlastnik"}.csv`;
  return new NextResponse(`\uFEFF${lines.join("\r\n")}`,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="${filename}"`,"Cache-Control":"private, no-store"}});
}
