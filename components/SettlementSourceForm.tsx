'use client';
import { useState, type FormEvent } from 'react';
import { OWNER_COST_WARNING, SOURCE_SERVICES, emptySourceLine, type SourcePayload, type SourceLine } from '@/lib/settlement-source-rules';
type Option={id:string;label:string};
export function SettlementSourceForm({propertyId,initial,previousId,documentId='',documents,units,leases,costs,invoices}:{propertyId:string;initial:SourcePayload;previousId?:string;documentId?:string;documents:Option[];units:Option[];leases:(Option&{unitId:string})[];costs:Option[];invoices:Option[]}){
 const [p,setP]=useState(initial);const [doc,setDoc]=useState(documentId);const [error,setError]=useState('');const [saving,setSaving]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setSaving(true);setError('');try{const response=await fetch(e.currentTarget.action,{method:'POST',body:new FormData(e.currentTarget),headers:{Accept:'application/json'}});const result=await response.json();if(!response.ok||!result.url)throw new Error(result.error||'Podklad se nepodařilo uložit.');window.location.assign(result.url);}catch(e){setError(e instanceof Error?e.message:'Uložení selhalo.');setSaving(false);}}
 function field(key:keyof Omit<SourcePayload,'lines'|'schemaVersion'>,label:string,type='text'){return <label className="field"><span>{label}</span><input type={type} value={p[key]} onChange={e=>setP({...p,[key]:e.target.value})}/></label>;}
 function select(key:keyof Omit<SourcePayload,'lines'|'schemaVersion'>,label:string,options:Option[]){return <label className="field"><span>{label}</span><select aria-label={label} value={p[key]} onChange={e=>setP({...p,[key]:e.target.value})}><option value="">Nevybráno</option>{options.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label>;}
 function rowField(i:number,key:keyof SourceLine,label:string,type='text'){const l=p.lines[i];return <label className="field"><span>{label}</span><input aria-label={`Řádek ${i+1} – ${label}`} type={type} value={String(l[key])} onChange={e=>change(i,key,e.target.value)}/></label>;}
 function change(i:number,key:keyof SourceLine,value:string|boolean){setP({...p,lines:p.lines.map((l,n)=>n===i?{...l,[key]:value}:l)});}
 return <form onSubmit={submit} method="post" action={`/api/properties/${propertyId}/settlement-sources`} className="card">
 <input type="hidden" name="payload" value={JSON.stringify(p)}/><input type="hidden" name="previousId" value={previousId||''}/><input type="hidden" name="documentId" value={doc}/>
 {error&&<p role="alert" className="form-error">{error}</p>}
 <h2>{previousId?'Nová opravná verze':'Nový podklad'}</h2><p>Ruční přepis z originálu. Uložení vytvoří návrh; použitelnost údajů potvrdíte až v jeho detailu. Automatické čtení PDF ani API ISTA tato verze neprovádí.</p>
 <div className="form-grid">
 {select('mode','Režim',[{id:'HOUSE',label:'Celý dům'},{id:'EXTERNAL_UNIT',label:'Jednotka – externí vyúčtování'}])}
 {select('kind','Typ podkladu',[{id:'INVOICE',label:'Dodavatelská faktura'},{id:'CREDIT_NOTE',label:'Dobropis'},{id:'EXTERNAL',label:'Externí výsledek ISTA / SVJ / zpracovatele'}])}
 {field('vendor','Dodavatel / zpracovatel')}{field('reference','Číslo dokladu')}{field('from','Období dodávky od','date')}{field('to','Období dodávky do','date')}
 {field('supplyAmount','Celkový náklad dodávky Kč')}{field('supplierAdvances','Zálohy zaplacené dodavateli Kč – pouze informace')}
 {select('unitId','Jednotka externího vyúčtování',units)}{select('propertyCostId','Vazba na již evidovaný skutečný náklad',costs)}
 {p.kind==='CREDIT_NOTE'&&select('creditForId','Původní potvrzená faktura',invoices)}
 <label className="field"><span>Originál z dokumentů nemovitosti</span><select aria-label="Originál z dokumentů nemovitosti" value={doc} onChange={e=>setDoc(e.target.value)}><option value="">Doplním v opravné verzi před potvrzením</option>{documents.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
 {previousId&&field('revisionReason','Důvod opravy')}
 </div><p className="legal-warning">Zadejte cenu dodávky před odečtením záloh dodavateli. Doplatek faktury není nákladem služby. Originál lze nejprve nahrát v Dokumentech nemovitosti.</p>
 <h2>Řádky podkladu</h2><p>Nákladové řádky se sčítají do celkové ceny dodávky. Opakovaný domovní souhrn uveďte pouze jako informativní souhrn. Složky uvnitř řádku se nepřičítají podruhé. Více období nebo jednotek zadávejte samostatnými řádky.</p>
 {p.lines.map((l,i)=><fieldset className="card" key={i}><legend>Řádek {i+1}</legend><div className="form-grid">
 {rowField(i,'key','Identifikátor řádku / strana originálu')}
 <label className="field"><span>Služba</span><select aria-label={`Řádek ${i+1} – Služba`} value={l.service} onChange={e=>change(i,'service',e.target.value)}>{SOURCE_SERVICES.map(s=><option key={s[0]} value={s[0]}>{s[1]}</option>)}</select></label>
 <label className="field"><span>Role řádku</span><select aria-label={`Řádek ${i+1} – Role`} value={l.role} onChange={e=>change(i,'role',e.target.value)}><option value="COST">Náklad – zahrnout do kontrolního součtu</option><option value="SUMMARY">Informativní souhrn – nepřičítat</option></select></label>
 {rowField(i,'amount','Náklad Kč')}{rowField(i,'from','Od','date')}{rowField(i,'to','Do','date')}
 <label className="field"><span>Jednotka řádku</span><select aria-label={`Řádek ${i+1} – Jednotka`} value={l.unitId} onChange={e=>{change(i,'unitId',e.target.value);}}><option value="">Podle hlavičky / celý dům</option>{units.map(u=><option key={u.id} value={u.id}>{u.label}</option>)}</select></label>
 <label className="field"><span>Nájemní vztah – nepovinný</span><select aria-label={`Řádek ${i+1} – Nájemní vztah`} value={l.leaseId} onChange={e=>change(i,'leaseId',e.target.value)}><option value="">Pouze jednotka / dům</option>{leases.filter(x=>x.unitId===(l.unitId||p.unitId)).map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
 {rowField(i,'quantity','Spotřeba')}{rowField(i,'measure','Měrná jednotka')}{rowField(i,'explanation','Odůvodnění rozdělení období / klíče')}
 </div><details><summary>Složky externího výsledku a zaokrouhlení</summary><div className="form-grid">{rowField(i,'base','Základní složka Kč')}{rowField(i,'consumptionComponent','Spotřební složka Kč')}{rowField(i,'correction','Korekce Kč')}{rowField(i,'rounding','Zaokrouhlení Kč')}</div><label className="checkbox-field"><input type="checkbox" checked={l.componentsComplete} onChange={e=>change(i,'componentsComplete',e.target.checked)}/>Zdroj uvádí úplný rozpad – ověřit součet složek proti nákladu</label></details>
 {['OWNER','REVIEW'].includes(SOURCE_SERVICES.find(s=>s[0]===l.service)![2])&&<div className="legal-warning"><strong>{SOURCE_SERVICES.find(s=>s[0]===l.service)![2]==='OWNER'?OWNER_COST_WARNING:'Tato položka vyžaduje individuální posouzení titulu a okolností. Bez posouzení se nezahrnuje mezi služby nájemce.'}</strong><label className="checkbox-field"><input aria-label={`Řádek ${i+1} – Ručně zahrnout`} type="checkbox" checked={l.ownerOverride} onChange={e=>change(i,'ownerOverride',e.target.checked)}/>Požaduji ruční zahrnutí s odůvodněním</label>{l.ownerOverride&&rowField(i,'ownerReason','Odůvodnění ručního zahrnutí')}</div>}
 {p.lines.length>1&&<button className="secondary" type="button" onClick={()=>setP({...p,lines:p.lines.filter((_,n)=>n!==i)})}>Odebrat neuložený řádek {i+1}</button>}
 </fieldset>)}
 <div className="action-row"><button className="secondary" type="button" onClick={()=>setP({...p,lines:[...p.lines,emptySourceLine(p.from,p.to,p.lines.length+1)]})}>Přidat řádek</button><button className="primary" disabled={saving}>{saving?'Ukládám…':'Uložit návrh podkladu'}</button></div>
 </form>;
}
