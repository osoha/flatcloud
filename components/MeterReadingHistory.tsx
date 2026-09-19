import Link from 'next/link';
import styles from './MeterReadingHistory.module.css';
import { businessDateKey, businessTodayKey } from '@/lib/calendar';
import { currentReadings, readingMethods } from '@/lib/meter-reading-rules';

type Reading = {id:string;readAt:Date;value:number;method:string;unitOfMeasure:string|null;note:string|null;correctsId:string|null;correctionReason:string|null;evidenceDocumentId:string|null;createdAt:Date;createdBy:{name:string}|null};
type Evidence = {id:string;title:string};
type Props = {readings:Reading[];unitOfMeasure:string;action:string;canManage:boolean;leaseId?:string;documents:Evidence[]};
function Fields({unitOfMeasure,reading,documents}:{unitOfMeasure:string;reading?:Reading;documents:Evidence[]}) {
  return <>
    <label className="field"><span>Datum odečtu</span><input type="date" name="readAt" required defaultValue={reading?businessDateKey(reading.readAt):businessTodayKey()} readOnly={!!reading}/></label>
    <label className="field"><span>Stav ({unitOfMeasure})</span><input type="number" name="value" min="0" step="0.001" required defaultValue={reading?.value}/></label>
    <label className="field"><span>Způsob odečtu</span><select name="method" required defaultValue={reading?.method==='LEGACY'?'':reading?.method||''}><option value="" disabled>Vyberte způsob</option>{Object.entries(readingMethods).filter(([key])=>key!=='LEGACY').map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <label className="field"><span>Poznámka / zdůvodnění odhadu</span><input name="note" defaultValue={reading?.note||''}/></label>
    <label className="field"><span>Fotografie nebo předávací protokol</span><select name="evidenceDocumentId" defaultValue={reading?.evidenceDocumentId||''}><option value="">{reading?.evidenceDocumentId?'Zachovat původní důkaz':'Bez přílohy'}</option>{documents.map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
    {reading&&<><input type="hidden" name="correctsId" value={reading.id}/><label className="field"><span>Důvod opravy</span><input name="correctionReason" required/></label></>}
  </>;
}
export function MeterReadingHistory({readings,unitOfMeasure,action,canManage,leaseId,documents}:Props) {
  const current=currentReadings(readings),latest=current.at(-1),activeIds=new Set(current.map(r=>r.id));
  return <>
    <div className="meter-value"><strong>{latest?latest.value.toLocaleString('cs-CZ'):'—'}</strong><span>{latest?.unitOfMeasure||unitOfMeasure}</span><small>{latest?businessDateKey(latest.readAt):'Bez odečtu'}</small></div>
    <details className="module-add" open={readings.length>0}><summary>Historie odečtů ({readings.length})</summary>
      <div className={styles.history}>{[...readings].sort((a,b)=>b.readAt.getTime()-a.readAt.getTime()||b.createdAt.getTime()-a.createdAt.getTime()).map(reading=><div key={reading.id} className={styles.reading}>
        <span>{businessDateKey(reading.readAt)} · {activeIds.has(reading.id)?'Platná verze':'Nahrazený záznam'}</span>
        <strong>{reading.value.toLocaleString('cs-CZ')} {reading.unitOfMeasure||unitOfMeasure}</strong>
        <small>{readingMethods[reading.method as keyof typeof readingMethods]||reading.method} · Zapsal/a: {reading.createdBy?.name||'Historický autor nezjištěn'}</small>
        {reading.note&&<p>{reading.note}</p>}{reading.correctionReason&&<p>Oprava: {reading.correctionReason}</p>}
        {reading.evidenceDocumentId&&(documents.some(d=>d.id===reading.evidenceDocumentId)?<Link href={`/api/documents/${reading.evidenceDocumentId}/download`} target="_blank" rel="noopener noreferrer">Otevřít důkaz odečtu</Link>:<small>Příloha je archivovaná nebo není dostupná v tomto přístupu.</small>)}
        {canManage&&activeIds.has(reading.id)&&<details><summary>Opravit odečet z {businessDateKey(reading.readAt)}</summary><p>Původní záznam zůstane zachován. Oprava nemění datum ani vazbu na smlouvu.</p><form className="compact-form" action={action} method="post"><Fields unitOfMeasure={reading.unitOfMeasure||unitOfMeasure} reading={reading} documents={documents}/><button className="secondary" type="submit">Uložit opravu odečtu</button></form></details>}
      </div>)}</div>
    </details>
    {canManage&&<details className="module-add"><summary>Přidat odečet</summary><form className="compact-form" action={action} method="post">{leaseId&&<input type="hidden" name="leaseId" value={leaseId}/>}<Fields unitOfMeasure={unitOfMeasure} documents={documents}/><button className="primary" type="submit">Uložit odečet</button></form><p className="muted-copy">Fotografii nebo PDF nejprve nahrajte do dokumentů této jednotky. Odhad vyžaduje zdůvodnění; ruční odečty nenahrazují odborné rozúčtování tepla.</p></details>}
  </>;
}
