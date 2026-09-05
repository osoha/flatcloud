"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "flatcloud:property-scope";
const scopedRoots = ["/portfolio", "/reporty", "/ukoly", "/revize", "/smlouvy", "/platby/nesparovane"];

function withPropertyScope(href: string, propertyScope: string) {
  if (!propertyScope || !scopedRoots.some((root) => href === root || href.startsWith(`${root}?`) || href.startsWith(`${root}/`))) return href;
  const [pathAndQuery, hash = ""] = href.split("#", 2);
  const [path, query = ""] = pathAndQuery.split("?", 2);
  const params = new URLSearchParams(query);
  if (!params.has("properties")) params.set("properties", propertyScope);
  return `${path}?${params.toString()}${hash ? `#${hash}` : ""}`;
}

export function ScopeAwareLink({ href, children, ...props }: Omit<React.ComponentProps<typeof Link>, "href"> & { href: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentScope = searchParams.get("properties") || "";
  const [rememberedScope, setRememberedScope] = useState(currentScope);

  useEffect(() => {
    if (currentScope) {
      window.sessionStorage.setItem(STORAGE_KEY, currentScope);
      setRememberedScope(currentScope);
    } else if (pathname === "/portfolio" || pathname === "/reporty") {
      window.sessionStorage.removeItem(STORAGE_KEY);
      setRememberedScope("");
    } else {
      setRememberedScope(window.sessionStorage.getItem(STORAGE_KEY) || "");
    }
  }, [currentScope, pathname]);

  const scopedHref = useMemo(() => withPropertyScope(href, currentScope || rememberedScope), [href, currentScope, rememberedScope]);
  const targetPath = href.split(/[?#]/, 1)[0];
  const current = targetPath === pathname || (targetPath !== "/portfolio" && pathname.startsWith(`${targetPath}/`));
  return <Link href={scopedHref} aria-current={current ? "page" : undefined} {...props}>{children}</Link>;
}
