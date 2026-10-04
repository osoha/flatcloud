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
import { MeterConsumption } from "@/components/MeterConsumption";
import { meterConsumption } from "@/lib/meter-consumption";
import { currentReadings } from "@/lib/meter-reading-rules";
import { businessTodayKey } from "@/lib/calendar";
import { money } from "@/lib/format";
import Link from "next/link";
import {openTaskStatuses} from "@/lib/operations";

export const dynamic = "force-dynamic";

export default async function PropertyMeters({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{ok?:string;error?:string;unit?:string;type?:string;state?:string;sort?:string;focus?:string}>}) {
  const user=await requireUser(); const {id}=await params; const query=await searchParams;
  const property=await requirePropertyAccess(user,id); if(!property) notFound();
  const canManage=hasAllPropertyAccess(user)||property.memberships.some(m=>m.userId===user.id&&(m.permission==="EDIT"||m.permission==="ADMIN"));
  const unitLimited=!hasAllPropertyAccess(user)&&!property.memberships.some(m=>m.userId===user.id);
  if(unitLimited) notFound();
  const [meters,documents]=await Promise.all([
    prisma.meter.findMany({where:{propertyId:id},orderBy:[{scope:"asc"},{createdAt:"asc"}],include:{unit:{select:{id:true,label:true}},parent:{select:{id:true,label:true,serialNumber:true}},tariffs:{orderBy:{validFrom:"asc"}},readings:{orderBy:{readAt:"asc"},include:{createdBy:{select:{name:true}},evidenceDocument:{select:{id:true,title:true}}}}}}),
    prisma.document.findMany({where:{propertyId:id,unitId:null,leaseId:null,fileAsset:{mimeType:{in:["application/pdf","image/jpeg","image/png","image/webp"]}}},include:{fileAsset:true},orderBy:{createdAt:"desc"}})
  ]);
  const mode=await displayMode(user.id,user.defaultDisplayMode==="basic"?"basic":"pro");
  const houseMeters=meters.filter(m=>m.scope!=="UNIT");
  const parentOptions=houseMeters.filter(m=>m.active&&m.scope==="HOUSE_MAIN");
  const units=Array.from(new Map(meters.filter(m=>m.unit).map(m=>[m.unit!.id,m.unit!.label])).entries());
  const filtered=meters.filter(m=>(!query.unit||query.unit==="all"||query.unit===(m.unitId||"house"))&&(!query.type||query.type==="all"||query.type===m.type)&&(!query.state||query.state==="all"||query.state===(m.active?"active":"inactive")));
  const rows=filtered.map(m=>{const readings=currentReadings(m.readings),last=readings.at(-1),before=readings.at(-2),tariff=m.tariffs.filter(t=>t.validFrom<=new Date()).at(-1);const interval=meterConsumption(readings,m.tariffs.map(t=>({...t,priceCentsPerUnit:Number(t.priceCentsPerUnit)})),m.unitOfMeasure).at(-1);return {m,last,before,tariff,interval,stale:!last||Date.now()-last.readAt.getTime()>90*86400000}}).sort((a,b)=>query.sort==="date"?(a.last?.readAt.getTime()||0)-(b.last?.readAt.getTime()||0):query.sort==="state"?Number(b.stale)-Number(a.stale):`${a.m.unit?.label||"Domovní"} ${a.m.label||meterTypes[a.m.type]}`.localeCompare(`${b.m.unit?.label||"Domovní"} ${b.m.label||meterTypes[b.m.type]}`,"cs"));
  const focused=rows.find(row=>row.m.id===query.focus)?.m||rows.find(row=>row.m.active)?.m;
  const [meterTasks,focusLeases]=mode==="pro"?await Promise.all([
    prisma.task.findMany({where:{propertyId:id,status:{in:openTaskStatuses},checklistItems:{some:{meterId:{not:null}}}},include:{assignee:{select:{name:true}},checklistItems:{select:{id:true,title:true,completedAt:true,meterId:true}}},take:10,orderBy:{dueAt:"asc"}}),
    focused?.unitId?prisma.lease.findMany({where:{unitId:focused.unitId},select:{startDate:true,endDate:true,terminatedOn:true}}):Promise.resolve([]),
  ]):[[],[]];
  const boundaries=focusLeases.flatMap(lease=>[lease.startDate,...(lease.terminatedOn?[lease.terminatedOn]:lease.endDate?[lease.endDate]:[])]);
  return <Shell user={user} taskPropertyId={id}><div className="page">
    <div className="breadcrumb">Portfolio › {property.name} › Měřidla</div>
    <div className="page-title"><div><PageHeading>{mode==="pro"?"Měřidla a odečty":"Domovní měřidla"}</PageHeading><p>{property.name} · {mode==="pro"?"domovní i bytová měřidla":"hlavní a podružná měřidla objektu"}</p></div></div>
    <PropertySubnav propertyId={id} active="meridla"/>
    <Flash ok={query.ok} error={query.error}/>
    <div className="notice"><strong>Princip evidence</strong><span>Hlavní domovní měřidlo je kořen. Podružné měřidlo lze navázat jen na stejné médium a měrnou jednotku. Bytová měřidla zůstávají na kartách jednotek. Výměna staré měřidlo nemaže.</span></div>
    {mode==="basic"&&<div className="card portal-welcome"><div><h2>Stačí stav měřidla a datum</h2><p>Bytová měřidla otevřete na kartě jednotky. Tady jsou domovní odečty.</p></div><img src="/guide/finance.webp" width="100" alt="Berry pomáhá s odečty"/></div>}
    {mode==="pro"&&<><div className="card profi-meter-overview"><div className="card-head"><div><h2>Přehled měřidel</h2><p className="muted-copy">Aktuální stav, poslední porovnatelné odečty a uložené ceny.</p></div>{canManage&&<details className="profi-meter-bulk"><summary>Hromadný odečet</summary><form action={`/api/properties/${id}/meters/bulk-readings`} method="post" className="compact-form"><label className="field"><span>Skutečné datum odečtu</span><input name="readAt" type="date" max={businessTodayKey()} defaultValue={businessTodayKey()} required/></label><p className="field-full">Vyplňte jen měřidla, která jste skutečně odečetli. Všechny vyplněné stavy se uloží společně.</p>{rows.filter(row=>row.m.active).map(({m})=><label key={m.id} className="field"><span>{m.unit?.label||"Domovní"} · {m.label||meterTypes[m.type]} ({m.unitOfMeasure})</span><input name={`value:${m.id}`} type="number" min="0" step="0.001"/></label>)}<button type="submit" className="primary field-full">Uložit vyplněné odečty</button></form></details>}</div><form className="profi-meter-filters" method="get"><label>Jednotka<select name="unit" defaultValue={query.unit||"all"}><option value="all">Všechny</option><option value="house">Domovní</option>{units.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Komodita<select name="type" defaultValue={query.type||"all"}><option value="all">Všechny</option>{Object.entries(meterTypes).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Stav<select name="state" defaultValue={query.state||"all"}><option value="all">Všechny</option><option value="active">Aktivní</option><option value="inactive">Vyřazené</option></select></label><label>Řazení<select name="sort" defaultValue={query.sort||"name"}><option value="name">Jednotka a název</option><option value="date">Nejstarší odečet</option><option value="state">Vyžaduje kontrolu</option></select></label><button className="secondary">Filtrovat</button></form><div className="table-wrap"><table><thead><tr><th>Měřidlo / jednotka</th><th>Poslední stav</th><th>Datum</th><th>Spotřeba</th><th>Odhad ceny</th><th>Záloha u měřidla</th><th>Kontrola</th></tr></thead><tbody>{rows.map(({m,last,interval,tariff,stale})=><tr key={m.id}><td><strong>{m.label||meterTypes[m.type]}</strong><small className="owner-sub">{m.unit?.label||(m.scope==="HOUSE_MAIN"?"Domovní · hlavní":"Domovní · podružné")} · {meterTypes[m.type]}{m.active?"":" · vyřazené"}</small></td><td>{last?`${last.value.toLocaleString("cs-CZ")} ${m.unitOfMeasure}`:"—"}</td><td>{last?.readAt.toLocaleDateString("cs-CZ")||"Bez odečtu"}</td><td>{interval?.quantity!=null?`${interval.quantity.toLocaleString("cs-CZ")} ${m.unitOfMeasure}`:"—"}</td><td>{interval?.estimatedCostCents!=null?money(interval.estimatedCostCents):"—"}</td><td>{tariff?money(tariff.monthlyAdvanceCents):"—"}</td><td>{m.active&&stale?<span className="status warn">90+ dní</span>:m.active?<span className="status ok">Aktuální</span>:"Historie"}{m.unit&&<Link href={`/nemovitosti/${id}/jednotky/${m.unit.id}#meridla`}>Detail →</Link>}</td></tr>)}{!rows.length&&<tr><td colSpan={7}>Výběru neodpovídá žádné měřidlo.</td></tr>}</tbody></table></div><p className="muted-copy">Spotřeba a cena vycházejí pouze z porovnatelných odečtů a uloženého tarifu. Záloha je evidována u měřidla; nejde o potvrzenou smluvní zálohu ani o vyúčtování.</p></div></>}
    {mode==="pro"&&<div className="profi-meter-insights"><section className="card"><div className="card-head"><div><h2>Spotřeba a zálohy</h2><p className="muted-copy">Vyberte měřidlo pro časový vývoj. Nesčítáme neporovnatelné komodity.</p></div><form method="get"><label className="field"><span>Měřidlo</span><select name="focus" defaultValue={focused?.id||""}>{rows.map(({m})=><option key={m.id} value={m.id}>{m.unit?.label||"Domovní"} · {m.label||meterTypes[m.type]}</option>)}</select></label><button className="secondary">Zobrazit</button></form></div>{focused?<MeterConsumption readings={focused.readings} tariffs={focused.tariffs.map(t=>({...t,priceCentsPerUnit:Number(t.priceCentsPerUnit)}))} unit={focused.unitOfMeasure} action={focused.unitId?`/api/properties/${id}/units/${focused.unitId}/meters/${focused.id}/tariffs`:""} canManage={false} leaseBoundaries={boundaries}/>:<p>V tomto výběru nejsou měřidla.</p>}</section><section className="card"><h2>Úkoly k odečtům</h2>{meterTasks.map(task=><Link key={task.id} href={`/ukoly/${task.id}`} className="profi-meter-task"><strong>{task.title}</strong><span>{task.assignee?.name||"Bez řešitele"} · {task.dueAt?.toLocaleDateString("cs-CZ")||"Bez termínu"}</span><small>{task.checklistItems.filter(item=>item.completedAt).length}/{task.checklistItems.length} položek hotovo</small></Link>)}{!meterTasks.length&&<p>Žádný otevřený úkol k odečtům.</p>}</section></div>}
    <details className="profi-meter-history" open={mode==="basic"}><summary>Domovní měřidla · historie a technické údaje</summary>
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
    </details>
  </div></Shell>;
}
