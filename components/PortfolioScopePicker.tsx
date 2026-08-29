"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { portfolioSelectionLabel, withPortfolioSelection, type PortfolioSelection } from "@/lib/portfolio-selection";

type PropertyOption = { id: string; name: string; address: string; city: string; active: boolean };
export function PortfolioScopePicker({ availableProperties, selection }: { availableProperties: PropertyOption[]; selection: PortfolioSelection }) {
  const router = useRouter(), pathname = usePathname(), searchParams = useSearchParams();
  const [open, setOpen] = useState(false), [search, setSearch] = useState("");
  const selectionKey=selection.mode==="ALL"?`ALL:${availableProperties.map(property=>property.id).join(",")}`:`SELECTED:${selection.propertyIds.join(",")}`;
  const initial = useMemo(()=>selection.mode === "ALL" ? availableProperties.map((property) => property.id) : selection.propertyIds,[selectionKey]);
  const [draft, setDraft] = useState<string[]>(initial);
  useEffect(()=>{setDraft(initial);setOpen(false);setSearch("")},[selectionKey,initial]);
  const visible = useMemo(() => { const needle = search.trim().toLocaleLowerCase("cs"); return availableProperties.filter((property) => !needle || `${property.name} ${property.address} ${property.city}`.toLocaleLowerCase("cs").includes(needle)); }, [availableProperties, search]);
  const selectedCount = selection.mode === "ALL" ? availableProperties.length : selection.propertyIds.length;
  function close(reset = true) { if (reset) setDraft(initial); setOpen(false); setSearch(""); }
  function apply() { const next: PortfolioSelection = draft.length === availableProperties.length ? { mode: "ALL" } : { mode: "SELECTED", propertyIds: [...draft].sort() }; router.push(withPortfolioSelection(pathname, new URLSearchParams(searchParams.toString()), next)); setOpen(false); }
  if (availableProperties.length <= 1) return <span className="scope-picker-single">{portfolioSelectionLabel(selection, selectedCount, availableProperties.length, availableProperties.filter((property) => property.active).length)}</span>;
  return <div className="scope-picker"><button className="scope-picker-trigger" type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}><span><small>Zobrazené objekty</small><strong>{selection.mode === "ALL" ? `Všechny dostupné · ${availableProperties.length} objektů` : `${selectedCount} z ${availableProperties.length} objektů`}</strong></span><ChevronDown size={16}/></button>{open&&<div className="scope-picker-popover" role="dialog" aria-label="Vybrat zobrazené objekty"><button className="scope-all" type="button" onClick={()=>setDraft(availableProperties.map((property)=>property.id))}>Vybrat vše</button><label className="scope-search"><Search size={15}/><input autoFocus value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Najít dům…" aria-label="Hledat nemovitost"/></label><div className="scope-options">{visible.map((property)=><label key={property.id} className={!property.active?"archived":""}><input type="checkbox" checked={draft.includes(property.id)} onChange={(event)=>setDraft(event.target.checked?[...new Set([...draft,property.id])]:draft.filter((id)=>id!==property.id))}/><span><strong>{property.name}</strong><small>{property.city} · {property.address}{!property.active?" · Archivováno":""}</small></span></label>)}</div><div className="scope-actions"><button className="secondary" type="button" onClick={()=>close()}>Zrušit změny</button><button className="primary" type="button" onClick={apply}>Použít výběr</button></div></div>}</div>;
}
