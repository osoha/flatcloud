import Link from "next/link";
import {notFound} from "next/navigation";
import {requireUser} from "@/lib/auth";
import {Shell} from "@/components/Shell";
import {LeaseContractServices} from "@/components/LeaseContractServices";
import {contractPilotData} from "@/lib/lease-contract/data";
const money=(cents:number)=>`${(cents/100).toLocaleString("cs-CZ",{minimumFractionDigits:2,maximumFractionDigits:2})} Kč`;
const rate=(bps:number)=>`${(bps/100).toLocaleString("cs-CZ",{maximumFractionDigits:2})} % ročně`;

export const dynamic="force-dynamic";
export default async function ContractPilotPage({params}:{params:Promise<{leaseId:string}>}) {
  const actor=await requireUser(),{leaseId}=await params;
  const data=await contractPilotData(actor,leaseId); if(!data) notFound();
  const {lease,facts,errors,serviceDefaults}=data;
  const tenant=lease.tenant;
  return <Shell user={actor} taskPropertyId={lease.unit.propertyId}><div className="page">
    <div className="breadcrumb"><Link href={`/smlouvy/${leaseId}`}>{lease.contractNumber}</Link><span>›</span><span>Náhled nájemní smlouvy</span></div>
    <div className="page-title"><div><h1>Náhled nájemní smlouvy</h1><p>Testovací nájem fyzické osoby na dobu určitou do jednoho roku bez indexace.</p></div></div>
    <div className="notice">Náhled se neukládá k nájmu ani neposílá k podpisu. Vydané dokumenty zůstávají zachované.</div>
    <section className="card"><h2>Údaje převzaté z evidence</h2><div className="summary-list">
      {[['Nájemce',facts.tenantName],['Byt',`${facts.unitLabel} · ${facts.unitAddress}`],['Doba',`${facts.startDate} – ${facts.endDate||'neurčeno'}`],['Nájemné',money(facts.rentCents)],['Zálohy',money(facts.servicesCents)],['Celkem',money(facts.rentCents+facts.servicesCents)],['Jistota',money(facts.depositCents)],['Úrok jistoty',facts.depositCents===0 ? 'Jistota se nesjednává' : facts.depositRateBps===null ? 'Nenastaven' : rate(facts.depositRateBps)]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </div></section>
    {errors.length ? <section className="card"><h2>Před náhledem doplňte evidenci</h2><ul>{errors.map(x=><li key={x}>{x}</li>)}</ul><Link className="secondary" href={`/smlouvy/${leaseId}`}>Zpět ke smlouvě</Link></section> :
    <form className="card form-stack" action={`/api/leases/${leaseId}/contract-preview`} method="post" target="_blank">
      <h2>Pronajímatel a zastoupení</h2><p>Pronajímatele a jeho zastoupení potvrďte podle podkladů. Příjemce bankovní platby jej automaticky neurčuje.</p>
      <div className="form-grid"><Field name="landlordName" label="Jméno nebo název pronajímatele"/>
      <label className="field"><span>Typ pronajímatele</span><select name="landlordKind"><option value="PERSON">Fyzická osoba</option><option value="COMPANY">Společnost</option></select></label>
      <Field name="landlordId" label="Datum narození nebo IČO pronajímatele"/><Field name="landlordAddress" label="Adresa pronajímatele"/>
      <Field name="landlordEmail" label="E-mail pronajímatele"/><Field name="landlordPhone" label="Telefon pronajímatele"/>
      <Field name="representative" label="Podepisující osoba a oprávnění"/><Field name="landlordRegistration" label="Zápis společnosti a způsob jednání" required={false}/></div>
      <h2>Provozní správce</h2><p>Pokud není sjednán, ponechte všechna tři pole prázdná.</p><div className="form-grid"><Field name="managerName" label="Správce" required={false}/><Field name="managerEmail" label="E-mail správce" required={false}/><Field name="managerPhone" label="Telefon správce" required={false}/></div>
      <h2>Kontakty nájemce</h2><div className="form-grid"><Field name="tenantAddress" label="Bydliště nájemce" defaultValue={tenant.permanentAddress||tenant.address||""}/><Field name="tenantDeliveryAddress" label="Doručovací adresa nájemce" defaultValue={tenant.correspondenceAddress||""}/><Field name="tenantEmail" label="E-mail nájemce" defaultValue={tenant.communicationEmail||tenant.email||""}/><Field name="tenantPhone" label="Telefon nájemce" defaultValue={tenant.phone||""}/></div>
      <h2>Byt a předání</h2><div className="form-grid"><Field name="floor" label="Podlaží a umístění" defaultValue={lease.unit.floor||""}/><Field name="disposition" label="Dispozice" defaultValue={lease.unit.dispositionCustom||""}/><Field name="cadastralId" label="Katastrální identifikace a LV"/><Field name="accessories" label="Příslušenství a rozsah užívání"/><Field name="handoverDate" label="Datum předání" type="date"/></div>
      <h2>Platby a služby</h2><div className="form-grid"><Field name="firstPaymentDate" label="Splatnost první platby" type="date"/>{facts.depositCents>0 ? <Field name="depositDueDate" label="Splatnost jistoty" type="date"/> : <input type="hidden" name="depositDueDate" value=""/>}<Field name="directEnergy" label="Energie přímo na nájemce"/><Field name="peopleCount" label="Počet osob při zahájení" type="number"/></div>
      <LeaseContractServices defaults={serviceDefaults}/>
      <h2>Podpisy a přílohy</h2><div className="form-grid"><Field name="attachments" label="Skutečně připojené přílohy (nebo Žádné)"/><Field name="signingPlace" label="Místo podpisu"/><Field name="signingDate" label="Datum podpisu" type="date"/></div>
      <label className="checkbox-field"><input name="confirmedTestRecord" type="checkbox" required/>Ověřil/a jsem, že jde výhradně o testovací záznam a doplněné údaje odpovídají podkladům.</label>
      <button className="primary">Vytvořit náhled kompletní smlouvy PDF</button>
    </form>}
  </div></Shell>;
}
function Field({name,label,type="text",defaultValue,required=true}:{name:string;label:string;type?:string;defaultValue?:string;required?:boolean}) {return <label className="field"><span>{label}</span><input name={name} type={type} defaultValue={defaultValue} required={required} maxLength={300} min={type==="number"?1:undefined} max={type==="number"?50:undefined}/></label>}
