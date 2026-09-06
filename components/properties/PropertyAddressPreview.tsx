"use client";

import { ExternalLink, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { propertyAddressLabel, propertyMapEmbedUrl, propertyMapSearchUrl, type PropertyAddress } from "@/lib/property-map";

const emptyAddress: PropertyAddress = { address: "", city: "", postalCode: "" };

export function PropertyAddressPreview() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [address, setAddress] = useState<PropertyAddress>(emptyAddress);

  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form) return;
    let timer = 0;
    const readAddress = () => {
      const value = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | null)?.value || "";
      setAddress({ address: value("address"), city: value("city"), postalCode: value("postalCode") });
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(readAddress, 450);
    };
    readAddress();
    form.addEventListener("input", schedule);
    form.addEventListener("change", schedule);
    window.addEventListener("pageshow", schedule);
    return () => {
      window.clearTimeout(timer);
      form.removeEventListener("input", schedule);
      form.removeEventListener("change", schedule);
      window.removeEventListener("pageshow", schedule);
    };
  }, []);

  const complete = Boolean(address.address.trim() && address.city.trim());
  const label = propertyAddressLabel(address);
  return <div className="property-address-preview field-full" ref={rootRef}>
    <div className="property-address-preview-copy">
      <span><MapPin size={15}/> Kontrola polohy</span>
      {complete ? <><strong>{label}</strong><small>Ověřte, že PIN odpovídá zamýšlenému objektu. Mapa je orientační a adresu sama nemění.</small><a href={propertyMapSearchUrl(address)} target="_blank" rel="noreferrer">Otevřít větší mapu <ExternalLink size={12}/></a></> : <><strong>Doplňte ulici a město</strong><small>Po vyplnění adresy se zde zobrazí orientační poloha nemovitosti.</small></>}
    </div>
    <div className={`property-address-map ${complete ? "ready" : "empty"}`}>
      {complete ? <iframe src={propertyMapEmbedUrl(address)} title={`Mapa nemovitosti: ${label}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade"/> : <MapPin aria-hidden="true"/>}
    </div>
  </div>;
}
