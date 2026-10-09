"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Search, Star } from "lucide-react";
import { createPortal } from "react-dom";
import { portfolioSelectionLabel, withPortfolioSelection, type PortfolioSelection } from "@/lib/portfolio-selection";

import { portfolioOwnerPresets, type PortfolioPropertyOption as PropertyOption } from "@/lib/portfolio-ownership";

const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("cs");
const unitCountLabel = (count: number) => `${count} ${count === 1 ? "jednotka" : count > 1 && count < 5 ? "jednotky" : "jednotek"}`;

export function PortfolioScopePicker({ availableProperties, selection, viewerId }: { viewerId: string; availableProperties: PropertyOption[]; selection: PortfolioSelection }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
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
      const leftEdge = (viewport?.offsetLeft || 0) + 12;
      const rightEdge = (viewport?.offsetLeft || 0) + (viewport?.width || window.innerWidth) - 12;
      const contentLeft = Math.max(leftEdge, rect.left);
      const width = Math.max(0, Math.min(390, rightEdge - contentLeft));
      const top = Math.max(topEdge, Math.min(rect.bottom + 8, topEdge + Math.max(0, height - 344)));
      setPlacement({ top, left: Math.max(contentLeft, Math.min(rect.right - width, rightEdge - width)), width, maxHeight: Math.max(0, topEdge + height - 24 - top) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); window.visualViewport?.removeEventListener("resize", place); window.visualViewport?.removeEventListener("scroll", place); };
  }, [open]);
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const favoriteKey = `flatberry:portfolio-owner-favorites:${viewerId}`;
  useEffect(() => { try { const saved: unknown = JSON.parse(localStorage.getItem(favoriteKey) || "[]"); setFavorites(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string").slice(0, 5) : []); } catch { setFavorites([]); } }, [favoriteKey]);
  function toggleFavorite(id: string) {
    const next = favorites.includes(id) ? favorites.filter(value => value !== id) : [...favorites, id].slice(-5);
    setFavorites(next); try { localStorage.setItem(favoriteKey, JSON.stringify(next)); } catch { /* Preference remains usable for this visit. */ }
  }
  const selectionKey = `${selection.ownerId || ""}:` + (selection.mode === "ALL" ? `ALL:${availableProperties.filter(property => !selection.ownerId || property.owners.some(owner => owner.id === selection.ownerId)).map((property) => property.id).join(",")}` : `SELECTED:${selection.propertyIds.join(",")}`);
  const initial = useMemo(() => selection.mode === "ALL" ? availableProperties.filter(property => !selection.ownerId || property.owners.some(owner => owner.id === selection.ownerId)).map((property) => property.id) : selection.propertyIds, [selectionKey]);
  const [draftOwnerId, setDraftOwnerId] = useState(selection.ownerId);
  const [draft, setDraft] = useState<string[]>(initial);
  useEffect(() => { setDraft(initial); setDraftOwnerId(selection.ownerId); setOpen(false); setSearch(""); }, [selectionKey, initial]);
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      // Native page scrollbar is not a dismiss action.
      if (event.clientX >= document.documentElement.clientWidth || event.clientY >= document.documentElement.clientHeight) return;
      if (open && event.target instanceof Node && !pickerRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) close();
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
    const needle = normalizeSearch(search.trim());
    return availableProperties.filter((property) => (!draftOwnerId || property.owners.some(owner => owner.id === draftOwnerId)) && (!needle || normalizeSearch(`${property.name} ${property.address} ${property.city} ${property.ownerName || ""} ${property.owners.map(owner => owner.name).join(" ")}`).includes(needle)));
  }, [availableProperties, search, draftOwnerId]);
  const ownerPresets = useMemo(() => portfolioOwnerPresets(availableProperties), [availableProperties]);
  const selectedOwner = ownerPresets.find(owner => owner.id === selection.ownerId);
  const groupPresets = [
    { key: "FLATCLOUD", label: "FlatCloud Group" },
    { key: "EXTERNAL", label: "Externí správa" },
    { key: "UNCLASSIFIED", label: "Nezařazené" },
  ].map((preset) => ({ ...preset, propertyIds: availableProperties.filter((property) => property.scopeKind === preset.key).map((property) => property.id) })).filter((preset) => preset.propertyIds.length);
  const selectedUnitCount = availableProperties.filter(property => initial.includes(property.id)).reduce((sum, property) => sum + (property.owners.find(owner => owner.id === selection.ownerId)?.unitIds.length ?? 0), 0);
  const selectedCount = selection.mode === "ALL" ? initial.length : selection.propertyIds.length;

  function close(reset = true) {
    if (reset) { setDraft(initial); setDraftOwnerId(selection.ownerId); }
    setOpen(false);
    setSearch("");
  }
  function apply() {
    const eligible = availableProperties.filter(property => !draftOwnerId || property.owners.some(owner => owner.id === draftOwnerId));
    const next: PortfolioSelection = draft.length === eligible.length && eligible.every(property => draft.includes(property.id)) ? { mode: "ALL", ownerId: draftOwnerId } : { mode: "SELECTED", propertyIds: [...draft].sort(), ownerId: draftOwnerId };
    const params = new URLSearchParams(searchParams.toString());
    if (pathname === "/reporty") params.delete("unitId");
    router.push(withPortfolioSelection(pathname, params, next));
    setOpen(false);
  }

  if (availableProperties.length <= 1 && !ownerPresets.length && !selection.ownerId) return <span className="scope-picker-single">{portfolioSelectionLabel(selection, selectedCount, availableProperties.length, availableProperties.filter((property) => property.active).length)}</span>;
  return <div className="scope-picker" ref={pickerRef}>
    <button ref={triggerRef} className="scope-picker-trigger" type="button" title="Zobrazené objekty" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}><span><small>Rozsah správy</small><strong>{selection.ownerId ? `${selectedOwner?.name || "Vybraný vlastník"} · ${unitCountLabel(selectedUnitCount)}` : selection.mode === "ALL" ? `Vše ve správě · ${availableProperties.length} objektů` : `${selectedCount} z ${availableProperties.length} objektů`}</strong></span><ChevronDown size={16}/></button>
    {open && createPortal(<div ref={popoverRef} className="scope-picker-popover" style={placement} role="dialog" aria-label="Vybrat zobrazené objekty">
      <div className="scope-actions"><button className="secondary" type="button" onClick={() => close()}>Zrušit změny</button><button className="primary" type="button" onClick={apply}>Použít výběr</button></div>
      <div className="scope-bulk-actions"><button type="button" aria-label="Vybrat vše ve správě" onClick={() => { setDraftOwnerId(undefined); setDraft(availableProperties.map((property) => property.id)); }}>Označit vše</button><button type="button" onClick={() => setDraft([])}>Odznačit vše</button><span aria-live="polite">Vybráno {draft.length} z {availableProperties.length}</span></div>
      <label className="scope-search"><Search size={15}/><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Najít dům nebo vlastníka…" aria-label="Hledat nemovitost nebo vlastníka"/></label>
      <div className="scope-picker-scroll">
      <div className="scope-presets" aria-label="Rychlý výběr rozsahu">
        <p className="muted-copy">Vlastník vybere své jednotky napříč domy. Níže můžete výběr omezit na konkrétní objekty.</p>
        {groupPresets.map((preset) => <button className={`scope-group-preset ${preset.key.toLocaleLowerCase()}`} type="button" onClick={() => { setDraftOwnerId(undefined); setDraft(preset.propertyIds); }} key={preset.key}>{preset.label}<span>{preset.propertyIds.length}</span></button>)}
        <label className="field scope-owner-select"><span>Vlastník jednotek</span><select aria-label="Vlastník jednotek" value={draftOwnerId || ""} onChange={event => { const owner = ownerPresets.find(row => row.id === event.target.value); setDraftOwnerId(owner?.id); setDraft(owner?.propertyIds || availableProperties.map(row => row.id)); setSearch(""); }}><option value="">Všichni vlastníci</option>{ownerPresets.map(owner => <option key={owner.id} value={owner.id}>{owner.name} · {unitCountLabel(owner.unitIds.length)}</option>)}</select></label>
        {ownerPresets.filter(owner => search.trim() ? normalizeSearch(owner.name).includes(normalizeSearch(search.trim())) : favorites.includes(owner.id)).slice(0, 5).map(owner => <button className="scope-owner-preset" type="button" aria-pressed={draftOwnerId === owner.id} onClick={() => { setDraftOwnerId(owner.id); setDraft(owner.propertyIds); setSearch(""); }} key={owner.id}>{favorites.includes(owner.id) && <Star size={13}/>} {owner.name}<span>{unitCountLabel(owner.unitIds.length)}</span></button>)}
        {draftOwnerId && <button className="scope-favorite-toggle" type="button" aria-pressed={favorites.includes(draftOwnerId)} onClick={() => toggleFavorite(draftOwnerId)}><Star size={14}/>{favorites.includes(draftOwnerId) ? "Odebrat z oblíbených" : "Přidat vlastníka do oblíbených"}</button>}
        {draftOwnerId && <button type="button" onClick={() => { setDraftOwnerId(undefined); setDraft(availableProperties.map(property => property.id)); }}>Zrušit filtr vlastníka</button>}
      </div>

      <div className="scope-options">{visible.map((property) => <label key={property.id} className={!property.active ? "archived" : ""}><input type="checkbox" checked={draft.includes(property.id)} onChange={(event) => setDraft(event.target.checked ? [...new Set([...draft, property.id])] : draft.filter((id) => id !== property.id))}/><span><strong>{property.name}</strong><small>{property.ownerName ? `${property.ownerName} · ` : ""}{property.city} · {property.address}{!property.active ? " · Archivováno" : ""}</small></span></label>)}</div>
      {!visible.length && <p>Žádná nemovitost neodpovídá hledání.</p>}
      </div>
    </div>,document.body)}
  </div>;
}
