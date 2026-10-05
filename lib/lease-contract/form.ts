import {contractSupplementSchema} from "./model";

export function supplementFromForm(form:FormData) {
  const fields:Record<string,unknown>={};
  for(const [key,value] of form.entries()) if(typeof value === "string") fields[key]=value;
  const names=form.getAll("serviceName"),amounts=form.getAll("serviceAmount");
  if(names.length !== amounts.length) throw new Error("Neplatný rozpis služeb.");
  fields.services=names.map((name,index)=>{
    const raw=String(amounts[index]).trim().replace(",",".");
    if(!String(name).trim() && !raw) return null;
    if(!/^\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error("Záloha musí být nezáporná částka s nejvýše dvěma desetinnými místy.");
    return {name:String(name),amountCents:Math.round(Number(raw)*100)};
  }).filter(Boolean);
  fields.peopleCount=String(form.get("peopleCount")||"").trim() ? Number(form.get("peopleCount")) : NaN;
  fields.depositDueDate=String(form.get("depositDueDate")||"").trim() || null;
  fields.confirmedTestRecord=form.get("confirmedTestRecord")==="on";
  return contractSupplementSchema.parse(fields);
}
