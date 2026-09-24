"use client";
import { useState } from "react";
import { expenseKinds } from "@/lib/bank-expense-values";
import { propertyCostCategories } from "@/lib/asset-finance";

type Target={id:string;name:string;units:{id:string;label:string}[];costs:{id:string;title:string;documentNumber:string|null;remaining:number}[]};
export function BankExpenseForm({sourceId,transactionId,revision,remaining,incoming,targets,vendor,suggestedTargetId,suggestedUnitId}:{sourceId:string;transactionId:string;revision:number;remaining:number;incoming:boolean;targets:Target[];vendor:string;suggestedTargetId?:string;suggestedUnitId?:string}) {
  const [targetId,setTargetId]=useState(targets.some(t=>t.id===suggestedTargetId)?suggestedTargetId!:sourceId),[mode,setMode]=useState("existing"),[kind,setKind]=useState(incoming?"COST_REFUND":"COST_PAYMENT");
  const target=targets.find(t=>t.id===targetId)||targets[0];
  const costKind=kind==="COST_PAYMENT"||kind==="COST_REFUND";
  return <form action={`/api/properties/${sourceId}/bank-expenses/${transactionId}`} method="post" className="form-grid">
    <input type="hidden" name="revision" value={revision}/><input type="hidden" name="mode" value={costKind?mode:"classify"}/>
    <label className="field"><span>Cílový dům</span><select name="targetPropertyId" value={targetId} onChange={e=>setTargetId(e.target.value)}>{targets.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <label className="field"><span>Zařazení pohybu</span><select name="kind" value={kind} onChange={e=>{setKind(e.target.value);setMode("existing");}}>{Object.entries(expenseKinds).filter(([k])=>incoming?["COST_REFUND","TRANSFER","OTHER"].includes(k):k!=="COST_REFUND").map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></label>
    {costKind&&<label className="field"><span>Vazba na náklad</span><select value={mode} onChange={e=>setMode(e.target.value)}><option value="existing">Existující náklad / faktura</option>{!incoming&&<option value="create">Připravit nový náklad</option>}</select></label>}
    {costKind&&mode==="existing"&&<label className="field"><span>Náklad</span><select key={targetId} name="costId" required defaultValue=""><option value="" disabled>Vyberte náklad</option>{target?.costs.map(c=><option key={c.id} value={c.id}>{c.title} · {c.documentNumber||"bez čísla"} · zbývá {(c.remaining/100).toLocaleString("cs-CZ")} Kč</option>)}</select></label>}
    <label className="field"><span>Částka přiřazení (Kč)</span><input name="amount" type="number" step="0.01" min="0.01" max={remaining/100} defaultValue={(remaining/100).toFixed(2)} required/></label>
    {costKind&&mode==="create"&&<>
      <p className="field-full">Nejdříve ověřte, zda faktura již není v evidenci. Nový náklad vznikne jako objednaný; doklad a rozdělení doplníte v jeho detailu.</p>
      <label className="field"><span>Název nákladu</span><input name="title" required maxLength={200}/></label>
      <label className="field"><span>Celá částka faktury (Kč)</span><input name="costAmount" type="number" min="0.01" step="0.01" defaultValue={(remaining/100).toFixed(2)} required/></label>
      <label className="field"><span>Datum vzniku nákladu / období</span><input name="effectiveAt" type="date" required/></label>
      <label className="field"><span>Typ nákladu</span><select name="costKind"><option value="OPEX">OPEX</option><option value="CAPEX">CAPEX</option></select></label>
      <label className="field"><span>Kategorie</span><select name="category" defaultValue="OTHER">{Object.entries(propertyCostCategories).map(([k,label])=><option value={k} key={k}>{label}</option>)}</select></label>
      <label className="field"><span>Jednotka</span><select name="unitId" key={targetId} defaultValue={suggestedUnitId||""}><option value="">Celý dům / rozdělit později</option>{target?.units.map(u=><option key={u.id} value={u.id}>{u.label}</option>)}</select></label>
      <label className="field"><span>Dodavatel</span><input name="vendor" defaultValue={vendor}/></label>
      <label className="field"><span>Číslo faktury</span><input name="documentNumber"/></label>
    </>}
    <label className="field field-full"><span>Důvod / podklad přiřazení</span><input name="reason" required maxLength={2000}/></label>
    <div className="form-actions field-full"><button className="primary" type="submit">{costKind&&mode==="create"?"Vytvořit návrh a připojit úhradu":"Uložit přiřazení"}</button></div>
  </form>;
}
