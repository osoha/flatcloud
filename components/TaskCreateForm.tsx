"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Manager = { id: string; name: string };
type Person = Manager & { role: string; flatcloudMember: boolean };
type Lease = { id: string; tenantId: string; tenantName: string; contractNumber: string | null; status: string };
type Unit = { id: string; label: string; leases: Lease[] };
type PropertyOption = { id: string; name: string; managerId: string | null; managers: Manager[]; units: Unit[] };

function PersonOptions({people}:{people:Person[]}) {
  const team=people.filter(person=>person.role==="SUPER_ADMIN"||person.flatcloudMember);
  const others=people.filter(person=>person.role!=="SUPER_ADMIN"&&!person.flatcloudMember);
  return <>{team.length>0&&<optgroup label="Tým FlatCloud">{team.map(person=><option value={person.id} key={person.id}>{person.name}</option>)}</optgroup>}{others.length>0&&<optgroup label="Ostatní uživatelé">{others.map(person=><option value={person.id} key={person.id}>{person.name}</option>)}</optgroup>}</>;
}

export function TaskCreateForm({ properties, people = [], allowGeneral = false, initialPropertyId = "", initialLeaseId = "" }: { properties: PropertyOption[]; people?: Person[]; allowGeneral?: boolean; initialPropertyId?: string; initialLeaseId?: string }) {
  const initialProperty = properties.find((property) => property.id === initialPropertyId);
  const initialLease = initialProperty?.units.flatMap((unit) => unit.leases.map((lease) => ({ ...lease, unitId: unit.id }))).find((lease) => lease.id === initialLeaseId);
  const [propertyId, setPropertyId] = useState(initialProperty?.id || "");
  const [category, setCategory] = useState(initialLease ? "COLLECTION" : "GENERAL");
  const [unitId, setUnitId] = useState(initialLease?.unitId || "");
  const [leaseId, setLeaseId] = useState(initialLease?.id || "");
  const property = properties.find((item) => item.id === propertyId);
  const leases = useMemo(() => property?.units.flatMap((unit) => unit.leases.map((lease) => ({ ...lease, unitId: unit.id, unitLabel: unit.label }))) || [], [property]);
  const selectedLease = leases.find((lease) => lease.id === leaseId);

  function changeProperty(next: string) {
    setPropertyId(next);
    setUnitId("");
    setLeaseId("");
  }
  function changeLease(next: string) {
    setLeaseId(next);
    const lease = leases.find((item) => item.id === next);
    if (lease) setUnitId(lease.unitId);
  }

  if (!properties.length && !allowGeneral) return <div className="card empty-state"><h2>Nemáte nemovitost s právem editace</h2><p>Úkol může založit správce nebo uživatel s právem editace objektu.</p></div>;

  return <form className="card edit-form" action="/api/tasks" method="post" encType="multipart/form-data">
    <div className="form-grid">
      <label className="field"><span>Kontext úkolu *</span><select name="propertyId" value={propertyId} onChange={(event) => changeProperty(event.target.value)} required={!allowGeneral}>{allowGeneral&&<option value="">Obecný týmový úkol</option>}{!allowGeneral&&<option value="">Vyberte nemovitost</option>}{properties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{allowGeneral&&<small>Obecné vlákno je dostupné jen výslovně přidaným lidem.</small>}</label>
      <label className="field"><span>Kategorie *</span><select name="category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="GENERAL">Obecný úkol</option><option value="MAINTENANCE">Provoz / závada</option><option value="COLLECTION">Vymáhání / upomínka</option><option value="LEASE">Smlouva</option><option value="COMPLIANCE">Revize / kontrola</option></select></label>
      <label className="field field-full"><span>Název *</span><input name="title" required placeholder="Např. Upomínka 8/26 nebo Prověřit zatékání ve 4. NP"/></label>
      <label className="field"><span>Jednotka</span><select name="unitId" value={unitId} disabled={!property} onChange={(event) => { setUnitId(event.target.value); setLeaseId(""); }}><option value="">{property?"Celý objekt":"Bez vazby"}</option>{property?.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}</select></label>
      <label className="field"><span>{category === "COLLECTION" ? "Smlouva / nájemník *" : "Smlouva / nájemník"}</span><select aria-label={category === "COLLECTION" ? "Smlouva / nájemník *" : "Smlouva / nájemník"} name="leaseId" value={leaseId} onChange={(event) => changeLease(event.target.value)} required={category === "COLLECTION"}><option value="">Bez vazby na smlouvu</option>{leases.filter((lease) => !unitId || lease.unitId === unitId).map((lease) => <option key={lease.id} value={lease.id}>{lease.unitLabel} · {lease.tenantName}{lease.contractNumber ? ` · ${lease.contractNumber}` : ""}</option>)}</select>{category === "COLLECTION" && <small>Upomínkový případ musí být navázaný na konkrétní smlouvu, aby ukazoval aktuální dluh a mohl se po úhradě automaticky uzavřít.</small>}</label>
      <input type="hidden" name="tenantId" value={selectedLease?.tenantId || ""}/>
      <label className="field"><span>Priorita</span><select name="priority" defaultValue="NORMAL"><option value="LOW">Nízká</option><option value="NORMAL">Běžná</option><option value="HIGH">Vysoká</option><option value="URGENT">Urgentní</option></select></label>
      <label className="field"><span>Odpovědný</span><select key={property?.id || "general"} name="assigneeId" defaultValue={property?.managerId || ""} disabled={!property && !allowGeneral}><option value="">Nepřiřazen</option>{property?property.managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>):<PersonOptions people={people}/>}</select></label>
      {allowGeneral&&!property&&<><fieldset className="field field-full announcement-audience task-audience"><legend>Zpřístupnit skupinám</legend><label><input type="checkbox" name="audienceAllUsers"/> Všichni aktivní uživatelé</label><label><input type="checkbox" name="audienceFlatcloudMembers"/> Všichni členové týmu FlatCloud</label><label><input type="checkbox" name="audienceManagers"/> Všichni správci</label><small>Členové vybraných skupin se při založení přidají jako sledující. Nejde o přiřazení odpovědnosti ani o odeslání e-mailu.</small></fieldset><label className="field"><span>Spoluřešitelé</span><select name="collaboratorIds" multiple size={Math.min(7,Math.max(3,people.length))}><PersonOptions people={people}/></select><small>Mohou psát do vlákna a upravovat obecný úkol.</small></label><label className="field"><span>Sledující</span><select name="watcherIds" multiple size={Math.min(7,Math.max(3,people.length))}><PersonOptions people={people}/></select><small>Vidí průběh, ale úkol neupravují.</small></label></>}
      <label className="field"><span>Termín</span><input name="dueAt" type="date"/></label>
      <label className="field field-full"><span>Popis / zadání</span><textarea name="description" rows={4} placeholder="Co je potřeba vyřešit, jaký je další krok a případně co už proběhlo."/></label>
      <label className="field field-full"><span>Přílohy / fotografie</span><input name="files" type="file" multiple/><small>Nejvýše 10 souborů.{property?" Fotografie závady se označí jako stav před opravou.":" Vhodné také pro screenshoty z testování."}</small></label>
    </div>
    <div className="form-actions"><Link className="secondary" href="/ukoly">Zrušit</Link><button className="primary" type="submit">Vytvořit úkol</button></div>
  </form>;
}
