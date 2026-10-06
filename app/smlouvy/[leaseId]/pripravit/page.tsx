import Link from "next/link";
import { notFound } from "next/navigation";
import { contractActor, contractLease, contractPrefill } from "@/lib/lease-contracts/service";
import { ContractBuilder } from "@/components/leases/ContractBuilder";
import { Shell } from "@/components/Shell";
export const dynamic="force-dynamic";
export default async function PrepareContract({params}:{params:Promise<{leaseId:string}>}) {
  const actor=await contractActor();if(!actor)notFound();const {leaseId}=await params,lease=await contractLease(actor,leaseId);if(!lease)notFound();
  const prefill=contractPrefill(lease);
  return <Shell user={actor} taskPropertyId={lease.unit.propertyId} taskLeaseId={lease.id}><div className="page"><div className="breadcrumb"><Link href={`/nemovitosti/${lease.unit.propertyId}/jednotky/${lease.unitId}#dokumenty`}>{lease.unit.property.name} · {lease.unit.label}</Link><span>›</span><span>Příprava smlouvy</span></div><div className="page-title"><div><h1>Připravit nájemní smlouvu</h1><p>{lease.unit.property.name} · {lease.unit.label} · {lease.contractNumber||lease.tenant.name}</p></div><Link className="secondary" href={`/nemovitosti/${lease.unit.propertyId}/jednotky/${lease.unitId}#dokumenty`}>Zpět do jednotky</Link></div>
    {prefill.companyTenant||lease.currency!=="CZK"||lease.unit.type!=="APARTMENT"?<div className="card"><h2>Pro tento vztah připravujeme samostatný vzor</h2><p>Schválená nájemní smlouva je určena pro bydlení fyzických osob s platbami v Kč. Jiný účel, nájem firmě a podnájem mají vlastní varianty; zde lze nadále nahrát vlastní smlouvu do dokumentů.</p><Link href={`/smlouvy/${leaseId}#dokumenty`}>Dokumenty smlouvy</Link></div>:<ContractBuilder landlordSource={prefill.landlordSource}
            leaseId={leaseId} initial={prefill.initial} version={prefill.version}/>}
  </div></Shell>;
}
