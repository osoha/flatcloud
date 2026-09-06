import Link from "next/link";
import { FileText } from "lucide-react";
import { documentCategories, documentPhotoStages } from "@/lib/labels";

export type DocumentListItem = {
  id: string; propertyId: string; unitId?: string | null; leaseId?: string | null; taskId?: string | null;
  complianceRecordId?: string | null; propertyCostId?: string | null; title: string; category: string;
  photoStage: string | null; taskEntryId?: string | null; documentDate: Date | null; createdAt: Date;
  fileAsset: { originalName: string; mimeType: string; sizeBytes: number }; property?: { name: string };
  unit?: { label: string } | null; lease?: { contractNumber: string | null } | null; task?: { title: string } | null;
  complianceRecord?: { id: string; complianceItem?: { name: string } } | null; propertyCost?: { title: string } | null;
};

export function DocumentAttachments({ documents, empty = "Zatím nejsou přiloženy žádné dokumenty.", canDelete = false, returnTo = "/dokumenty", showContext = false }: { documents: DocumentListItem[]; empty?: string; canDelete?: boolean; returnTo?: string; showContext?: boolean }) {
  if (!documents.length) return <div className="table-empty">{empty}</div>;
  return <div className="document-grid">{documents.map((document) => {
    const category = documentCategories[document.category] || document.category;
    const stage = document.photoStage ? documentPhotoStages[document.photoStage] || document.photoStage : null;
    return <article className="document-card" key={document.id}>
      {document.fileAsset.mimeType.startsWith("image/") ? <Link href={`/api/documents/${document.id}/download?variant=preview`} aria-label={`Otevřít náhled: ${document.title}`}><img loading="lazy" src={`/api/documents/${document.id}/download?variant=thumbnail`} alt=""/></Link> : <FileText size={32} aria-hidden="true"/>}
      <div><strong>{document.title}</strong><span>{document.fileAsset.originalName} · {(document.fileAsset.sizeBytes / 1024).toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} kB</span><span>{stage ? `${stage} · ` : ""}{category}</span>{showContext && <DocumentContext document={document}/>}<div className="document-actions"><Link href={`/api/documents/${document.id}/download`}>Stáhnout</Link>{canDelete && <form action={`/api/documents/${document.id}`} method="post"><input type="hidden" name="returnTo" value={returnTo}/><button className="link-button" type="submit">Odstranit</button></form>}</div></div>
    </article>;
  })}</div>;
}

function DocumentContext({ document: doc }: { document: DocumentListItem }) {
  const context = doc.taskId && doc.task ? <Link href={`/ukoly/${doc.taskId}`}>Úkol {doc.task.title}</Link>
    : doc.complianceRecordId && doc.complianceRecord ? <Link href={`/nemovitosti/${doc.propertyId}/provoz#revize`}>Revize {doc.complianceRecord.complianceItem?.name || "Kontrola"}</Link>
      : doc.propertyCostId && doc.propertyCost ? <Link href={`/nemovitosti/${doc.propertyId}/naklady/${doc.propertyCostId}`}>Náklad {doc.propertyCost.title}</Link>
        : doc.leaseId && doc.lease ? <Link href={`/smlouvy/${doc.leaseId}`}>Smlouva {doc.lease.contractNumber || "bez čísla"}</Link>
          : doc.unitId && doc.unit ? <Link href={`/nemovitosti/${doc.propertyId}/jednotky/${doc.unitId}`}>Jednotka {doc.unit.label}</Link>
            : <Link href={`/nemovitosti/${doc.propertyId}/dokumenty`}>Objekt</Link>;
  return <div className="document-context"><Link href={`/nemovitosti/${doc.propertyId}/prehled`}>{doc.property?.name || "Nemovitost"}</Link><span>·</span>{context}</div>;
}
