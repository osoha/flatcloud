import { parseCzkToCents } from './forms';
export const OWNER_COST_WARNING = 'Náklad vlastníka – nepatří do vyúčtování služeb nájemci bytu. Tato položka není standardně způsobilá k samostatnému přeúčtování. Potvrzení upozornění nemění její právní přípustnost.';
export const SOURCE_SERVICES = [
 ['WATER','Studená voda','SERVICE'],['HEATING','Vytápění','EXTERNAL'],['HOT_WATER','Ohřev vody','EXTERNAL'],['HOT_WATER_VOLUME','Voda pro ohřev','SERVICE'],['ELECTRICITY','Společná elektřina','SERVICE'],['CLEANING','Úklid','SERVICE'],['WASTE','Odpad','SERVICE'],['LIFT','Výtah','SERVICE'],['INSURANCE','Pojištění domu','OWNER'],['MANAGEMENT','Správa domu','OWNER'],['REPAIR_FUND','Fond oprav','OWNER'],['INSPECTIONS','Revize','OWNER'],['PEST_CONTROL','Deratizace – individuální posouzení','REVIEW'],['OTHER','Jiná položka – individuální posouzení','REVIEW'],
] as const;
export type SourceLine = { key:string; service:string; role:'COST'|'SUMMARY'; from:string; to:string; amount:string; unitId:string; leaseId:string; base:string; consumptionComponent:string; correction:string; rounding:string; quantity:string; measure:string; explanation:string; componentsComplete:boolean; ownerOverride:boolean; ownerReason:string };
export type SourcePayload = { schemaVersion:1; mode:'HOUSE'|'EXTERNAL_UNIT'; kind:'INVOICE'|'CREDIT_NOTE'|'EXTERNAL'; vendor:string; reference:string; from:string; to:string; supplyAmount:string; supplierAdvances:string; unitId:string; creditForId:string; propertyCostId:string; revisionReason:string; lines:SourceLine[] };
export function sourceDate(value:string) { if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value) throw new Error('Zadejte platné datum.'); return value; }
export function sourceMoney(value:string) { const n=parseCzkToCents(value);if(Math.abs(n)>2_000_000_000)throw new Error('Částka překračuje podporovaný rozsah.');return n; }
function required(value:unknown,label:string,max=500):string {if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error(`Doplňte ${label} (nejvýše ${max} znaků).`);return value.trim();}
function optional(value:unknown,max=2000):string {if(value===undefined||value===null)return '';if(typeof value!=='string'||value.length>max)throw new Error('Neplatný nebo příliš dlouhý text.');return value.trim();}
export function validateSource(input:unknown):SourcePayload {
 if(!input||typeof input!=='object')throw new Error('Chybí podklad.');const p=input as Record<string,unknown>;
 const mode=required(p.mode,'režim'),kind=required(p.kind,'typ');if(!['HOUSE','EXTERNAL_UNIT'].includes(mode)||!['INVOICE','CREDIT_NOTE','EXTERNAL'].includes(kind))throw new Error('Neplatný režim nebo typ podkladu.');
 const from=sourceDate(required(p.from,'začátek období')),to=sourceDate(required(p.to,'konec období'));if(from>to)throw new Error('Období je obráceně.');
 const supplyAmount=required(p.supplyAmount,'celkový náklad dodávky');const total=sourceMoney(supplyAmount);if(kind==='CREDIT_NOTE'?total>=0:total<0)throw new Error('Dobropis musí mít záporný náklad; ostatní podklady nezáporný.');
 const supplierAdvances=optional(p.supplierAdvances)||'0';if(sourceMoney(supplierAdvances)<0)throw new Error('Dodavatelské zálohy nesmějí být záporné.');
 const unitId=optional(p.unitId,100);if(mode==='EXTERNAL_UNIT'&&!unitId)throw new Error('Vyberte jednotku externího vyúčtování.');
 if(!Array.isArray(p.lines)||p.lines.length<1||p.lines.length>500)throw new Error('Podklad musí obsahovat 1 až 500 řádků.');
 const keys=new Set<string>();let sum=0;
 const lines=p.lines.map((raw:unknown)=>{if(!raw||typeof raw!=='object')throw new Error('Neplatný řádek.');const r=raw as Record<string,unknown>;const key=required(r.key,'jedinečný identifikátor řádku',100);if(keys.has(key.toLowerCase()))throw new Error('Duplicitní identifikátor řádku.');keys.add(key.toLowerCase());
 const service=required(r.service,'službu');if(!SOURCE_SERVICES.some(s=>s[0]===service))throw new Error('Neznámá služba.');const role=required(r.role,'roli řádku');if(!['COST','SUMMARY'].includes(role))throw new Error('Neplatná role řádku.');
 const lf=sourceDate(required(r.from,'období řádku')),lt=sourceDate(required(r.to,'období řádku'));if(lf<from||lt>to||lf>lt)throw new Error('Řádek musí být uvnitř období dokladu.');
 const amount=required(r.amount,'částku řádku'),cents=sourceMoney(amount);if(role==='COST'){if(kind==='CREDIT_NOTE'?cents>0:cents<0)throw new Error('Znaménko řádku neodpovídá typu dokladu.');sum+=cents;}
 const rowUnit=optional(r.unitId,100)||unitId,leaseId=optional(r.leaseId,100);if(mode==='EXTERNAL_UNIT'&&rowUnit!==unitId)throw new Error('Řádek patří jiné jednotce.');if(leaseId&&!rowUnit)throw new Error('U nájemního vztahu musí být vybrána jednotka.');if(kind==='EXTERNAL'&&role==='COST'&&!rowUnit)throw new Error('Externí náklad přiřaďte konkrétní jednotce.');
 const explanation=optional(r.explanation);if(role==='COST'&&(lf!==from||lt!==to||from.slice(0,4)!==to.slice(0,4))&&!explanation)throw new Error('Rozdělení dokladu přes období vyžaduje odůvodnění u řádku.');
 const base=optional(r.base),consumptionComponent=optional(r.consumptionComponent),correction=optional(r.correction),rounding=optional(r.rounding);
 const components=[base,consumptionComponent,correction,rounding];components.filter(Boolean).forEach(sourceMoney);
 // If a decomposition is supplied, it must reconcile. Never add it to its total again.
 const componentsComplete=r.componentsComplete===true;
 if(componentsComplete&&components.reduce((a,v)=>a+(v?sourceMoney(v):0),0)!==cents)throw new Error('Základní a spotřební složka, korekce a zaokrouhlení se musí rovnat částce řádku.');
 const quantity=optional(r.quantity,50),measure=optional(r.measure,30);if(quantity&&(!/^\d+([,.]\d{1,6})?$/.test(quantity)||!measure))throw new Error('Spotřeba musí být nezáporné číslo s měrnou jednotkou.');
 const ownerOverride=r.ownerOverride===true,ownerReason=optional(r.ownerReason);if(ownerOverride&&ownerReason.length<10)throw new Error('Ruční zahrnutí vyžaduje konkrétní odůvodnění (alespoň 10 znaků).');
 return {key,service,role:role as SourceLine['role'],from:lf,to:lt,amount,unitId:rowUnit,leaseId,base,consumptionComponent,correction,rounding,quantity,measure,explanation,componentsComplete,ownerOverride,ownerReason};});
 if(sum!==total)throw new Error('Součet nákladových řádků se musí rovnat nákladu dodávky. Souhrny se nepřičítají.');
 const creditForId=optional(p.creditForId,100);if(kind==='CREDIT_NOTE'&&!creditForId)throw new Error('Dobropis musí odkazovat na původní potvrzenou fakturu.');
 return {schemaVersion:1,mode:mode as SourcePayload['mode'],kind:kind as SourcePayload['kind'],vendor:required(p.vendor,'dodavatele / zpracovatele',200),reference:required(p.reference,'číslo dokladu',200),from,to,supplyAmount,supplierAdvances,unitId,creditForId,propertyCostId:optional(p.propertyCostId,100),revisionReason:optional(p.revisionReason),lines};
}
export function lineReadiness(p:SourcePayload,line:SourceLine){const classification=SOURCE_SERVICES.find(s=>s[0]===line.service)![2];if(line.role==='SUMMARY')return 'Informativní souhrn – nezapočítává se';if(classification==='EXTERNAL'&&p.kind!=='EXTERNAL')return 'Čeká na externí rozúčtování';if(classification==='OWNER')return line.ownerOverride?'Ruční zahrnutí – právní přípustnost nepotvrzena':'Hradí vlastník';if(classification==='REVIEW')return line.ownerOverride?'Ruční zahrnutí – vyžaduje právní posouzení':'Čeká na individuální posouzení';return 'Potvrzený nákladový podklad';}

export function emptySourceLine(from:string,to:string,n=1):SourceLine{return {key:`Řádek ${n}`,service:'WATER',role:'COST',from,to,amount:'',unitId:'',leaseId:'',base:'',consumptionComponent:'',correction:'',rounding:'',quantity:'',measure:'',explanation:'',componentsComplete:false,ownerOverride:false,ownerReason:''};}
