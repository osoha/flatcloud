import { CheckCheck, ChevronDown, Download, FileText } from "lucide-react";
import { date } from "@/lib/format";
import type { PortalBankNotice as Notice } from "@/lib/portal-bank-notices";

export function PortalBankNotice({ notice, tenantId, preview, anchor = false }: { notice: Notice; tenantId: string; preview: boolean; anchor?: boolean }) {
  const confirmed = notice.reads[0]?.confirmedAt;
  const status = { SCHEDULED: "Naplánováno", APPLIED: "Účinné", CANCELLED: "Změna zrušena", BLOCKED: "Čeká na kontrolu správce" }[notice.change.status] || notice.change.status;
  return <div id={anchor ? "bankovni-oznameni" : undefined}>
    <details className={`tp-message tp-message-notice${confirmed ? "" : " tp-message-unread"}`} id={`bankovni-oznameni-${notice.id}`}>
      <summary className="tp-message-summary">
        <span className="tp-message-icon"><FileText size={20} aria-hidden="true"/></span>
        <span className="tp-message-summary-copy"><strong role="heading" aria-level={3}>{notice.title}</strong><span className="tp-message-meta"><span>Vystaveno {date(notice.createdAt)}</span><span>Účinnost {date(notice.change.effectiveAt)}</span><span>{status}</span></span></span>
        <span className={`tp-message-state${confirmed ? "" : " tp-message-state-pending"}`}>{confirmed ? "Přečteno" : "K přečtení"}</span><ChevronDown className="tp-message-chevron" size={18} aria-hidden="true"/>
      </summary>
      <div className="tp-message-content"><p>{notice.body}</p><div className="tp-message-actions">
        <a className="tp-button tp-button-soft" href={preview ? `/api/bank-accounts/notices/${notice.id}/pdf` : `/api/portal/tenants/${tenantId}/bank-notices/${notice.id}`}><Download size={17}/> Stáhnout PDF oznámení</a>
        {confirmed ? <span className="tp-message-confirmed"><CheckCheck size={16}/> Potvrzeno přečtení {date(confirmed)}</span> : <form action={`/api/portal/tenants/${tenantId}/bank-notices/${notice.id}`} method="post"><input type="hidden" name="confirm" value={notice.pdfHash}/><button className="tp-button tp-button-primary" type="submit" disabled={preview}>Potvrzuji, že jsem oznámení přečetl/a</button></form>}
      </div></div>
    </details>
  </div>;
}
