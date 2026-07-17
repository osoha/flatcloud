"use client";

import { useState } from "react";

type TenantDefaults = {
  type?: "PERSON" | "COMPANY";
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  ico?: string | null;
  permanentAddress?: string | null;
  correspondenceAddress?: string | null;
  billingAddress?: string | null;
  billingEmail?: string | null;
  communicationEmail?: string | null;
  note?: string | null;
};

export function TenantFields({ defaults = {}, typeName = "tenantType", noteName = "tenantNote" }: { defaults?: TenantDefaults; typeName?: string; noteName?: string }) {
  const [type, setType] = useState<"PERSON" | "COMPANY">(defaults.type || "PERSON");
  return <>
    <label className="field"><span>Typ nájemníka *</span><select name={typeName} value={type} onChange={(event) => setType(event.target.value as "PERSON" | "COMPANY")}><option value="PERSON">Fyzická osoba</option><option value="COMPANY">Právnická osoba</option></select></label>
    <label className="field"><span>{type === "COMPANY" ? "Název firmy" : "Jméno a příjmení"} *</span><input name="name" defaultValue={defaults.name || ""} required/></label>
    {type === "PERSON" ? <>
      <label className="field"><span>E-mail</span><input name="email" type="email" defaultValue={defaults.email || ""}/></label>
      <label className="field"><span>Telefon</span><input name="phone" defaultValue={defaults.phone || ""}/></label>
      <label className="field field-full"><span>Adresa trvalého pobytu</span><input name="permanentAddress" defaultValue={defaults.permanentAddress || ""}/></label>
      <label className="field field-full"><span>Korespondenční adresa</span><input name="correspondenceAddress" defaultValue={defaults.correspondenceAddress || ""} placeholder="Nevyplňujte, pokud je shodná s trvalou adresou"/></label>
    </> : <>
      <label className="field"><span>IČO</span><input name="ico" inputMode="numeric" defaultValue={defaults.ico || ""}/></label>
      <label className="field"><span>Telefon</span><input name="phone" defaultValue={defaults.phone || ""}/></label>
      <label className="field field-full"><span>Fakturační adresa</span><input name="billingAddress" defaultValue={defaults.billingAddress || ""}/></label>
      <label className="field field-full"><span>Korespondenční adresa</span><input name="correspondenceAddress" defaultValue={defaults.correspondenceAddress || ""} placeholder="Nevyplňujte, pokud je shodná s fakturační adresou"/></label>
      <label className="field"><span>Fakturační e-mail</span><input name="billingEmail" type="email" defaultValue={defaults.billingEmail || ""}/></label>
      <label className="field"><span>Komunikační e-mail</span><input name="communicationEmail" type="email" defaultValue={defaults.communicationEmail || defaults.email || ""}/></label>
    </>}
    <label className="field field-full"><span>Poznámka ke kontaktu</span><textarea name={noteName} defaultValue={defaults.note || ""}/></label>
  </>;
}
