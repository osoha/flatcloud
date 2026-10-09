import {Flash} from "@/components/FormUi";
import {PageHeading} from "@/components/PageHeading";
import {notFound} from "next/navigation";
import {requireUser,hasAllPropertyAccess} from "@/lib/auth";
import {requirePropertyAccess} from "@/lib/access";
import {prisma} from "@/lib/db";
import {documentAccessWhere} from "@/lib/documents/access";
import {Shell} from "@/components/Shell";
import {PropertySubnav} from "@/components/PropertySubnav";
import {DocumentAttachments} from "@/components/documents/DocumentAttachments";
import {DocumentUploadForm} from "@/components/documents/DocumentUploadForm";

export const dynamic="force-dynamic";
export default async function PropertyDocuments({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{ok?:string;error?:string}>}) {
  const user=await requireUser(), {id}=await params, query=await searchParams;
  const property=await requirePropertyAccess(user,id);if(!property)notFound();
  const documents=await prisma.document.findMany({where:{AND:[documentAccessWhere(user),{propertyId:id}]},orderBy:{createdAt:"desc"},include:{fileAsset:true,property:{select:{name:true}},unit:{select:{id:true,label:true}},lease:{select:{contractNumber:true,unitId:true,unit:{select:{id:true,label:true,propertyId:true}}}},task:{select:{title:true,unitId:true,lease:{select:{unitId:true}}}},taskEntry:{select:{task:{select:{unitId:true,lease:{select:{unitId:true}}}}}},complianceRecord:{select:{id:true}},propertyCost:{select:{title:true,unitId:true}}}});
  const canPropertyEdit=hasAllPropertyAccess(user)||property.memberships.some(m=>m.userId===user.id&&["EDIT","ADMIN"].includes(m.permission));
  const unitLimited=!hasAllPropertyAccess(user)&&!property.memberships.some(m=>m.userId===user.id);
  const returnTo=`/nemovitosti/${id}/dokumenty`;
  const contextUnit=(document:typeof documents[number])=>document.unitId||document.lease?.unitId||document.propertyCost?.unitId||document.task?.unitId||document.task?.lease?.unitId||document.taskEntry?.task.unitId||document.taskEntry?.task.lease?.unitId;
  const shared=documents.filter(document=>!contextUnit(document));
  const groups=property.units.map(unit=>({unit,documents:documents.filter(document=>contextUnit(document)===unit.id)})).filter(group=>group.documents.length);
  return <Shell user={user} taskPropertyId={id}><div className="page property-documents-page">
    <div className="breadcrumb">Portfolio › {property.name} › Dokumenty</div><div className="page-title"><div><PageHeading>Dokumenty</PageHeading><p>{property.name} · společné podklady a dokumenty vašich dostupných jednotek.</p></div></div>
    <Flash {...query}/><PropertySubnav propertyId={id} active="dokumenty" unitLimited={unitLimited}/>
    <section className="card"><div className="card-head"><div><h2>Společné dokumenty objektu</h2><p className="muted-copy">Technické podklady, pojištění a další dokumenty pro celý dům.</p></div><span className="status">{shared.length} dokumentů</span></div>
      <DocumentAttachments documents={shared} viewer={user} canDelete={canPropertyEdit} returnTo={returnTo}/>
      {canPropertyEdit&&<details className="module-add"><summary>Nahrát společný dokument</summary><DocumentUploadForm propertyId={id} returnTo={returnTo} categories={[["TECHNICAL_DOCUMENT","Technický dokument"],["PHOTO","Fotografie"],["INSURANCE","Pojištění"],["OTHER","Ostatní"]]}/></details>}
    </section>
    <section className="card"><div className="card-head"><div><h2>Dokumenty po jednotkách</h2><p className="muted-copy">Zobrazují se pouze jednotky, ke kterým máte oprávnění. Dokumenty konkrétního nájmu zůstávají u dané jednotky.</p></div></div>
      {groups.map(({unit,documents:rows})=><details className="document-unit-group" key={unit.id}><summary>{unit.label}<span>{rows.length} dokumentů</span></summary><DocumentAttachments documents={rows} viewer={user} canDelete={canPropertyEdit} returnTo={returnTo}/></details>)}
      {!groups.length&&<p className="table-empty">U dostupných jednotek zatím nejsou dokumenty.</p>}
    </section>
  </div></Shell>;
}
