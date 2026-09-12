import { currentUser, hasAllPropertyAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
export async function OwnershipHistory({propertyId, unitId}: {propertyId:string;unitId?:string}) {
  const viewer = await currentUser();
  const canCorrect = !!viewer && hasAllPropertyAccess(viewer);
  const [periods,events] = await Promise.all([
    prisma.ownershipPeriod.findMany({where:{propertyId,unitId:unitId||null},include:{owner:true,confirmedBy:{select:{name:true}}},orderBy:[{validFrom:"desc"},{id:"desc"}]}),
    prisma.auditLog.findMany({where:{propertyId,entityType:unitId?"Unit":"Property",entityId:unitId||propertyId,action:{in:["OWNERSHIP_TRANSFER_CONFIRMED","OWNERSHIP_PAYMENT_RECIPIENT_CONFIRMED","OWNERSHIP_PERIOD_CORRECTED"]}},include:{user:{select:{name:true}}},orderBy:[{createdAt:"desc"},{id:"desc"}]})
  ]);
  const date=(d:Date)=>d.toLocaleDateString("cs-CZ",{timeZone:"Europe/Prague"});
  return <section className="card ownership-history"><h2>Historie vlastnictví</h2>
    <p className="muted-copy">Historie zůstává dostupná i po archivaci. Podklady a přístupy se převodem automaticky nemění.</p>
    {periods.length ? <ul>{periods.map(p=><li key={p.id}><strong>{p.owner.name}</strong> · {p.shareBasisPoints/100} % · {date(p.validFrom)} – {p.validTo?date(p.validTo):"dosud"}<p>{p.sourceNote} · Potvrdil {p.confirmedBy.name}</p>{canCorrect && <details><summary>Opravit doložené období</summary><form className="compact-form" action="/api/reports/annual-owner-package/evidence" method="post"><input type="hidden" name="mode" value="ownership-correct"/><input type="hidden" name="periodId" value={p.id}/><input type="hidden" name="expectedUpdatedAt" value={p.updatedAt.toISOString()}/><input type="hidden" name="returnOwnerId" value={p.ownerId}/><label className="field"><span>Účinné od</span><input name="validFrom" type="date" defaultValue={p.validFrom.toISOString().slice(0,10)} required/></label>{p.validTo&&<label className="field"><span>Účinné do</span><input name="validTo" type="date" defaultValue={p.validTo.toISOString().slice(0,10)} required/></label>}<label className="field"><span>Důvod opravy</span><textarea name="reason" required/></label><label className="checkbox-field"><input name="confirm" type="checkbox" required/><span>Potvrzuji opravu; původní hodnoty zůstanou v auditu.</span></label><button className="secondary" type="submit">Uložit dohledatelnou opravu</button></form></details>}</li>)}</ul>:<p>Datum počátku vlastnictví zatím není doloženo.</p>}
    <h3>Potvrzené změny</h3>
    {events.length ? <ul>{events.map(event=>{const d=event.details as Prisma.JsonObject;return <li key={event.id}><strong>{event.action==="OWNERSHIP_TRANSFER_CONFIRMED"?"Převod vlastníka":event.action==="OWNERSHIP_PERIOD_CORRECTED"?"Oprava období":"Změna příjemce plateb"}</strong> · {date(event.createdAt)} · {event.user?.name||"Autor evidován v auditu"}<p>{String(d.reason||"")}</p><small>Účinnost: {typeof d.effectiveAt==="string"?date(new Date(d.effectiveAt)):"—"} · Audit: {event.id}</small>{canCorrect&&<details><summary>Původní a nový stav auditu</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(event.details,null,2)}</pre></details>}</li>})}</ul>:<p>Žádná potvrzená změna.</p>}
  </section>;
}
