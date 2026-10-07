import {notFound} from "next/navigation";
import {requireUser} from "@/lib/auth";
import {Shell} from "@/components/Shell";
import {leaseContractPilotEnabled} from "@/lib/lease-contract/pilot";
import {communicationPreviews} from "@/lib/communication-preview";
export const dynamic="force-dynamic";
export default async function CommunicationPreviewPage() {
  const user=await requireUser();
  if(user.role!=="SUPER_ADMIN"||!leaseContractPilotEnabled())notFound();
  return <Shell user={user}><div className="page"><h1>Náhled komunikace</h1><p>Modelové e-maily podle vzhledu dokladu o zaplacení. Náhled nic neodesílá; jména, údaje i QR jsou pouze ukázkové.</p><p>PDF používáme pro doklady, smluvní dokumenty a oficiální oznámení s dopadem na smluvní vztah. Běžná komunikace zůstává v e-mailu a portálu.</p>{communicationPreviews().map(item=><section key={item.id} className="card" style={{minWidth:0}}><h2>{item.label}</h2><p>{item.pdf ? <a href="/api/admin/communication-preview" target="_blank" rel="noreferrer">Otevřít ukázkové PDF oznámení</a> : "Bez PDF přílohy"}</p><iframe title={item.label} sandbox="" srcDoc={item.html} style={{width:"100%",maxWidth:720,height:item.id==="payment"||item.id==="reminder"?1000:680,border:"1px solid #dce5f1",borderRadius:12,display:"block"}}/></section>)}</div></Shell>;
}
