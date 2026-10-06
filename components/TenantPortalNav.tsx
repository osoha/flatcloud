"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {
  Bell,
  CreditCard,
  Droplets,
  FileText,
  House,
  Phone,
  Wrench,
  UserRound,
  FileCheck2,
} from "lucide-react";
import { UserAvatar } from "./UserAvatar";

export function TenantPortalNav({
  leaseId,
  canAct,
  portalHref = "",
  accountHref = "/portal/najemnik/ucet",
  user,
  preview = false,
  actions = false,
}: {
  leaseId?: string;
  canAct: boolean;
  portalHref?: string;
  accountHref?: string;
  user?: { id?: string; name: string; avatarChoice?: string | null };
  preview?: boolean;
  actions?: boolean;
}) {
  const pathname=usePathname();
  const [active, setActive] = useState("prehled");
  const entries = [
    { id: "prehled", label: "Přehled", Icon: House },
    ...(leaseId
      ? [
          { id: `najem-${leaseId}`, label: "Můj nájem", Icon: CreditCard },
          ...(canAct
            ? [
                {
                  id: `zpravy-${leaseId}`,
                  label: "Zprávy a úkoly",
                  Icon: Bell,
                },
                { id: `zavady-${leaseId}`, label: "Požadavky", Icon: Wrench },
                { id: `odecty-${leaseId}`, label: "Měřidla", Icon: Droplets },
                {
                  id: `dokumenty-${leaseId}`,
                  label: "Dokumenty",
                  Icon: FileText,
                },
              ]
            : []),
          { id: `kontakt-${leaseId}`, label: "Kontakt", Icon: Phone },
        ]
      : []),
  ];
  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash.slice(1) || "prehled";
      if (hash.startsWith("historie-") || hash.startsWith("platba-"))
        setActive(`najem-${leaseId}`);
      else if (hash.startsWith("domov-")) setActive("prehled");
      else setActive(hash);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [leaseId]);
  return (
    <nav className="tp-nav" aria-label="Portál nájemníka">
      {entries.map(({ id, label, Icon }) => (
        <a
          key={id}
          href={`${portalHref}#${id}`}
          aria-current={
            !portalHref && (active === id || active.startsWith(`${id}-`))
              ? "location"
              : undefined
          }
          onClick={() => setActive(id)}
        >
          <Icon size={21} aria-hidden="true" />
          <span>{label}</span>
        </a>
      ))}
      {actions && !preview && (
        <Link href="/portal/najemnik/potvrzeni">
          <FileCheck2 size={21} />
          <span>Podpisy a potvrzení</span>
        </Link>
      )}
      {user && (
        <div className="tp-user-panel">
          <Link
            className="tp-user-profile"
            href={accountHref}
            aria-label={preview ? "Můj účet nájemníka – náhled" : "Můj účet"}
          >
            <UserAvatar user={user} />
            <span>
              <strong>{user.name}</strong>
              <small>Nájemník{preview ? " · náhled" : ""}</small>
            </span>
          </Link>
          <Link href={accountHref} aria-current={pathname==="/portal/najemnik/ucet"?"page":undefined}>
            <UserRound size={21} />
            <span>Můj účet</span>
          </Link>
        </div>
      )}
    </nav>
  );
}
