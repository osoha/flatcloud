import { randomUUID } from "node:crypto";
export function OwnershipTransferFields({ currentOwnerId, currentAccountId, payment = false }: { currentOwnerId: string; currentAccountId?: string | null; payment?: boolean }) {
  const today = new Intl.DateTimeFormat("sv-SE", {timeZone:"Europe/Prague"}).format(new Date());
  return <>
    <input type="hidden" name="requestId" value={randomUUID()}/>
    <input type="hidden" name="expectedOwnerId" value={currentOwnerId}/>
    <input type="hidden" name="expectedAccountId" value={currentAccountId||""}/>
    {payment && <input type="hidden" name="mode" value="payment-recipient"/>}
    <label className="field"><span>Datum účinnosti</span><input name="effectiveAt" type="date" defaultValue={today} max={today} min={payment?today:undefined} required/></label>
    {!payment && <label className="field"><span>Původní vlastnictví od</span><input name="previousValidFrom" type="date" max={today}/><small>Doplňte doložený počátek, pokud dosud není potvrzen v historii. Datum založení v aplikaci se za počátek vlastnictví nepovažuje. Budoucí převod potvrďte až v den účinnosti.</small></label>}
    <label className="field field-full"><span>Důvod a podklad změny</span><textarea name="reason" required maxLength={4000}/></label>
    <label className="checkbox-field"><input type="checkbox" name="confirm" required/><span>{payment ? "Potvrzuji změnu příjemce plateb pro jednotku a její dosud neskončené smlouvy." : "Potvrzuji vlastníka a doložená data účinnosti. Historie zůstane zachována; účty smluv ani přístupy se tím nemění."}</span></label>
    <button className="primary" type="submit">{payment?"Potvrdit příjemce plateb":"Potvrdit převod vlastníka"}</button>
  </>;
}
