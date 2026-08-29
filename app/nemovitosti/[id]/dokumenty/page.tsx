import { notFound } from "next/navigation";
import { requireUser,hasAllPropertyAccess } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { documentAccessWhere } from "@/lib/documents/access";
import { Shell } from "@/components/Shell";
import { PropertySubnav } from "@/components/PropertySubnav";
import { DocumentAttachments } from "@/components/documents/DocumentAttachments";
import { DocumentUploadForm } from "@/components/documents/DocumentUploadForm";

export const dynamic="force-dynamic";
export default async function PropertyDocuments({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{ok?:string;error?:string}>}){const user=await requireUser();const{id}=await params;const property=await requirePropertyAccess(user,id);if(!property)notFound();const documents=await prisma.document.findMany({where:{AND:[documentAccessWhere(user),{propertyId:id}]},orderBy:{createdAt:"desc"},include:{fileAsset:true,property:{select:{name:true}},unit:{select:{label:true}},lease:{select:{contractNumber:true}},task:{select:{title:true}},complianceRecord:{select:{id:true}}}});const canPropertyEdit=hasAllPropertyAccess(user)||property.memberships.some(m=>m.userId===user.id&&(m.permission==="EDIT"||m.permission==="ADMIN"));const unitLimited=!hasAllPropertyAccess(user)&&!property.memberships.some(m=>m.userId===user.id);const returnTo=`/nemovitosti/${id}/dokumenty`;return <Shell user={user}><div className="page"><div className="breadcrumb">Portfolio › {property.name} › Dokumenty</div><div className="page-title"><div><h1>Dokumenty</h1><p>{property.name} · dokumenty objektu a povolených kontextů.</p></div></div><PropertySubnav propertyId={id} active="dokumenty" unitLimited={unitLimited}/>{canPropertyEdit&&<div className="card"><h2>Nahrát dokument objektu</h2><DocumentUploadForm propertyId={id} returnTo={returnTo} categories={[["TECHNICAL_DOCUMENT","Technický dokument"],["PHOTO","Fotografie"],["INSURANCE","Pojištění"],["OTHER","Ostatní"]]}/></div>}<div className="card"><DocumentAttachments documents={documents} canDelete={canPropertyEdit} returnTo={returnTo}/></div></div></Shell>}
