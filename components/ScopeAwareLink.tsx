"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "flatcloud:property-scope";
const scopedRoots = [
  "/portfolio",
  "/reporty",
  "/ukoly",
  "/revize",
  "/smlouvy",
  "/platby/nesparovane",
  "/platby/nova",
  "/distribuce",
];

function withPropertyScope(href: string, propertyScope: string) {
  if (
    !propertyScope ||
    !scopedRoots.some(
      (root) =>
        href === root ||
        href.startsWith(`${root}?`) ||
        href.startsWith(`${root}/`),
    )
  )
    return href;
  const [pathAndQuery, hash = ""] = href.split("#", 2);
  const [path, query = ""] = pathAndQuery.split("?", 2);
  const params = new URLSearchParams(query);
  if (!params.has("properties")) params.set("properties", propertyScope);
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

  const scopedHref = useMemo(
    () => withPropertyScope(href, currentScope || rememberedScope),
    [href, currentScope, rememberedScope],
  );
  const targetPath = href.split(/[?#]/, 1)[0];
  const shareholderRoots = ["/reporty/akcionarske", "/reporty/kvartalni", "/reporty/vyrocni", "/reporty/rocni-checklist", "/reporty/sablony"];
  const shareholderActive = shareholderRoots.some(root => pathname === root || pathname.startsWith(`${root}/`));
  const financeActive = ["/reporty/predpisy", "/reporty/saldo"].some(root => pathname === root || pathname.startsWith(`${root}/`));
  const pathMatches = targetPath === "/reporty/akcionarske" ? shareholderActive
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
  return (
    <Link
      href={scopedHref}
      aria-current={current ? "page" : undefined}
      {...props}
    >
      {children}
    </Link>
  );
}
