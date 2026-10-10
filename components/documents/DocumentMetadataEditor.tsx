"use client";
import {useState} from "react";
import {documentCategories} from "@/lib/labels";

export function DocumentMetadataEditor({document, leases, returnTo}: {document: {id: string; title: string; category: string; leaseId?: string | null; unitId?: string | null}; leases: Array<[string, string]>; returnTo: string}) {
  const [category, setCategory] = useState(document.category);
  const needsLease = Boolean(document.unitId || document.leaseId) && ["CONTRACT", "CONTRACT_ADDENDUM", "HANDOVER_PROTOCOL"].includes(category);
  return <details className="document-metadata-editor"><summary>Upravit zařazení</summary>
    <form action={`/api/documents/${document.id}/metadata`} method="post" className="compact-form">
      <input type="hidden" name="returnTo" value={returnTo}/>
      <label className="field"><span>Název dokumentu</span><input name="title" defaultValue={document.title} maxLength={250} required/></label>
      <label className="field"><span>Kategorie dokumentu</span><select name="category" value={category} onChange={event => setCategory(event.target.value)}>{Object.entries(documentCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field"><span>Přiřazení ke smlouvě{needsLease ? " *" : ""}</span><select name="leaseId" defaultValue={document.leaseId || ""} required={needsLease}><option value="">Pouze objekt / jednotka</option>{leases.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <p className="muted-copy">Zvolte smlouvu podle nájemníka a období dokumentu. Po změně smlouvy je dokument pouze pro správu; zpřístupnění nájemníkovi se zapíná samostatně na kartě dokumentu.</p>
      <button className="secondary" type="submit">Uložit zařazení</button>
    </form>
  </details>;
}
