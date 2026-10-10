"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const OWNER_STORAGE_KEY = "flatberry:owner-scope";
const STORAGE_KEY = "flatcloud:property-scope";
const scopedRoots = [
  "/portfolio",
  "/dokumenty",
  "/reporty",
  "/ukoly",
  "/revize",
  "/smlouvy",
  "/platby/banka",
  "/platby/nesparovane",
  "/platby/nova",
  "/distribuce",
];

function withPropertyScope(href: string, propertyScope: string | null, ownerScope: string | null) {
  if (
    (propertyScope === null && ownerScope === null) ||
    !scopedRoots.some(
      (root) =>
        href === root ||
        href.startsWith(`${root}?`) ||
        href.startsWith(`${root}#`) ||
        href.startsWith(`${root}/`),
    )
  )
    return href;
  const [pathAndQuery, hash = ""] = href.split("#", 2);
  const [path, query = ""] = pathAndQuery.split("?", 2);
  const params = new URLSearchParams(query);
  if (propertyScope !== null && !params.has("properties") && !params.has("propertyId")) params.set("properties", propertyScope);
  if (ownerScope && !params.has("ownerId")) params.set("ownerId", ownerScope);
  return `${path}?${params.toString()}${hash ? `#${hash}` : ""}`;
}

export function ScopeAwareLink({
  href,
  children,
  activeQuery,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href"> & {
  href: string;
  activeQuery?: Record<string, string>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentOwner = searchParams.get("ownerId");
  const [rememberedOwner, setRememberedOwner] = useState(currentOwner);
  const currentScope = searchParams.get("properties") ?? searchParams.get("propertyId");
  const [rememberedScope, setRememberedScope] = useState(currentScope);

  useEffect(() => {
    if (currentScope !== null) {
      window.sessionStorage.setItem(STORAGE_KEY, currentScope);
      setRememberedScope(currentScope);
    } else if (scopedRoots.includes(pathname)) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      setRememberedScope(null);
    } else {
      setRememberedScope(window.sessionStorage.getItem(STORAGE_KEY));
    }
  }, [currentScope, pathname]);

  useEffect(() => {
    if (currentOwner) { window.sessionStorage.setItem(OWNER_STORAGE_KEY, currentOwner); setRememberedOwner(currentOwner); }
    else if (scopedRoots.includes(pathname)) { window.sessionStorage.removeItem(OWNER_STORAGE_KEY); setRememberedOwner(null); }
    else setRememberedOwner(window.sessionStorage.getItem(OWNER_STORAGE_KEY));
  }, [currentOwner, pathname]);

  const scopedHref = useMemo(
    () => withPropertyScope(href, scopedRoots.includes(pathname) ? currentScope : currentScope ?? rememberedScope, scopedRoots.includes(pathname) ? currentOwner : currentOwner ?? rememberedOwner),
    [href, currentScope, rememberedScope, currentOwner, rememberedOwner, pathname],
  );
  const targetPath = href.split(/[?#]/, 1)[0];
  const shareholderRoots = ["/reporty/akcionarske", "/reporty/kvartalni", "/reporty/vyrocni", "/reporty/rocni-checklist", "/reporty/sablony"];
  const shareholderActive = shareholderRoots.some(root => pathname === root || pathname.startsWith(`${root}/`));
  const financeActive = ["/reporty/predpisy", "/reporty/saldo"].some(root => pathname === root || pathname.startsWith(`${root}/`));
  const pathMatches = targetPath === "/distribuce" ? (pathname === targetPath || pathname.startsWith(`${targetPath}/`)) && !pathname.startsWith("/distribuce/zajemci")
    : targetPath === "/reporty/akcionarske" ? shareholderActive
    : targetPath === "/reporty" ? (pathname === targetPath || pathname.startsWith(`${targetPath}/`)) && !shareholderActive && !financeActive
    : targetPath === pathname || (targetPath !== "/portfolio" && pathname.startsWith(`${targetPath}/`));
  const queryMatches =
    !activeQuery ||
    Object.entries(activeQuery).every(([key, value]) => {
      const currentValue =
        searchParams.get(key) ??
        (pathname === "/metodika" && key === "view" ? "guides" : null);
      return currentValue === value;
    });
  const current = pathMatches && queryMatches;
  // Styled page tabs already declare their selected category with .active.
  // Inactive undefined props can disappear across a server/client boundary;
  // falling back to the path would mark every query-based tab as current.
  const selected = props.className !== undefined
    ? props.className.split(/\s+/).includes("active")
    : current;
  const ariaCurrent = props["aria-current"] ?? (selected ? "page" : undefined);
  return (
    <Link
      href={scopedHref}
      {...props}
      aria-current={ariaCurrent}
    >
      {children}
    </Link>
  );
}
