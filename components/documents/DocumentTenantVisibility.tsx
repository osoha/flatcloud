import {Eye, LockKeyhole, Unlink} from "lucide-react";
import styles from "./DocumentTenantVisibility.module.css";

type Props = {document: {id: string; propertyId: string; unitId?: string | null; lease?: {unitId?: string; unit?: {propertyId: string}} | null; leaseId?: string | null; tenantVisible?: boolean; taskEntryId?: string | null}; canEdit: boolean; returnTo: string};
export function DocumentTenantVisibility({document, canEdit, returnTo}: Props) {
  if (document.tenantVisible === undefined) return null;
  const incoherent = document.lease?.unit && (document.lease.unit.propertyId !== document.propertyId || Boolean(document.unitId && document.lease.unitId && document.unitId !== document.lease.unitId));
  if (document.taskEntryId || incoherent) return <div className={styles.sharing}><span className={`${styles.badge} ${styles.private}`}><LockKeyhole size={13}/> Nezobrazuje se v portálu</span><small>{document.taskEntryId ? "Příloha konverzace má vlastní pravidla viditelnosti." : "Přiřazení dokumentu neodpovídá této smlouvě."}</small></div>;
  if (!document.leaseId) return <div className={styles.sharing}><span className={`${styles.badge} ${styles.unbound}`}><Unlink size={13}/> Nepřiřazeno ke smlouvě</span><small>V portálu nájemníka se nezobrazuje.</small></div>;
  return <div className={styles.sharing}>
    <span className={`${styles.badge} ${document.tenantVisible ? styles.shared : styles.private}`}>{document.tenantVisible ? <Eye size={14}/> : <LockKeyhole size={13}/>} {document.tenantVisible ? "Zpřístupněno nájemníkovi" : "Pouze správa"}</span>
    {canEdit && <form action={`/api/leases/${document.leaseId}/documents/${document.id}/tenant-visibility`} method="post"><input type="hidden" name="returnTo" value={returnTo}/><button className="link-button" name="tenantVisible" value={document.tenantVisible ? "false" : "true"} type="submit">{document.tenantVisible ? "Skrýt v portálu" : "Zpřístupnit nájemníkovi"}</button></form>}
  </div>;
}
