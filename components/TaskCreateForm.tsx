"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Manager = { id: string; name: string };
type Lease = { id: string; tenantId: string; tenantName: string; contractNumber: string | null; status: string };
type Unit = { id: string; label: string; leases: Lease[] };
type PropertyOption = { id: string; name: string; managerId: string | null; managers: Manager[]; units: Unit[] };

export function TaskCreateForm({ properties, initialPropertyId = "", initialLeaseId = "" }: { properties: PropertyOption[]; initialPropertyId?: string; initialLeaseId?: string }) {
  const initialProperty = properties.find((property) => property.id === initialPropertyId) || properties[0];
  const initialLease = initialProperty?.units.flatMap((unit) => unit.leases.map((lease) => ({ ...lease, unitId: unit.id }))).find((lease) => lease.id === initialLeaseId);
  const [propertyId, setPropertyId] = useState(initialProperty?.id || "");
  const [category, setCategory] = useState(initialLeaseId ? "COLLECTION" : "GENERAL");
  const [unitId, setUnitId] = useState(initialLease?.unitId || "");
  const [leaseId, setLeaseId] = useState(initialLeaseId);
  const property = properties.find((item) => item.id === propertyId) || initialProperty;
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

  if (!property) return <div className="card empty-state"><h2>Nemáte nemovitost s právem editace</h2><p>Úkol může založit správce nebo uživatel s právem editace objektu.</p></div>;

  return <form className="card edit-form" action="/api/tasks" method="post">
    <div className="form-grid">
      <label className="field"><span>Nemovitost *</span><select name="propertyId" value={propertyId} onChange={(event) => changeProperty(event.target.value)} required>{properties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field"><span>Kategorie *</span><select name="category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="GENERAL">Obecný úkol</option><option value="MAINTENANCE">Provoz / závada</option><option value="COLLECTION">Vymáhání / upomínka</option><option value="LEASE">Smlouva</option><option value="COMPLIANCE">Revize / kontrola</option></select></label>
      <label className="field field-full"><span>Název *</span><input name="title" required placeholder="Např. Upomínka 8/26 nebo Prověřit zatékání ve 4. NP"/></label>
      <label className="field"><span>Jednotka</span><select name="unitId" value={unitId} onChange={(event) => { setUnitId(event.target.value); setLeaseId(""); }}><option value="">Celý objekt</option>{property.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}</select></label>
      <label className="field"><span>{category === "COLLECTION" ? "Smlouva / nájemník *" : "Smlouva / nájemník"}</span><select name="leaseId" value={leaseId} onChange={(event) => changeLease(event.target.value)} required={category === "COLLECTION"}><option value="">Bez vazby na smlouvu</option>{leases.filter((lease) => !unitId || lease.unitId === unitId).map((lease) => <option key={lease.id} value={lease.id}>{lease.unitLabel} · {lease.tenantName}{lease.contractNumber ? ` · ${lease.contractNumber}` : ""}</option>)}</select>{category === "COLLECTION" && <small>Upomínkový případ musí být navázaný na konkrétní smlouvu, aby ukazoval aktuální dluh a mohl se po úhradě automaticky uzavřít.</small>}</label>
      <input type="hidden" name="tenantId" value={selectedLease?.tenantId || ""}/>
      <label className="field"><span>Priorita</span><select name="priority" defaultValue="NORMAL"><option value="LOW">Nízká</option><option value="NORMAL">Běžná</option><option value="HIGH">Vysoká</option><option value="URGENT">Urgentní</option></select></label>
      <label className="field"><span>Odpovědný</span><select key={property.id} name="assigneeId" defaultValue={property.managerId || ""}><option value="">Nepřiřazen</option>{property.managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select></label>
      <label className="field"><span>Termín</span><input name="dueAt" type="date"/></label>
      <label className="field field-full"><span>Popis / zadání</span><textarea name="description" rows={4} placeholder="Co je potřeba vyřešit, jaký je další krok a případně co už proběhlo."/></label>
    </div>
    <div className="form-actions"><Link className="secondary" href="/ukoly">Zrušit</Link><button className="primary" type="submit">Vytvořit úkol</button></div>
  </form>;
}
