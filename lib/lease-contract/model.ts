import {z} from "zod";
import template from "./template-v1.json";

const text = z.string().trim().min(1).max(300).refine(v => !/[\[\]\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v), "Nepoužívejte nevyplněná pole nebo řídicí znaky.");
const optionalText = z.string().trim().max(300).refine(v => !/[\[\]\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v));
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const date = new Date(`${v}T12:00:00Z`); return !Number.isNaN(+date) && date.toISOString().slice(0, 10) === v;
}, "Neplatné datum.");
const cents = z.number().int().min(0).max(100_000_000);
export const contractSupplementSchema = z.object({
  landlordName: text, landlordKind: z.enum(["PERSON", "COMPANY"]), landlordId: text,
  landlordAddress: text, landlordEmail: text, landlordPhone: text,
  landlordRegistration: optionalText, representative: text,
  managerName: optionalText, managerEmail: optionalText, managerPhone: optionalText,
  tenantAddress: text, tenantDeliveryAddress: text, tenantEmail: text, tenantPhone: text,
  floor: text, disposition: text, cadastralId: text, accessories: text,
  handoverDate: day, firstPaymentDate: day, depositDueDate: day.nullable(),
  directEnergy: text, peopleCount: z.number().int().min(1).max(50),
  attachments: text, signingPlace: text, signingDate: day,
  services: z.array(z.object({name: text, amountCents: cents})).max(20),
  confirmedTestRecord: z.literal(true),
}).superRefine((v, ctx) => {
  if(v.landlordKind === "COMPANY" && !v.landlordRegistration) ctx.addIssue({code:"custom",path:["landlordRegistration"],message:"Doplňte zápis společnosti v rejstříku a způsob jednání."});
  if(v.managerName && (!v.managerEmail || !v.managerPhone)) ctx.addIssue({code:"custom",path:["managerName"],message:"Doplňte kontakty správce."});
  if(!v.managerName && (v.managerEmail || v.managerPhone)) ctx.addIssue({code:"custom",path:["managerName"],message:"Doplňte jméno správce nebo vymažte jeho kontakty."});
  if(v.firstPaymentDate < v.signingDate) ctx.addIssue({code:"custom",path:["firstPaymentDate"],message:"První platba nesmí být před podpisem."});
});
export type ContractSupplement = z.infer<typeof contractSupplementSchema>;
export type ContractFacts = {
  tenantName: string; tenantDateOfBirth: string | null; tenantType: string;
  unitType: string; unitLabel: string; unitAddress: string; areaM2: number | null;
  startDate: string; endDate: string | null; dueDay: number; currency: string;
  rentCents: number; servicesCents: number; depositCents: number;
  depositRateBps: number | null; bankAccount: string | null; variableSymbol: string;
  indexationEnabled: boolean; contractingParties: number; hasScheduledFinanceChanges: boolean;
};
export function contractFactErrors(f: ContractFacts): string[] {
  const errors: string[] = [];
  if(f.tenantType !== "PERSON" || f.unitType !== "APARTMENT" || f.contractingParties !== 1) errors.push("Pilot vyžaduje jednoho nájemce fyzickou osobu a byt.");
  if(!f.endDate || f.endDate <= f.startDate) errors.push("Pilot vyžaduje dobu určitou se začátkem před koncem.");
  if(f.endDate) {
    const anniversary = new Date(`${f.startDate}T12:00:00Z`); anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
    if(f.endDate >= anniversary.toISOString().slice(0,10)) errors.push("Pilot podporuje dobu určitou nejvýše do jednoho roku včetně posledního dne před výročím.");
  }
  if(f.indexationEnabled || f.hasScheduledFinanceChanges) errors.push("Pilot bez indexace nepodporuje naplánované změny ceny během nájmu.");
  if(f.currency !== "CZK" || f.dueDay < 5 || f.dueDay > 28) errors.push("Pilot vyžaduje CZK a splatnost od 5. do 28. dne měsíce.");
  if(!f.tenantDateOfBirth) errors.push("V evidenci nájemce chybí datum narození.");
  if(!f.areaM2 || f.areaM2 <= 0 || !Number.isFinite(f.areaM2)) errors.push("V jednotce chybí platná plocha.");
  if(!f.bankAccount) errors.push("Ve smlouvě chybí bankovní účet.");
  for(const amount of [f.rentCents,f.servicesCents,f.depositCents]) if(!Number.isSafeInteger(amount) || amount < 0) errors.push("Neplatná částka v evidenci.");
  if(f.rentCents <= 0 || f.depositCents > f.rentCents * 3) errors.push("Zkontrolujte nájemné a limit jistoty.");
  if(f.depositCents > 0 && f.depositRateBps === null) errors.push("Chybí individuální nastavení úroku jistoty účinné při zahájení nájmu.");
  if(f.depositRateBps !== null && (!Number.isSafeInteger(f.depositRateBps) || f.depositRateBps < 0)) errors.push("Neplatná individuální sazba jistoty.");
  return [...new Set(errors)];
}
const number = (v: number) => v.toLocaleString("cs-CZ", {maximumFractionDigits:2});
const date = (v: string) => new Date(`${v}T12:00:00Z`).toLocaleDateString("cs-CZ", {timeZone:"UTC"});
export function buildContract(f: ContractFacts, raw: unknown) {
  const errors = contractFactErrors(f); if(errors.length) throw new Error(errors.join(" "));
  const s = contractSupplementSchema.parse(raw);
  const servicesCents = s.services.reduce((sum,x) => sum+x.amountCents,0);
  if(servicesCents !== f.servicesCents) throw new Error("Součet rozpisu záloh se neshoduje s evidencí smlouvy.");
  if(new Set(s.services.map(x=>x.name.toLocaleLowerCase("cs-CZ"))).size !== s.services.length) throw new Error("Služby se v rozpisu opakují.");
  if(f.depositCents > 0 && !s.depositDueDate) throw new Error("Doplňte splatnost jistoty.");
  if(s.handoverDate < f.startDate || s.handoverDate > f.endDate!) throw new Error("Předání musí spadat do doby nájmu.");
  const replacements: Record<string,string> = {
    "jméno nebo název":s.landlordName, "datum narození nebo IČO":`${s.landlordKind === "COMPANY" ? "IČO" : "datum narození"} ${s.landlordId}`,
    "bydliště nebo sídlo":s.landlordAddress, "e-mail pronajímatele":s.landlordEmail, "telefon pronajímatele":s.landlordPhone,
    "podepisující osoba a oprávnění":s.representative, "jméno a příjmení nájemce":f.tenantName,
    "datum narození nájemce":date(f.tenantDateOfBirth!), "bydliště nájemce":s.tenantAddress,
    "doručovací adresa nájemce":s.tenantDeliveryAddress, "e-mail nájemce":s.tenantEmail, "telefon nájemce":s.tenantPhone,
    "jméno nebo název správce":s.managerName, "e-mail správce":s.managerEmail, "telefon správce":s.managerPhone,
    "adresa bytu":f.unitAddress, "označení bytu":f.unitLabel, "podlaží a umístění":s.floor, "dispozice":s.disposition,
    "plocha":number(f.areaM2!), "příslušenství a rozsah užívání":s.accessories,
    "jednotka nebo budova a parcela, katastrální území, LV":s.cadastralId,
    "počátek nájmu":date(f.startDate), "konec nájmu":date(f.endDate!), "datum předání":date(s.handoverDate),
    "nájemné":number(f.rentCents/100), "zálohy celkem":number(servicesCents/100), "platba celkem":number((f.rentCents+servicesCents)/100),
    "den splatnosti":String(f.dueDay), "účet":f.bankAccount!, "variabilní symbol":f.variableSymbol,
    "jistota":number(f.depositCents/100), "datum splatnosti jistoty":s.depositDueDate ? date(s.depositDueDate) : "nesjednána",
    "úrok jistoty":number((f.depositRateBps || 0)/100), "datum první platby":date(s.firstPaymentDate),
    "přímé energie":s.directEnergy, "počet osob":String(s.peopleCount), "seznam skutečně připojených příloh":s.attachments,
  };
  const replace = (value: string) => value.replace(/\[([^\]]+)\]/g,(_,key:string) => {
    if(!(key in replacements)) throw new Error(`Neznámé pole vzoru: ${key}`); return replacements[key];
  });
  const sections = template.sections.map(section => ({title:section.title, paragraphs:section.paragraphs.map(p => {
    if(p.startsWith("4.1 ")) return s.services.length
      ? `4.1 Pronajímatel zajišťuje tyto služby s měsíčními zálohami: ${s.services.map(x=>`${x.name} ${number(x.amountCents/100)} Kč`).join(", ")}. Součet měsíčních záloh činí ${number(servicesCents/100)} Kč. Počet osob rozhodných pro rozúčtování při zahájení nájmu je ${s.peopleCount}.`
      : `4.1 Pronajímatel nezajišťuje služby hrazené měsíčními zálohami. Součet měsíčních záloh činí 0 Kč. Počet osob rozhodných pro rozúčtování při zahájení nájmu je ${s.peopleCount}.`;
    if(p.startsWith("1.2 ")) {
      p = p.replace("Je-li pronajímatelem společnost, doplní se její zápis v rejstříku a způsob jednání.",s.landlordKind === "COMPANY" ? s.landlordRegistration : "");
      if(!s.managerName) p = p.replace(/Správce \[jméno nebo název správce\].*$/, "Provozní správce není sjednán. Provozní komunikaci, evidenci plateb, hlášení závad a organizaci předání zajišťuje pronajímatel.");
    }
    if(f.depositCents === 0 && p.startsWith("5.1 ")) return "5.1 Jistota se nesjednává. Nájemci nevzniká povinnost jistotu poskytovat ani doplňovat.";
    if(f.depositCents === 0 && p.startsWith("5.2 ")) return "5.2 Ujednání o čerpání a doplňování jistoty se při nulové jistotě neuplatní.";
    if(f.depositCents === 0 && p.startsWith("5.3 ")) return "5.3 Při nulové jistotě úrok nevzniká. Pokud strany jistotu později sjednají dodatkem, zachovají zákonný nárok nájemce na úrok podle § 2254 odst. 2 ve spojení s § 1802 občanského zákoníku.";
    return replace(p).replace(/ +/g," ");
  })}));
  const tables = template.tables.slice(0,3).map((table,i) => table.map(row=>row.map(cell => {
    if(i === 0 && row[0] === "Správce" && !s.managerName) return cell === "Správce" ? cell : "Není sjednán; provozní kontakt je pronajímatel.";
    if(i === 2 && row[0] === "Jistota a její splatnost" && f.depositCents === 0) return cell === row[0] ? cell : "0 Kč • jistota se nesjednává";
    if(i === 2 && row[0] === "Úročení jistoty" && f.depositCents === 0) return cell === row[0] ? cell : "Při nulové jistotě se neuplatní";
    return replace(cell);
  })));
  const model = {title:template.title,intro:template.intro,tables,sections,
    services:s.services.map(x=>[x.name,`${number(x.amountCents/100)} Kč`]),
    coverNote:replace(template.coverNote),signingLine:`V ${s.signingPlace} dne ${date(s.signingDate)}`,
    landlord:s.landlordName,representative:s.representative,tenant:f.tenantName,source:template.source};
    const strings = [model.title,model.intro,model.coverNote,model.signingLine,...model.tables.flat(2),...model.sections.flatMap(x=>[x.title,...x.paragraphs])];
    if(strings.some(x=>/[\[\]]/.test(x))) throw new Error("Náhled obsahuje nevyplněné pole.");
  return model;
}
export type LeaseContractModel = ReturnType<typeof buildContract>;
