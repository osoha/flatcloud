"use client";
import { useId, useState } from "react";
const normalized = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("cs");
export function SearchableLeaseSelect({ options, defaultValue = "" }: { options: [string, string][]; defaultValue?: string }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(defaultValue);
  const id = useId();
  const terms = normalized(query).trim().split(/\s+/).filter(Boolean);
  const matches = options.filter(([, label]) => terms.every(term => normalized(label).includes(term)));
  const visible = options.filter(([value]) => value === selected || matches.some(([id]) => id === value));
  return <div className="field-full">
    <label className="field"><span>Vyhledat nájemní vztah</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nemovitost, byt nebo nájemník" aria-describedby={id}/></label>
    <p id={id} aria-live="polite">Nalezeno {matches.length} vztahů. Vybraný vztah zůstává dostupný i při změně hledání.</p>
    <label className="field"><span>Nájemní vztah / byt *</span><select name="leaseId" required value={selected} onChange={event => setSelected(event.target.value)}><option value="">Vyberte nájemní vztah / byt</option>{visible.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
  </div>;
}
