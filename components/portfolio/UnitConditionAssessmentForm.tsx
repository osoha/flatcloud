import type { UnitConditionPlanStatus, UnitInvestmentUrgency, UnitQualityRating } from "@prisma/client";
import { dateInput, moneyInput } from "@/lib/forms";
import { unitConditionPlanStatuses, unitConditionRatings, unitConditionUrgencies } from "@/lib/portfolio/unit-condition-assessments";

type CurrentAssessment = {
  rating: UnitQualityRating;
  investmentUrgency: UnitInvestmentUrgency;
  estimatedCapexCents: number;
  planStatus: UnitConditionPlanStatus;
  targetDate: Date | null;
  note: string | null;
};

export function UnitConditionAssessmentForm({ propertyId, unitId, returnTo, assessment }: { propertyId: string; unitId: string; returnTo: string; assessment?: CurrentAssessment }) {
  return <form action={`/api/properties/${propertyId}/units/${unitId}/condition-assessments`} method="post"><input type="hidden" name="returnTo" value={returnTo}/><label className="field"><span>Kvalita jednotky *</span><select name="rating" defaultValue={assessment?.rating || "B_GOOD"}>{Object.entries(unitConditionRatings).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="field"><span>Naléhavost investice *</span><select name="investmentUrgency" defaultValue={assessment?.investmentUrgency || "MONITOR"}>{Object.entries(unitConditionUrgencies).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="field"><span>Stav plánu obnovy *</span><select name="planStatus" defaultValue={assessment?.planStatus || "MONITORING"}>{Object.entries(unitConditionPlanStatuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="field"><span>Odhad CAPEX Kč</span><input type="number" name="estimatedCapex" min="0" step="0.01" defaultValue={moneyInput(assessment?.estimatedCapexCents)}/></label><label className="field"><span>Cílový termín</span><input type="date" name="targetDate" defaultValue={dateInput(assessment?.targetDate)}/><small>Povinný pro plánovanou, schválenou nebo probíhající obnovu.</small></label><label className="field"><span>Datum hodnocení *</span><input type="date" name="assessedAt" max={dateInput(new Date())} defaultValue={dateInput(new Date())} required/></label><label className="field"><span>Poznámka / rozsah</span><textarea name="note" rows={3} maxLength={2000} defaultValue={assessment?.note || ""}/></label><button className="primary" type="submit">Uložit nový snapshot</button></form>;
}
