import { FileText } from "lucide-react";

export type TaskAttachmentItem = { id: string; fileAsset: { originalName: string; mimeType: string; sizeBytes: number; thumbnailStorageKey: string | null } };

export function TaskAttachments({ attachments }: { attachments: TaskAttachmentItem[] }) {
  if (!attachments.length) return null;
  return <div className="document-grid">{attachments.map(attachment => <article className="document-card" key={attachment.id}>
    {attachment.fileAsset.mimeType.startsWith("image/") && attachment.fileAsset.thumbnailStorageKey
      ? <a href={`/api/task-attachments/${attachment.id}/download`}><img src={`/api/task-attachments/${attachment.id}/download?variant=thumbnail`} alt={attachment.fileAsset.originalName}/></a>
      : <FileText size={32} aria-hidden="true"/>}
    <div><strong>{attachment.fileAsset.originalName}</strong><span>{(attachment.fileAsset.sizeBytes / 1024).toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} kB</span><div className="document-actions"><a href={`/api/task-attachments/${attachment.id}/download`}>Stáhnout</a></div></div>
  </article>)}</div>;
}
