import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Flash } from '@/components/FormUi';
import { SettlementSourceForm } from '@/components/SettlementSourceForm';
import { PropertySubnav } from '@/components/PropertySubnav';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sourceAccess, sourcePropertyWhere } from '@/lib/settlement-sources';
import { documentAccessWhere } from '@/lib/documents/access';
import { emptySourceLine, type SourcePayload } from '@/lib/settlement-source-rules';
import { date } from '@/lib/format';

export default async function SourcesPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{revise?:string;unitId?:string;leaseId?:string;ok?:string;error?:string}>}){
 const actor=await requireUser(),{id}=await params,q=await searchParams;const property=await sourceAccess(actor,id).catch(()=>null);if(!property)notFound();
 const [sources,documents,units,costs,canEdit]=await Promise.all([
  prisma.settlementSource.findMany({where:{propertyId:id},orderBy:{createdAt:'desc'},include:{next:{select:{id:true}}}}),
  prisma.document.findMany({where:{propertyId:id,...documentAccessWhere(actor),fileAsset:{deletedAt:null}},select:{id:true,title:true},orderBy:{createdAt:'desc'}}),
  prisma.unit.findMany({where:{propertyId:id},select:{id:true,label:true,leases:{select:{id:true,contractNumber:true,tenant:{select:{name:true}}}}},orderBy:{label:'asc'}}),
  prisma.propertyCost.findMany({where:{propertyId:id,status:'ACTUAL',kind:'OPEX'},select:{id:true,title:true,amountCents:true}}),
  prisma.property.findFirst({where:{id,...sourcePropertyWhere(actor,true)},select:{id:true}}),
 ]);
 const leases=units.flatMap(u=>u.leases.map(l=>({...l,unitId:u.id,unitLabel:u.label})));
 const contextLease=q.leaseId?leases.find(l=>l.id===q.leaseId):undefined;
 const contextUnit=q.unitId?units.find(u=>u.id===q.unitId):contextLease?units.find(u=>u.id===contextLease.unitId):undefined;
 if((q.unitId&&!contextUnit)||(q.leaseId&&!contextLease)||(contextLease&&contextUnit&&contextLease.unitId!==contextUnit.id))notFound();
 const sourceInContext=(payload:SourcePayload)=>{
  if(!contextUnit)return true;
  if(contextLease)return payload.mode==='HOUSE'||payload.unitId===contextUnit.id||payload.lines.some(line=>line.leaseId===contextLease.id||line.unitId===contextUnit.id||(!line.unitId&&payload.mode==='HOUSE'));
  return payload.mode==='HOUSE'||payload.unitId===contextUnit.id||payload.lines.some(line=>line.unitId===contextUnit.id||(!line.unitId&&payload.mode==='HOUSE'));
 };
 const visibleSources=contextUnit?sources.filter(source=>sourceInContext(source.payload as unknown as SourcePayload)):sources;
 const prev=q.revise?sources.find(s=>s.id===q.revise):null;if(q.revise&&(!prev||prev.next))notFound();const year=new Date().getUTCFullYear()-1;const from=`${year}-01-01`,to=`${year}-12-31`;
 const contextLine={...emptySourceLine(from,to),unitId:contextUnit?.id||'',leaseId:contextLease?.id||''};
 const initial:SourcePayload=prev?{...(prev.payload as unknown as SourcePayload),revisionReason:''}:{schemaVersion:1,mode:'HOUSE',kind:'INVOICE',vendor:'',reference:'',from,to,supplyAmount:'',supplierAdvances:'0',unitId:'',creditForId:'',propertyCostId:'',revisionReason:'',lines:[contextLine]};
 const contextSuffix=contextUnit?`?unitId=${encodeURIComponent(contextUnit.id)}${contextLease?`&leaseId=${encodeURIComponent(contextLease.id)}`:''}`:'';
 const backHref=contextLease?`/smlouvy/${contextLease.id}/vyuctovani`:contextUnit?`/nemovitosti/${id}/jednotky/${contextUnit.id}`:`/nemovitosti/${id}/prehled`;
 const contextLabel=contextLease?`${contextUnit?.label} · ${contextLease.contractNumber||contextLease.id} · ${contextLease.tenant.name}`:contextUnit?contextUnit.label:'';
 return <Shell user={actor} taskPropertyId={id} taskLeaseId={contextLease?.id}><div className="page"><div className="breadcrumb"><Link href={backHref}>← {contextLease?'Vyúčtování smlouvy':contextUnit?'Jednotka':'Nemovitost'}</Link><span>{property.name}</span><span>Podklady vyúčtování</span></div><div className="page-title"><div><h1>Podklady vyúčtování</h1><p>{contextLabel?`${contextLabel} · relevantní domovní i jednotkové podklady`:'Faktury a potvrzené výsledky ISTA / SVJ / zpracovatele.'}</p></div><div className="mini-actions">{contextUnit&&<Link className="secondary" href={`/nemovitosti/${id}/vyuctovani/podklady`}>Všechny podklady objektu</Link>}<Link className="secondary" href={`/nemovitosti/${id}/vyuctovani/pravidla`}>Pravidla rozúčtování</Link><Link className="secondary" href={`/nemovitosti/${id}/dokumenty`}>Nahrát / otevřít originály</Link></div></div>{!contextUnit&&<PropertySubnav propertyId={id} active="vyuctovani/podklady"/>}<Flash ok={q.ok} error={q.error}/>
 {contextUnit&&<div className="notice"><strong>Kontext {contextLease?'nájemního vztahu':'jednotky'}</strong><span>Zobrazení zachovává domovní podklady, které mohou vstupovat do rozúčtování, a zvýrazňuje kontext {contextLabel}. Nový řádek je tímto kontextem předvyplněn, rozsah lze při zadání vědomě změnit.</span></div>}
 <div className="notice"><strong>Evidence podkladů – bez zaúčtování</strong><p>Potvrzení ověřuje přepis originálu, nikoli úplnost vyúčtování nebo právní přípustnost položek. Pracovní protokol přebírá poslední potvrzené řádky konkrétní smlouvy, případně jednotky s jedinou smlouvou v celém období řádku. Domovní náklady a přesahy období čekají na doložené rozdělení. Přijaté úhrady a konečné vypořádání jsou samostatný krok.</p></div>
 <section className="card"><h2>Uložené podklady a historie</h2>{visibleSources.length?<div className="table-wrap"><table><thead><tr><th>Doklad</th><th>Období</th><th>Verze</th><th>Stav</th></tr></thead><tbody>{visibleSources.map(s=>{const p=s.payload as unknown as SourcePayload;const newerConfirmed=sources.some(n=>n.identityKey===s.identityKey&&n.version>s.version&&n.confirmedAt);return <tr key={s.id}><td><Link href={`/nemovitosti/${id}/vyuctovani/podklady/${s.id}${contextSuffix}`}>{p.vendor} · {p.reference}</Link></td><td>{p.from} – {p.to}</td><td>{s.version}</td><td>{s.confirmedAt?(newerConfirmed?'Historická potvrzená verze':`Potvrzené údaje · ${date(s.confirmedAt)}`):(s.next?'Historický návrh':'Návrh – nepotvrzeno')}</td></tr>;})}</tbody></table></div>:<p>Zatím nejsou evidované podklady pro tento kontext.</p>}</section>
 {canEdit?<SettlementSourceForm propertyId={id} initial={initial} previousId={prev?.id} documentId={prev?.documentId||''} documents={documents.map(d=>({id:d.id,label:d.title}))} units={units.map(u=>({id:u.id,label:u.label}))} leases={leases.map(l=>({id:l.id,unitId:l.unitId,label:`${l.contractNumber||l.id} · ${l.tenant.name}`}))} costs={costs.map(c=>({id:c.id,label:`${c.title} · ${(c.amountCents/100).toLocaleString('cs-CZ')} Kč`}))} invoices={sources.filter(s=>s.confirmedAt&&(s.payload as unknown as SourcePayload).kind==='INVOICE').map(s=>({id:s.id,label:`${(s.payload as unknown as SourcePayload).reference} · v${s.version}`}))}/>:<p className="notice">Pouze ke čtení. Zápis vyžaduje úpravy celého aktivního domu.</p>}
 </div></Shell>;
}
