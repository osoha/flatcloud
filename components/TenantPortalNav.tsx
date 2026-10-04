"use client";
import {useEffect,useState} from "react";
import {House,CreditCard,Wrench,Droplets,FileText,Phone} from "lucide-react";
export function TenantPortalNav({leaseId,canAct}:{leaseId?:string;canAct:boolean}) {
  const [active,setActive]=useState("domov");
  const entries=[{id:"domov",label:"Můj domov",Icon:House},...(leaseId?[{id:`historie-${leaseId}`,label:"Platby",Icon:CreditCard},...(canAct?[{id:`zavady-${leaseId}`,label:"Požadavky",Icon:Wrench},{id:`odecty-${leaseId}`,label:"Odečty",Icon:Droplets},{id:`dokumenty-${leaseId}`,label:"Dokumenty",Icon:FileText}]:[]),{id:`kontakt-${leaseId}`,label:"Kontakt",Icon:Phone}]:[])];
  useEffect(()=>{const sync=()=>{const hash=location.hash.slice(1)||"domov";setActive(hash.startsWith("platba-")?hash.replace("platba-","historie-"):hash);};sync();window.addEventListener("hashchange",sync);return()=>window.removeEventListener("hashchange",sync);},[]);
  return <nav className="tenant-portal-nav" aria-label="Portál nájemníka">{entries.map(({id,label,Icon})=><a key={id} href={`#${id}`} aria-current={active===id?"location":undefined} onClick={()=>setActive(id)}><Icon size={21} aria-hidden="true"/><span>{label}</span></a>)}</nav>;
}
