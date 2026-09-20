"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Keep the selected tab visible after navigation, without moving the document vertically. */
export function ActiveTabVisibility() {
  const pathname = usePathname(), search = useSearchParams();
  useEffect(() => {
    const rows = document.querySelectorAll<HTMLElement>(".flatberry-shell :is(.section-nav,.unit-tabs,.report-tabs,.registry-tabs,.admin-subnav,.quality-subnav)");
    for (const row of rows) {
      const active = row.querySelector<HTMLElement>("a.active,a[aria-current='page']");
      if (!active || row.scrollWidth <= row.clientWidth) continue;
      const tab = active.getBoundingClientRect(), bounds = row.getBoundingClientRect();
      if (tab.right > bounds.right - 14) row.scrollLeft += tab.right - bounds.right + 14;
      else if (tab.left < bounds.left + 14) row.scrollLeft -= bounds.left - tab.left + 14;
    }
  }, [pathname, search]);
  return null;
}
