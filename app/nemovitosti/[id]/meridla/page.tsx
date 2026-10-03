import { displayMode } from "@/lib/display-mode";
import { PageHeading } from "@/components/PageHeading";
import { notFound } from "next/navigation";
import { Gauge, Plus } from "lucide-react";
import { requireUser, hasAllPropertyAccess } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PropertySubnav } from "@/components/PropertySubnav";
import { Flash } from "@/components/FormUi";
import { meterTypes } from "@/lib/labels";
import { MeterReadingHistory } from "@/components/MeterReadingHistory";

export const dynamic = "force-dynamic";

export default async function PropertyMeters({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{ok?:string;error?:string}>}) {
  const user=await requireUser(); const {id}=await params; const query=await searchParams;
  const property=await requirePropertyAccess(user,id); if(!property) notFound();
  const canManage=hasAllPropertyAccess(user)||property.memberships.some(m=>m.userId===user.id&&(m.permission==="EDIT"||m.permission==="ADMIN"));
  const unitLimited=!hasAllPropertyAccess(user)&&!property.memberships.some(m=>m.userId===user.id);
  if(unitLimited) notFound();
  const [meters,documents]=await Promise.all([
    prisma.meter.findMany({where:{propertyId:id},orderBy:[{scope:"asc"},{createdAt:"asc"}],include:{unit:{select:{label:true}},parent:{select:{id:true,label:true,serialNumber:true}},readings:{orderBy:{readAt:"asc"},include:{createdBy:{select:{name:true}},evidenceDocument:{select:{id:true,title:true}}}}}}),
    prisma.document.findMany({where:{propertyId:id,unitId:null,leaseId:null,fileAsset:{mimeType:{in:["application/pdf","image/jpeg","image/png","image/webp"]}}},include:{fileAsset:true},orderBy:{createdAt:"desc"}})
  ]);
  const mode=await displayMode(user.id,user.defaultDisplayMode==="basic"?"basic":"pro");
  const houseMeters=meters.filter(m=>m.scope!=="UNIT");
  const parentOptions=houseMeters.filter(m=>m.active&&m.scope==="HOUSE_MAIN");
  return <Shell user={user} taskPropertyId={id}><div className="page">
    <div className="breadcrumb">Portfolio › {property.name} › Měřidla</div>
    <div className="page-title"><div><PageHeading>Domovní měřidla</PageHeading><p>Hlavní a podružná měřidla objektu, jejich hierarchie a historie výměn.</p></div></div>
    <PropertySubnav propertyId={id} active="meridla"/>
    <Flash ok={query.ok} error={query.error}/>
    <div className="notice"><strong>Princip evidence</strong><span>Hlavní domovní měřidlo je kořen. Podružné měřidlo lze navázat jen na stejné médium a měrnou jednotku. Bytová měřidla zůstávají na kartách jednotek. Výměna staré měřidlo nemaže.</span></div>
    {mode==="basic"&&<div className="card portal-welcome"><div><h2>Stačí stav měřidla a datum</h2><p>Vyberte měřidlo a zapište nový odečet. Historii můžete rozbalit.</p></div><img src="/guide/finance.webp" width="100" alt="Berry pomáhá s odečty"/></div>}
    {mode==="pro"&&<div className="card table-wrap"><table><thead><tr><th>Měřidlo</th><th>Jednotka</th><th>Poslední stav</th><th>Datum</th><th>Kontrola</th></tr></thead><tbody>{meters.map(m=>{const last=m.readings.at(-1);return <tr key={m.id}><td>{m.label||meterTypes[m.type]}</td><td>{m.unit?.label||"Domovní"}</td><td>{last?`${last.value} ${m.unitOfMeasure}`:"—"}</td><td>{last?.readAt.toLocaleDateString("cs-CZ")||"Bez odečtu"}</td><td>{last&&Date.now()-last.readAt.getTime()>90*86400000?"90+ dní":""}</td></tr>})}</tbody></table></div>}
    <div className="meter-grid">{houseMeters.length?houseMeters.map(m=><div className={`meter-card ${m.active?"":"inactive"}`} key={m.id}>
      <div className="meter-card-head"><div><span className="eyebrow">{m.scope==="HOUSE_MAIN"?"Hlavní domovní":"Podružné"} · {m.active?"Aktivní":"Vyřazené"}</span><h3>{m.label||meterTypes[m.type]}</h3><small>{meterTypes[m.type]} · {m.serialNumber||"bez sériového čísla"}{m.location?` · ${m.location}`:""}</small>{m.supplyPointId&&<small>{m.type.startsWith("ELECTRICITY")?"EAN":m.type==="GAS"?"EIC":"Identifikátor odběrného místa"}: {m.supplyPointId}</small>}{m.parent&&<small>Nadřazené: {m.parent.label||m.parent.serialNumber||m.parent.id}</small>}</div><Gauge size={18}/></div>
      <MeterReadingHistory readings={m.readings} unitOfMeasure={m.unitOfMeasure} action={`/api/properties/${id}/meters/${m.id}/readings`} canManage={canManage} documents={documents}/>
      {canManage&&<details className="module-add"><summary>Upravit EAN / EIC</summary><form className="compact-form module-form" action={`/api/properties/${id}/meters/${m.id}`} method="post"><label className="field"><span>EAN / EIC odběrného místa</span><input name="supplyPointId" defaultValue={m.supplyPointId||""}/></label><button className="primary field-full" type="submit">Uložit identifikátor</button></form></details>}
    </div>):<div className="card empty-state compact-empty"><Gauge size={24}/><p>Objekt zatím nemá domovní měřidla.</p></div>}</div>
    {canManage&&<details className="card module-add"><summary><Plus size={15}/> Přidat domovní měřidlo</summary><form className="compact-form module-form" action={`/api/properties/${id}/meters`} method="post">
      <label className="field"><span>Úroveň</span><select name="scope" defaultValue="HOUSE_MAIN"><option value="HOUSE_MAIN">Hlavní domovní</option><option value="HOUSE_SUBMETER">Podružné</option></select></label>
      <label className="field"><span>Médium</span><select name="type">{Object.entries(meterTypes).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
      <label className="field"><span>Označení</span><input name="label" placeholder="např. Hlavní vodoměr"/></label>
      <label className="field"><span>Výrobní číslo měřidla</span><input name="serialNumber"/></label><label className="field"><span>EAN / EIC odběrného místa</span><input name="supplyPointId"/></label>
      <label className="field"><span>Umístění</span><input name="location" placeholder="např. suterén – vodoměrná šachta"/></label>
      <label className="field"><span>Jednotka</span><input name="unitOfMeasure" placeholder="Automaticky m³ nebo kWh"/></label>
      <label className="field"><span>Datum osazení</span><input name="installedAt" type="date"/></label>
      <label className="field"><span>Nadřazené měřidlo</span><select name="parentId"><option value="">— žádné —</option>{parentOptions.map(m=><option value={m.id} key={m.id}>{m.label||meterTypes[m.type]} · {m.serialNumber||"bez S/N"}</option>)}</select></label>
      <label className="field field-full"><span>Nahrazuje měřidlo</span><select name="replacementOfId"><option value="">— nejde o výměnu —</option>{houseMeters.filter(m=>m.active).map(m=><option value={m.id} key={m.id}>{m.label||meterTypes[m.type]} · {m.serialNumber||"bez S/N"}</option>)}</select></label>
      <button className="primary field-full" type="submit">Uložit měřidlo</button>
    </form></details>}
  </div></Shell>;
}
