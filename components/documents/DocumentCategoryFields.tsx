"use client";

import { useState } from "react";

export function DocumentCategoryFields({ categories, defaultCategory, leases }: {
  categories: [string, string][]; defaultCategory?: string; leases?: [string, string][];
}) {
  const [category, setCategory] = useState(defaultCategory || categories[0]?.[0] || "OTHER");
  const contract = category === "CONTRACT" || category === "CONTRACT_ADDENDUM" || category === "HANDOVER_PROTOCOL";
  return <>
    <label className="field"><span>Kategorie</span><select name="category" value={category} onChange={event => setCategory(event.target.value)}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {leases && contract && <label className="field"><span>Smlouva *</span><select name="leaseId" required defaultValue={leases.length === 1 ? leases[0][0] : ""}><option value="">Vyberte smlouvu</option>{leases.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><small>Dokument přiřadíme k této smlouvě. Sdílení nájemníkovi zapnete samostatně u nahraného souboru.</small></label>}
  </>;
}
