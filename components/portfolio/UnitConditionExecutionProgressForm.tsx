import { dateInput, moneyInput } from "@/lib/forms";

export function UnitConditionExecutionProgressForm({ propertyId, unitId, executionId, state, plannedAmountCents, returnTo }: { propertyId: string; unitId: string; executionId: string; state: "READY" | "STARTED"; plannedAmountCents: number; returnTo: string }) {
  const action = `/api/properties/${propertyId}/units/${unitId}/condition-executions/${executionId}`;
  if (state === "READY") return <form className="condition-execution-progress-form" action={action} method="post">
    <input type="hidden" name="returnTo" value={returnTo}/><input type="hidden" name="action" value="START"/>
    <label className="field"><span>Datum zahájení *</span><input type="date" name="effectiveAt" max={dateInput(new Date())} defaultValue={dateInput(new Date())} required/></label>
    <label className="field"><span>Poznámka</span><textarea name="note" rows={2} maxLength={2000} placeholder="Dodavatel, rozsah nebo první krok…"/></label>
    <button className="primary" type="submit">Zahájit realizaci</button>
  </form>;
  return <form className="condition-execution-progress-form" action={action} method="post">
    <input type="hidden" name="returnTo" value={returnTo}/><input type="hidden" name="action" value="COMPLETE"/>
    <label className="field"><span>Skutečný CAPEX Kč *</span><input type="number" name="actualAmount" min="0.01" step="0.01" defaultValue={moneyInput(plannedAmountCents)} required/></label>
    <label className="field"><span>Datum dokončení *</span><input type="date" name="effectiveAt" max={dateInput(new Date())} defaultValue={dateInput(new Date())} required/></label>
    <label className="field"><span>Závěrečná poznámka</span><textarea name="note" rows={2} maxLength={2000} placeholder="Rozsah dokončených prací a případná odchylka…"/></label>
    <button className="primary" type="submit">Dokončit a zapsat skutečnost</button>
  </form>;
}
