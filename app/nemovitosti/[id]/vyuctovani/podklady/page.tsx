import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Flash } from '@/components/FormUi';
import { SettlementSourceForm } from '@/components/SettlementSourceForm';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sourceAccess, sourcePropertyWhere } from '@/lib/settlement-sources';
import { documentAccessWhere } from '@/lib/documents/access';
import { emptySourceLine, type SourcePayload } from '@/lib/settlement-source-rules';
import { date } from '@/lib/format';
export default async function SourcesPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{revise?:string;ok?:string;error?:string}>}){
 const actor=await requireUser(),{id}=await params,q=await searchParams;const property=await sourceAccess(actor,id).catch(()=>null);if(!property)notFound();
 const [sources,documents,units,costs,canEdit]=await Promise.all([
 prisma.settlementSource.findMany({where:{propertyId:id},orderBy:{createdAt:'desc'},include:{next:{select:{id:true}}}}),
 prisma.document.findMany({where:{propertyId:id,...documentAccessWhere(actor),fileAsset:{deletedAt:null}},select:{id:true,title:true},orderBy:{createdAt:'desc'}}),
 prisma.unit.findMany({where:{propertyId:id},select:{id:true,label:true,leases:{select:{id:true,contractNumber:true,tenant:{select:{name:true}}}}},orderBy:{label:'asc'}}),
 prisma.propertyCost.findMany({where:{propertyId:id,status:'ACTUAL',kind:'OPEX'},select:{id:true,title:true,amountCents:true}}),
 prisma.property.findFirst({where:{id,...sourcePropertyWhere(actor,true)},select:{id:true}}),
 ]);
 const prev=q.revise?sources.find(s=>s.id===q.revise):null;if(q.revise&&(!prev||prev.next))notFound();const year=new Date().getUTCFullYear()-1;const from=`${year}-01-01`,to=`${year}-12-31`;
 const initial:SourcePayload=prev?{...(prev.payload as unknown as SourcePayload),revisionReason:''}:{schemaVersion:1,mode:'HOUSE',kind:'INVOICE',vendor:'',reference:'',from,to,supplyAmount:'',supplierAdvances:'0',unitId:'',creditForId:'',propertyCostId:'',revisionReason:'',lines:[emptySourceLine(from,to)]};
 return <Shell user={actor} taskPropertyId={id}><div className="page"><div className="breadcrumb"><Link href={`/nemovitosti/${id}/prehled`}>← {property.name}</Link><span>Podklady vyúčtování</span></div><div className="page-title"><div><h1>Podklady vyúčtování</h1><p>Faktury a potvrzené výsledky ISTA / SVJ / zpracovatele.</p></div><div className="mini-actions"><Link className="secondary" href={`/nemovitosti/${id}/vyuctovani/pravidla`}>Pravidla rozúčtování</Link><Link className="secondary" href={`/nemovitosti/${id}/dokumenty`}>Nahrát / otevřít originály</Link></div></div><Flash ok={q.ok} error={q.error}/>
 <div className="notice"><strong>Evidence podkladů – bez zaúčtování</strong><p>Potvrzení ověřuje přepis originálu, nikoli úplnost vyúčtování nebo právní přípustnost položek. Pracovní protokol přebírá poslední potvrzené řádky konkrétní smlouvy, případně jednotky s jedinou smlouvou v celém období řádku. Domovní náklady a přesahy období čekají na doložené rozdělení. Přijaté úhrady a konečné vypořádání budou samostatný krok.</p></div>
 <section className="card"><h2>Uložené podklady a historie</h2>{sources.length?<div className="table-wrap"><table><thead><tr><th>Doklad</th><th>Období</th><th>Verze</th><th>Stav</th></tr></thead><tbody>{sources.map(s=>{const p=s.payload as unknown as SourcePayload;const newerConfirmed=sources.some(n=>n.identityKey===s.identityKey&&n.version>s.version&&n.confirmedAt);return <tr key={s.id}><td><Link href={`/nemovitosti/${id}/vyuctovani/podklady/${s.id}`}>{p.vendor} · {p.reference}</Link></td><td>{p.from} – {p.to}</td><td>{s.version}</td><td>{s.confirmedAt?(newerConfirmed?'Historická potvrzená verze':`Potvrzené údaje · ${date(s.confirmedAt)}`):(s.next?'Historický návrh':'Návrh – nepotvrzeno')}</td></tr>;})}</tbody></table></div>:<p>Zatím nejsou evidované podklady.</p>}</section>
 {canEdit?<SettlementSourceForm propertyId={id} initial={initial} previousId={prev?.id} documentId={prev?.documentId||''} documents={documents.map(d=>({id:d.id,label:d.title}))} units={units.map(u=>({id:u.id,label:u.label}))} leases={units.flatMap(u=>u.leases.map(l=>({id:l.id,unitId:u.id,label:`${l.contractNumber||l.id} · ${l.tenant.name}`})))} costs={costs.map(c=>({id:c.id,label:`${c.title} · ${(c.amountCents/100).toLocaleString('cs-CZ')} Kč`}))} invoices={sources.filter(s=>s.confirmedAt&&(s.payload as unknown as SourcePayload).kind==='INVOICE').map(s=>({id:s.id,label:`${(s.payload as unknown as SourcePayload).reference} · v${s.version}`}))}/>:<p className="notice">Pouze ke čtení. Zápis vyžaduje úpravy celého aktivního domu.</p>}
 </div></Shell>;
}
