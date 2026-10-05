"use client";
import {useState} from "react";
export function LeaseContractServices({defaults}:{defaults:Array<{name:string;amountCents:number}>}) {
  const [rows,setRows]=useState(defaults.map((x,i)=>({key:i,name:x.name,amount:(x.amountCents/100).toFixed(2)})));
  return <fieldset className="lease-party-picker"><legend>Rozpis zajišťovaných služeb</legend><p>Uveďte pouze zajišťované služby. Součet musí odpovídat zálohám v evidenci.</p>
    {rows.map((row,i)=><div key={row.key} className="compact-form"><label className="field"><span>Služba {i+1}</span><input name="serviceName" defaultValue={row.name} maxLength={300} required/></label><label className="field"><span>Záloha {i+1} Kč</span><input name="serviceAmount" type="number" step="0.01" min="0" defaultValue={row.amount} required/></label><button type="button" className="secondary" onClick={()=>setRows(rows.filter(x=>x.key!==row.key))}>Odebrat službu {i+1}</button></div>)}
    <button type="button" className="secondary" disabled={rows.length>=20} onClick={()=>setRows([...rows,{key:Math.max(-1,...rows.map(x=>x.key))+1,name:"",amount:""}])}>Přidat službu</button>
  </fieldset>;
}
