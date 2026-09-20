import { businessDateKey } from "@/lib/calendar";
export type ConsumptionReading = { id: string; readAt: Date; value: number; method?: string; unitOfMeasure?: string | null; correctsId?: string | null; leaseId?: string | null };
export type ConsumptionTariff = { validFrom: Date; priceCentsPerUnit: number; monthlyAdvanceCents: number; unitOfMeasure: string };
const day = (date: Date) => Date.parse(`${businessDateKey(date)}T00:00:00Z`);
export function meterConsumption(readings: ConsumptionReading[], tariffs: ConsumptionTariff[], unit: string, leaseBoundaries: Date[] = []) {
  const corrected = new Set(readings.flatMap(row => row.correctsId ? [row.correctsId] : []));
  const rows = readings.filter(row => !corrected.has(row.id)).sort((a,b) => day(a.readAt)-day(b.readAt));
  const prices = tariffs.filter(row => row.unitOfMeasure === unit).sort((a,b) => day(a.validFrom)-day(b.validFrom));
  return rows.slice(1).map((end,index) => {
    const start = rows[index], from = day(start.readAt), to = day(end.readAt), days = (to-from)/86400000, quantity = end.value-start.value;
    const boundary = leaseBoundaries.some(date => day(date)>from && day(date)<to) || Boolean(start.leaseId && end.leaseId && start.leaseId!==end.leaseId);
    const reason = days<=0 ? "Odečty jsou ve stejný den" : quantity<0 ? "Výměna nebo vynulování měřidla" : [start,end].some(r=>r.unitOfMeasure && r.unitOfMeasure!==unit) ? "Rozdílná měrná jednotka" : boundary ? "Období zahrnuje změnu nájemníka; doplňte předávací odečet" : null;
    const daily = reason ? null : quantity/days;
    let cost: number | null = daily === null ? null : 0;
    const cuts = [from,...prices.map(p=>day(p.validFrom)).filter(d=>d>from&&d<to),to];
    for(let i=1;i<cuts.length && cost!==null;i++) {
      const price = prices.filter(p=>day(p.validFrom)<=cuts[i-1]).at(-1);
      if(!price) {cost=null;break;}
      cost += (cuts[i]-cuts[i-1])/86400000*daily!*price.priceCentsPerUnit;
    }
    const lastPrice = prices.filter(p=>day(p.validFrom)<=to).at(-1);
    return { id:end.id, from:start.readAt, to:end.readAt, days, quantity:reason?null:quantity, daily, estimatedReading:[start,end].some(r=>r.method==="ESTIMATE"), reason, estimatedCostCents:cost===null?null:Math.round(cost), monthlyCostCents:daily!==null&&lastPrice?Math.round(daily*365.25/12*lastPrice.priceCentsPerUnit):null, monthlyAdvanceCents:lastPrice?.monthlyAdvanceCents ?? null };
  });
}
