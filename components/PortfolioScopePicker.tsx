"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { portfolioSelectionLabel, withPortfolioSelection, type PortfolioSelection } from "@/lib/portfolio-selection";

type PropertyOption = { id: string; name: string; address: string; city: string; active: boolean; ownerId?: string; ownerName?: string; scopeKind?: "FLATCLOUD" | "EXTERNAL" | "UNCLASSIFIED" };

export function PortfolioScopePicker({ availableProperties, selection }: { availableProperties: PropertyOption[]; selection: PortfolioSelection }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectionKey = selection.mode === "ALL" ? `ALL:${availableProperties.map((property) => property.id).join(",")}` : `SELECTED:${selection.propertyIds.join(",")}`;
  const initial = useMemo(() => selection.mode === "ALL" ? availableProperties.map((property) => property.id) : selection.propertyIds, [selectionKey]);
  const [draft, setDraft] = useState<string[]>(initial);
  useEffect(() => { setDraft(initial); setOpen(false); setSearch(""); }, [selectionKey, initial]);
  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("cs");
    return availableProperties.filter((property) => !needle || `${property.name} ${property.address} ${property.city} ${property.ownerName || ""}`.toLocaleLowerCase("cs").includes(needle));
  }, [availableProperties, search]);
  const ownerPresets = useMemo(() => {
    const groups = new Map<string, { name: string; propertyIds: string[] }>();
    for (const property of availableProperties) {
      if (!property.ownerName) continue;
      const key = property.ownerId || property.ownerName;
      const group = groups.get(key) || { name: property.ownerName, propertyIds: [] };
      group.propertyIds.push(property.id);
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "cs"));
  }, [availableProperties]);
  const groupPresets = [
    { key: "FLATCLOUD", label: "FlatCloud Group" },
    { key: "EXTERNAL", label: "Externí správa" },
    { key: "UNCLASSIFIED", label: "Nezařazené" },
  ].map((preset) => ({ ...preset, propertyIds: availableProperties.filter((property) => property.scopeKind === preset.key).map((property) => property.id) })).filter((preset) => preset.propertyIds.length);
  const selectedCount = selection.mode === "ALL" ? availableProperties.length : selection.propertyIds.length;

  function close(reset = true) {
    if (reset) setDraft(initial);
    setOpen(false);
    setSearch("");
  }
  function apply() {
    const next: PortfolioSelection = draft.length === availableProperties.length ? { mode: "ALL" } : { mode: "SELECTED", propertyIds: [...draft].sort() };
    router.push(withPortfolioSelection(pathname, new URLSearchParams(searchParams.toString()), next));
    setOpen(false);
  }

  if (availableProperties.length <= 1) return <span className="scope-picker-single">{portfolioSelectionLabel(selection, selectedCount, availableProperties.length, availableProperties.filter((property) => property.active).length)}</span>;
  return <div className="scope-picker">
    <button className="scope-picker-trigger" type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}><span><small>Rozsah správy</small><strong>{selection.mode === "ALL" ? `Vše ve správě · ${availableProperties.length} objektů` : `${selectedCount} z ${availableProperties.length} objektů`}</strong></span><ChevronDown size={16}/></button>
    {open && <div className="scope-picker-popover" role="dialog" aria-label="Vybrat zobrazené objekty">
      <div className="scope-presets" aria-label="Rychlý výběr rozsahu">
        <button type="button" aria-label="Vybrat vše ve správě" onClick={() => setDraft(availableProperties.map((property) => property.id))}>Vše ve správě</button>
        {groupPresets.map((preset) => <button className={`scope-group-preset ${preset.key.toLocaleLowerCase()}`} type="button" onClick={() => setDraft(preset.propertyIds)} key={preset.key}>{preset.label}<span>{preset.propertyIds.length}</span></button>)}
        {ownerPresets.length > 1 && ownerPresets.map((owner) => <button className="scope-owner-preset" type="button" onClick={() => setDraft(owner.propertyIds)} key={`${owner.name}:${owner.propertyIds.join(",")}`}>{owner.name}<span>{owner.propertyIds.length}</span></button>)}
      </div>
      <label className="scope-search"><Search size={15}/><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Najít dům nebo vlastníka…" aria-label="Hledat nemovitost nebo vlastníka"/></label>
      <div className="scope-options">{visible.map((property) => <label key={property.id} className={!property.active ? "archived" : ""}><input type="checkbox" checked={draft.includes(property.id)} onChange={(event) => setDraft(event.target.checked ? [...new Set([...draft, property.id])] : draft.filter((id) => id !== property.id))}/><span><strong>{property.name}</strong><small>{property.ownerName ? `${property.ownerName} · ` : ""}{property.city} · {property.address}{!property.active ? " · Archivováno" : ""}</small></span></label>)}</div>
      <div className="scope-actions"><button className="secondary" type="button" onClick={() => close()}>Zrušit změny</button><button className="primary" type="button" onClick={apply}>Použít výběr</button></div>
    </div>}
  </div>;
}
