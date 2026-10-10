"use client";
import { useEffect, useState } from "react";

type Option = [string, string];
export function useLeaseTenantDirectory({ propertyId, initialOptions, scope, q, free, startDate, endDate, excludeLeaseId, selected, onKnown }: { propertyId?: string; initialOptions: Option[]; scope: string; q: string; free: boolean; startDate: string; endDate: string; excludeLeaseId?: string; selected: string; onKnown: (options: Option[], accounts: Record<string, string[]>) => void }) {
  const [options, setOptions] = useState(initialOptions);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const filterKey = [scope, q, free, startDate, endDate, excludeLeaseId].join("|");
  const [previousFilter, setPreviousFilter] = useState(filterKey);
  if (previousFilter !== filterKey) { setPreviousFilter(filterKey); setPage(1); }
  useEffect(() => {
    if (!propertyId) { setOptions(initialOptions); return; }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = window.setTimeout(async () => {
      const query = new URLSearchParams({ scope, q, page: String(page), selected });
      if (free) query.set("free", "1");
      if (startDate) query.set("startDate", startDate);
      if (endDate) query.set("endDate", endDate);
      if (excludeLeaseId) query.set("excludeLeaseId", excludeLeaseId);
      try {
        const response = await fetch(`/api/properties/${propertyId}/lease-tenants?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json() as { options: Option[]; selected: Option[]; accounts: Record<string, string[]>; hasMore: boolean };
        if (controller.signal.aborted) return;
        setOptions(data.options);
        setHasMore(data.hasMore);
        onKnown([...data.options, ...data.selected], data.accounts);
      } catch (error) { if (!controller.signal.aborted) { setOptions([]); setHasMore(false); setError(error instanceof Error ? error.message : "Nájemníky se nepodařilo načíst."); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [propertyId, initialOptions, scope, q, free, startDate, endDate, excludeLeaseId, selected, page, revision, onKnown]);
  return { options, page, setPage, hasMore, loading, error, refresh: () => setRevision(value => value + 1) };
}
