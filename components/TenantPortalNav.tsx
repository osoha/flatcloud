"use client";

import {useEffect, useState} from "react";
import {Bell, CreditCard, Droplets, FileText, House, Phone, Wrench} from "lucide-react";

export function TenantPortalNav({leaseId, canAct}: {leaseId?: string; canAct: boolean}) {
  const [active, setActive] = useState("prehled");
  const entries = [{id: "prehled", label: "Přehled", Icon: House}, ...(leaseId ? [
    {id: `najem-${leaseId}`, label: "Můj nájem", Icon: CreditCard},
    ...(canAct ? [
      {id: `zpravy-${leaseId}`, label: "Zprávy a úkoly", Icon: Bell},
      {id: `zavady-${leaseId}`, label: "Požadavky", Icon: Wrench},
      {id: `odecty-${leaseId}`, label: "Měřidla", Icon: Droplets},
      {id: `dokumenty-${leaseId}`, label: "Dokumenty", Icon: FileText},
    ] : []),
    {id: `kontakt-${leaseId}`, label: "Kontakt", Icon: Phone},
  ] : [])];
  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash.slice(1) || "prehled";
      if (hash.startsWith("historie-") || hash.startsWith("platba-")) setActive(`najem-${leaseId}`);
      else if (hash.startsWith("domov-")) setActive("prehled");
      else setActive(hash);
    };
    sync(); window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [leaseId]);
  return <nav className="tp-nav" aria-label="Portál nájemníka">{entries.map(({id, label, Icon}) => <a key={id} href={`#${id}`} aria-current={active === id || active.startsWith(`${id}-`) ? "location" : undefined} onClick={() => setActive(id)}><Icon size={21} aria-hidden="true"/><span>{label}</span></a>)}</nav>;
}
