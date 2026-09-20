"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { portfolioSelectionLabel, withPortfolioSelection, type PortfolioSelection } from "@/lib/portfolio-selection";

type PropertyOption = { id: string; name: string; address: string; city: string; active: boolean; ownerId?: string; ownerName?: string; scopeKind?: "FLATCLOUD" | "EXTERNAL" | "UNCLASSIFIED" };

export function PortfolioScopePicker({ availableProperties, selection }: { availableProperties: PropertyOption[]; selection: PortfolioSelection }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [placement, setPlacement] = useState({ top: 12, left: 12, width: 390, maxHeight: 500 });
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const topEdge = (viewport?.offsetTop || 0) + 12;
      const height = viewport?.height || window.innerHeight;
      const width = Math.min(390, (viewport?.width || window.innerWidth) - 24);
      const leftEdge = (viewport?.offsetLeft || 0) + 12;
      const top = Math.max(topEdge, Math.min(rect.bottom + 8, topEdge + Math.max(0, height - 344)));
      setPlacement({ top, left: Math.max(leftEdge, Math.min(rect.right - width, leftEdge + (viewport?.width || window.innerWidth) - width - 24)), width, maxHeight: Math.max(0, topEdge + height - 24 - top) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); window.visualViewport?.removeEventListener("resize", place); window.visualViewport?.removeEventListener("scroll", place); };
  }, [open]);
  const [search, setSearch] = useState("");
  const selectionKey = selection.mode === "ALL" ? `ALL:${availableProperties.map((property) => property.id).join(",")}` : `SELECTED:${selection.propertyIds.join(",")}`;
  const initial = useMemo(() => selection.mode === "ALL" ? availableProperties.map((property) => property.id) : selection.propertyIds, [selectionKey]);
  const [draft, setDraft] = useState<string[]>(initial);
  useEffect(() => { setDraft(initial); setOpen(false); setSearch(""); }, [selectionKey, initial]);
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      // Native page scrollbar is not a dismiss action.
      if (event.clientX >= document.documentElement.clientWidth || event.clientY >= document.documentElement.clientHeight) return;
      if (open && event.target instanceof Node && !pickerRef.current?.contains(event.target)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (open && event.key === "Escape") {
        event.preventDefault();
        close();
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, initial]);
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
    const params = new URLSearchParams(searchParams.toString());
    if (pathname === "/reporty") params.delete("unitId");
    router.push(withPortfolioSelection(pathname, params, next));
    setOpen(false);
  }

  if (availableProperties.length <= 1) return <span className="scope-picker-single">{portfolioSelectionLabel(selection, selectedCount, availableProperties.length, availableProperties.filter((property) => property.active).length)}</span>;
  return <div className="scope-picker" ref={pickerRef}>
    <button ref={triggerRef} className="scope-picker-trigger" type="button" title="Zobrazené objekty" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}><span><small>Rozsah správy</small><strong>{selection.mode === "ALL" ? `Vše ve správě · ${availableProperties.length} objektů` : `${selectedCount} z ${availableProperties.length} objektů`}</strong></span><ChevronDown size={16}/></button>
    {open && <div className="scope-picker-popover" style={placement} role="dialog" aria-label="Vybrat zobrazené objekty">
      <div className="scope-actions"><button className="secondary" type="button" onClick={() => close()}>Zrušit změny</button><button className="primary" type="button" onClick={apply}>Použít výběr</button></div>
      <div className="scope-bulk-actions"><button type="button" aria-label="Vybrat vše ve správě" onClick={() => setDraft(availableProperties.map((property) => property.id))}>Označit vše</button><button type="button" onClick={() => setDraft([])}>Odznačit vše</button><span aria-live="polite">Vybráno {draft.length} z {availableProperties.length}</span></div>
      <label className="scope-search"><Search size={15}/><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Najít dům nebo vlastníka…" aria-label="Hledat nemovitost nebo vlastníka"/></label>
      <div className="scope-picker-scroll">
      <div className="scope-presets" aria-label="Rychlý výběr rozsahu">
        {groupPresets.map((preset) => <button className={`scope-group-preset ${preset.key.toLocaleLowerCase()}`} type="button" onClick={() => setDraft(preset.propertyIds)} key={preset.key}>{preset.label}<span>{preset.propertyIds.length}</span></button>)}
        {ownerPresets.length > 1 && ownerPresets.map((owner) => <button className="scope-owner-preset" type="button" onClick={() => setDraft(owner.propertyIds)} key={`${owner.name}:${owner.propertyIds.join(",")}`}>{owner.name}<span>{owner.propertyIds.length}</span></button>)}
      </div>

      <div className="scope-options">{visible.map((property) => <label key={property.id} className={!property.active ? "archived" : ""}><input type="checkbox" checked={draft.includes(property.id)} onChange={(event) => setDraft(event.target.checked ? [...new Set([...draft, property.id])] : draft.filter((id) => id !== property.id))}/><span><strong>{property.name}</strong><small>{property.ownerName ? `${property.ownerName} · ` : ""}{property.city} · {property.address}{!property.active ? " · Archivováno" : ""}</small></span></label>)}</div>
      {!visible.length && <p>Žádná nemovitost neodpovídá hledání.</p>}
      </div>
    </div>}
  </div>;
}
