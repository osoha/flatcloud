export type AllocationBasisRow={id:string;basis:number};
export type AllocationResult={id:string;basis:number;shareBasisPoints:number;amountCents:number};

export function allocateCents(totalCents:number, rows:AllocationBasisRow[]):AllocationResult[] {
  if(!Number.isSafeInteger(totalCents)) throw new Error("Částka rozúčtování musí být v celých haléřích.");
  if(!rows.length) throw new Error("Chybí jednotky pro rozúčtování.");
  if(rows.some(r=>!Number.isFinite(r.basis)||r.basis<0)) throw new Error("Rozúčtovací základ musí být nezáporný.");
  const totalBasis=rows.reduce((s,r)=>s+r.basis,0);
  if(totalBasis<=0) throw new Error("Součet rozúčtovacího základu musí být kladný.");
  const exact=rows.map(r=>({id:r.id,basis:r.basis,raw:totalCents*r.basis/totalBasis}));
  const base=exact.map(r=>({...r,amountCents:totalCents>=0?Math.floor(r.raw):Math.ceil(r.raw)}));
  let remainder=totalCents-base.reduce((s,r)=>s+r.amountCents,0);
  const order=[...base].sort((a,b)=>totalCents>=0?(b.raw-Math.floor(b.raw))-(a.raw-Math.floor(a.raw)):(Math.ceil(a.raw)-a.raw)-(Math.ceil(b.raw)-b.raw)||a.id.localeCompare(b.id));
  for(let i=0;remainder!==0;i=(i+1)%order.length){order[i].amountCents+=remainder>0?1:-1;remainder+=remainder>0?-1:1;}
  const amounts=new Map(order.map(r=>[r.id,r.amountCents]));
  return rows.map(r=>({id:r.id,basis:r.basis,shareBasisPoints:Math.round(r.basis/totalBasis*10000),amountCents:amounts.get(r.id)!}));
}

export function overlapDays(from:Date,to:Date,validFrom:Date,validTo?:Date|null){
  const start=Math.max(from.getTime(),validFrom.getTime()),end=Math.min(to.getTime(),(validTo??to).getTime());
  return end<start?0:Math.floor((end-start)/86400000)+1;
}
export function personDays(from:Date,to:Date,periods:Array<{validFrom:Date;validTo?:Date|null;personCount:number}>){
  return periods.reduce((sum,p)=>sum+overlapDays(from,to,p.validFrom,p.validTo)*p.personCount,0);
}
export function weightedAreaDays(from:Date,to:Date,periods:Array<{validFrom:Date;validTo?:Date|null;areaM2:number}>){
  return periods.reduce((sum,p)=>sum+overlapDays(from,to,p.validFrom,p.validTo)*p.areaM2,0);
}
export function meterLoss(mainConsumption:number,subConsumptions:number[]){
  if(!Number.isFinite(mainConsumption)||mainConsumption<0||subConsumptions.some(v=>!Number.isFinite(v)||v<0))throw new Error("Spotřeby musí být nezáporné.");
  const subTotal=subConsumptions.reduce((a,b)=>a+b,0),difference=mainConsumption-subTotal;
  return {mainConsumption,subTotal,difference,lossPercent:mainConsumption===0?null:difference/mainConsumption*100,valid:difference>=-1e-9};
}
