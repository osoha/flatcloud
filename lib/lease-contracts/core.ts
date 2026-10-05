import { z } from "zod";
import template from "./approved-template.json";

const text = z.string().trim().min(1).max(700).refine(v => !/[\[\]\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v), "Odstraňte nevyplněná pole a řídicí znaky.");
const optionalText = z.string().trim().max(700).refine(v => !/[\[\]\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v));
// Identity and authority must fit a complete signature block even with wide glyphs.
const name=text.pipe(z.string().max(200)),authority=text.pipe(z.string().max(350));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(v+"T12:00:00Z"); return !isNaN(+d) && d.toISOString().slice(0,10) === v; }, "Datum není platné.");
const cents = z.number().int().min(0).max(2147483647);
const person = z.object({name,birthDate:date,address:text,deliveryAddress:text,email:optionalText,phone:optionalText}).strict();
export const contractInputSchema = z.object({
  term:z.enum(["SHORT_FIXED","LONG_FIXED","INDEFINITE"]), tenancy:z.enum(["SINGLE","JOINT","SPOUSES"]),
  landlord:z.object({type:z.enum(["PERSON","COMPANY"]),name,identifier:text,address:text,email:optionalText,phone:optionalText,registry:optionalText,signer:name,authority,represented:z.boolean()}).strict(),
  tenants:z.array(person).min(1).max(8), manager:z.object({name:optionalText,email:optionalText,phone:optionalText}).strict(),
  unit:z.object({address:text,label:text,floor:text,disposition:text,areaM2:z.number().positive().max(10000),cadastral:text,accessories:text}).strict(),
  startDate:date,endDate:z.union([date,z.literal("")]),handoverDate:date,signingDate:date,signingPlace:text,
  rentCents:cents.refine(v=>v>0),services:z.array(z.object({name:text,amountCents:cents}).strict()).max(30),dueDay:z.number().int().min(5).max(28),account:text,variableSymbol:z.string().regex(/^\d{1,10}$/),firstPaymentDate:date,
  depositCents:cents,depositDueDate:z.union([date,z.literal("")]),depositAnnualRateBps:z.number().int().min(0).max(10000),
  directEnergy:text,occupantCount:z.number().int().min(1).max(50),attachments:text,confirmed:z.literal(true),
}).strict().superRefine((d,ctx)=>{
  const issue=(path:string,message:string)=>ctx.addIssue({code:"custom",path:[path],message});
  if(d.term==="INDEFINITE"&&d.endDate)issue("endDate","U doby neurčité odstraňte konec nájmu.");
  if(d.term!=="INDEFINITE") {
    if(!d.endDate||d.endDate<=d.startDate)issue("endDate","Konec musí následovat po začátku nájmu.");
    if(d.endDate) { const anniversary=addYear(d.startDate); const short=d.endDate<anniversary; if((d.term==="SHORT_FIXED")!==short)issue("term","Zvolená varianta neodpovídá délce nájmu. Krátká varianta je nejvýše jeden rok včetně posledního dne."); }
  }
  if(d.firstPaymentDate<d.signingDate)issue("firstPaymentDate","První platba nesmí být splatná před podpisem.");
  if(d.depositCents>3*d.rentCents)issue("depositCents","Jistota smí být nejvýše trojnásobek čistého nájemného.");
  if(d.depositCents>0&&(!d.depositDueDate||d.depositDueDate<d.signingDate))issue("depositDueDate","Doplňte splatnost jistoty nejdříve v den podpisu.");
  if(d.tenancy==="SINGLE"&&d.tenants.length!==1)issue("tenancy","Jeden nájemce vyžaduje právě jednu osobu.");
  if(d.tenancy==="JOINT"&&d.tenants.length<2)issue("tenancy","Společný nájem vyžaduje alespoň dvě osoby.");
  if(d.tenancy==="SPOUSES"&&d.tenants.length!==2)issue("tenancy","Doplňte oba manžele.");
  if(d.occupantCount<d.tenants.length)issue("occupantCount","Počet osob nesmí být menší než počet nájemců.");
  if(new Set(d.tenants.map(t=>t.name.toLocaleLowerCase("cs")+t.birthDate)).size!==d.tenants.length)issue("tenants","Smluvní osoby se nesmějí opakovat.");
  for(const t of d.tenants) if(t.birthDate>=d.signingDate)issue("tenants","Datum narození musí předcházet podpisu.");
  if(d.landlord.type==="COMPANY"&&(!/^\d{8}$/.test(d.landlord.identifier)||!d.landlord.registry))issue("landlord","U firmy doplňte osmimístné IČO, rejstřík a způsob jednání.");
  if(d.landlord.type==="PERSON"&&!date.safeParse(d.landlord.identifier).success)issue("landlord","U fyzické osoby doplňte datum narození ve formátu RRRR-MM-DD.");
  if(!d.landlord.represented&&d.landlord.type==="PERSON"&&d.landlord.signer!==d.landlord.name)issue("landlord","Podepisuje-li jiná osoba, označte zastoupení a doložte oprávnění.");
  if(d.landlord.represented&&/^(žádné|žádná|bez příloh)$/i.test(d.attachments))issue("attachments","Při zastoupení připojte a uveďte doklad oprávnění.");
  if(d.services.some(s=>/doplňte rozpis/i.test(s.name)))issue("services","Nahraďte souhrnnou zálohu rozpisem skutečně zajišťovaných služeb.");
  const sum=d.services.reduce((s,v)=>s+v.amountCents,0);if(sum+d.rentCents>2147483647)issue("services","Celková platba je příliš vysoká.");
});
export type ContractInput = z.infer<typeof contractInputSchema>;
export const CONTRACT_TEMPLATE_VERSION=template.version;
export function addYear(value:string) { const [y,m,d]=value.split("-").map(Number);return `${y+1}-${String(m).padStart(2,"0")}-${String(Math.min(d,new Date(Date.UTC(y+1,m,0)).getUTCDate())).padStart(2,"0")}`; }
export function firstIndexationDate(start:string) {const anniversary=addYear(start),year=Number(anniversary.slice(0,4));return anniversary<=`${year}-04-01`?`${year}-04-01`:`${year+1}-04-01`;}
export function formatDate(value:string) {return value?value.split("-").reverse().map(Number).join(". "):"";}
export function money(cents:number) {return new Intl.NumberFormat("cs-CZ",{minimumFractionDigits:2,maximumFractionDigits:2}).format(cents/100);}
export type ContractSection={title:string;paragraphs:string[]};
export function buildContract(raw:unknown) {
  const d=contractInputSchema.parse(raw),sum=d.services.reduce((s,v)=>s+v.amountCents,0),rate=(d.depositAnnualRateBps/100).toLocaleString("cs-CZ"), indexed=d.term!=="SHORT_FIXED";
  const signer=`${d.landlord.signer}; ${d.landlord.authority}`;
  const fields:Record<string,string>={"jméno nebo název":d.landlord.name,"datum narození nebo IČO":d.landlord.type==="COMPANY"?`IČO ${d.landlord.identifier}`:`narozen/a ${formatDate(d.landlord.identifier)}`,"bydliště nebo sídlo":d.landlord.address,"e-mail pronajímatele":d.landlord.email||"neuveden","telefon pronajímatele":d.landlord.phone||"neuveden","podepisující osoba a oprávnění":signer,"označení bytu":d.unit.label,"adresa bytu":d.unit.address,"podlaží a umístění":d.unit.floor,"dispozice":d.unit.disposition,"plocha":String(d.unit.areaM2).replace(".",","),"jednotka nebo budova a parcela, katastrální území, LV":d.unit.cadastral,"příslušenství a rozsah užívání":d.unit.accessories,"počátek nájmu":formatDate(d.startDate),"konec nájmu":formatDate(d.endDate),"datum předání":formatDate(d.handoverDate),"nájemné":money(d.rentCents),"zálohy celkem":money(sum),"platba celkem":money(sum+d.rentCents),"den splatnosti":String(d.dueDay),"účet":d.account,"variabilní symbol":d.variableSymbol,"datum první platby":formatDate(d.firstPaymentDate),"jistota":money(d.depositCents),"datum splatnosti jistoty":formatDate(d.depositDueDate),"úrok jistoty":rate,"přímé energie":d.directEnergy,"počet osob":String(d.occupantCount),"seznam skutečně připojených příloh":d.attachments,"datum prvního zvýšení":formatDate(firstIndexationDate(d.startDate))};
  const replace=(s:string)=>s.replace(/\[([^\]]+)\]/g,(_,key:string)=>{if(!(key in fields))throw new Error(`Neznámé pole vzoru: ${key}`);return fields[key];});
  const personText=(t:ContractInput["tenants"][number])=>`${t.name}, narozen/a ${formatDate(t.birthDate)}, bydliště ${t.address}, doručovací adresa ${t.deliveryAddress}, e-mail ${t.email||"neuveden"}, telefon ${t.phone||"neuveden"}`;
  const sections:ContractSection[]=[];
  for(const original of template.clauses) {
    if(/^\d+ /.test(original)){sections.push({title:original,paragraphs:[]});continue;}
    let p=original;
    if(p.startsWith("1.1 "))p=`1.1 Pronajímatelem je [jméno nebo název], [datum narození nebo IČO], s bydlištěm nebo sídlem [bydliště nebo sídlo], e-mail [e-mail pronajímatele], telefon [telefon pronajímatele]. ${d.tenants.length>1?"Nájemci jsou":"Nájemcem je"} ${d.tenants.map(personText).join("; ")}. ${d.tenancy==="JOINT"?"Uvedené osoby jsou společnými nájemci bytu ve smyslu § 2270 a § 2271 občanského zákoníku. Označení nájemce v této smlouvě zahrnuje všechny společné nájemce.":d.tenancy==="SPOUSES"?"Uvedení manželé jsou společnými nájemci bytu; jejich práva a povinnosti se řídí také úpravou společného nájmu manželů v občanském zákoníku. Označení nájemce zahrnuje oba manžele.":""}`;
    if(p.startsWith("1.2 "))p=`1.2 Za pronajímatele tuto smlouvu podepisuje ${signer}. ${d.landlord.type==="COMPANY"?`Zápis v rejstříku a způsob jednání: ${d.landlord.registry}. `:""}${d.landlord.represented?"Oprávnění k zastoupení se doloží připojeným dokumentem. ":""}${d.manager.name?`Správce ${d.manager.name}, e-mail ${d.manager.email||"neuveden"}, telefon ${d.manager.phone||"neuveden"}, zajišťuje provozní komunikaci, evidenci plateb, hlášení závad a organizaci předání. Smlouvu smí měnit, ukončovat nebo za pronajímatele přijímat právní jednání jen v rozsahu doloženého oprávnění.`:"Samostatný správce není určen; provozní komunikaci zajišťuje pronajímatel."}`;
    if(p.startsWith("3.2 ")&&indexed)p=template.indexed.join("\n\n");
    if(d.term==="INDEFINITE") {
      if(p.startsWith("3.1 "))p="3.1 Nájem se sjednává na dobu neurčitou od [počátek nájmu].";
      if(p.startsWith("8.1 "))p="8.1 Nájem může skončit písemnou dohodou stran, platnou výpovědí nebo jiným zákonným způsobem.";
      if(p.startsWith("8.2 "))p=p.replace(" i před uplynutím sjednané doby","");
      if(p.startsWith("10.1 "))p="10.1 Tato smlouva včetně úvodního přehledu tvoří jeden celek. Její změny vyžadují písemný dodatek podepsaný oběma stranami. Oznámení nové výše záloh podle článku 4.3 nebo nového účtu podle článku 3.4 se řídí těmito články. Pokud se údaje v přehledu a textu liší, strany je před podpisem sjednotí; případný následně zjištěný rozpor se vyloží podle zákona.";
    }
    if(p.startsWith("4.1 "))p=`4.1 ${d.services.length?`Pronajímatel zajišťuje tyto služby s měsíčními zálohami: ${d.services.map(s=>`${s.name} ${money(s.amountCents)} Kč`).join(", ")}.`:"Pronajímatel nezajišťuje služby hrazené měsíčními zálohami."} Součet měsíčních záloh činí [zálohy celkem] Kč. Počet osob rozhodných pro rozúčtování při zahájení nájmu je [počet osob].`;
    if(p.startsWith("4.4 ")&&d.directEnergy==="Žádné")p="4.4 Energie přímo na nájemce se nesjednávají. Nájemce plní své případné zákonné povinnosti k rozhlasovým a televizním poplatkům.";
    if(p.startsWith("7.2 ")&&!d.manager.name)p=p.replace("informuje správce","informuje pronajímatele");
    if(!d.depositCents&&/^5\.[1-4] /.test(p)){if(!p.startsWith("5.1 "))continue;p="5.1 Jistota se nesjednává. Nájemci nevzniká povinnost jistotu poskytovat ani doplňovat.";}
    if(d.tenants.length>1)p=p.replaceAll("podepsaným oběma stranami","podepsaným pronajímatelem a všemi nájemci").replaceAll("podepsaný oběma stranami","podepsaný pronajímatelem a všemi nájemci").replaceAll("dodatkem obou stran","dodatkem pronajímatele a všech nájemců").replaceAll("podpisem obou stran","podpisem pronajímatele a všech nájemců");
    sections.at(-1)!.paragraphs.push(replace(p).trim());
  }
  const cover:Array<[string,string]>=[
    ["Pronajímatel",`${d.landlord.name} · ${fields["datum narození nebo IČO"]}\n${d.landlord.address}\nPodepisuje: ${signer}`],
    [d.tenancy==="SPOUSES"?"Nájemci – manželé":d.tenants.length>1?"Společní nájemci":"Nájemce",d.tenants.map(personText).join("\n")],
    ["Správce",d.manager.name?`${d.manager.name} · ${d.manager.email||"e-mail neuveden"} · ${d.manager.phone||"telefon neuveden"}`:"Provozní komunikaci zajišťuje pronajímatel."],
    ["Byt",`${d.unit.address} · ${d.unit.label} · ${d.unit.floor}\n${d.unit.disposition} · ${d.unit.areaM2} m² · ${d.unit.accessories}\n${d.unit.cadastral}`],
    ["Doba nájmu",d.term==="INDEFINITE"?`Na dobu neurčitou od ${formatDate(d.startDate)}`:`Od ${formatDate(d.startDate)} do ${formatDate(d.endDate)} včetně; prodloužení pouze podepsaným dodatkem, obnovení podle § 2285 se vylučuje.`],
    ["Předání a výpověď",`${formatDate(d.handoverDate)} · Nájemce může vypovědět bez důvodu s tříměsíční výpovědní dobou.`],
    ["Měsíční platba",`Nájemné ${money(d.rentCents)} Kč + služby ${money(sum)} Kč = ${money(d.rentCents+sum)} Kč`],
    ["Splatnost",`${d.dueDay}. den daného měsíce · účet ${d.account} · VS ${d.variableSymbol}\nPrvní platba: ${formatDate(d.firstPaymentDate)}, nejdříve při uzavření smlouvy.`],
    ["Jistota",d.depositCents?`${money(d.depositCents)} Kč · do ${formatDate(d.depositDueDate)} · ${rate} % ročně; zákonné minimum viz článek 5.3`:"Jistota se nesjednává."],
    ["Změna nájemného",indexed?`ČSÚ: kladná průměrná roční míra inflace za předchozí kalendářní rok, domácnosti celkem v ČR. K 1. dubnu, poprvé nejdříve ${formatDate(firstIndexationDate(d.startDate))}; oznámení 30 dnů předem, celé koruny. Podrobnosti v článku 3.2.`:"Pouze podepsaným dodatkem; bez indexace."],
    ...d.services.map(s=>[s.name,`${money(s.amountCents)} Kč měsíčně`] as [string,string]),
    ["Energie a osoby",`Energie přímo na nájemce: ${d.directEnergy}. Počet osob při zahájení: ${d.occupantCount}.`],
    ["Pojištění","Pojištění odpovědnosti včetně škod na pronajatém bytě a třetím osobám je povinné."],
  ];
  return {version:CONTRACT_TEMPLATE_VERSION,input:d,cover,sections,signing:`V ${d.signingPlace} dne ${formatDate(d.signingDate)}`,signatures:[{role:"Pronajímatel",name:d.landlord.name,detail:signer},...d.tenants.map(t=>({role:"Nájemce",name:t.name,detail:`narozen/a ${formatDate(t.birthDate)}`}))]};
}
