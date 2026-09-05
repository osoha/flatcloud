"use client";

import { useMemo, useState } from "react";

type Option = [string, string];
type OwnerAccountOption = { id: string; label: string } | null;

type Props = {
  unitOptions: Option[];
  tenantOptions?: Option[];
  defaultUnitId?: string;
  defaultTenantId?: string;
  defaultContractingPartyIds?: string[];
  defaultPayerPartyIds?: string[];
  defaultContactPartyIds?: string[];
  defaultGuarantorPartyIds?: string[];
  defaultContractNumber?: string | null;
  defaultStartDate: string;
  defaultEndDate?: string;
  defaultDueDay?: number;
  defaultRentTiming?: string;
  defaultVariableSymbol?: string;
  defaultTenantBankAccount?: string | null;
  proposals?: Record<string, string | null>;
  contractNumberProposals?: Record<string, string | null>;
  ownerAccountsByUnit?: Record<string, OwnerAccountOption>;
  tenantAccountsByTenant?: Record<string, string[]>;
  showGenerateCharges?: boolean;
  defaultAutoChargesEnabled?: boolean;
  defaultIndexationEnabled?: boolean;
  defaultIndexationPercent?: number | string | null;
  showFinancialOnboarding?: boolean;
  currentBusinessPeriod?: string;
  defaultDeposit?: number | string;
};

export function LeaseCoreFields({ unitOptions, tenantOptions, defaultUnitId, defaultTenantId, defaultContractingPartyIds = [], defaultPayerPartyIds = [], defaultContactPartyIds = [], defaultGuarantorPartyIds = [], defaultContractNumber, defaultStartDate, defaultEndDate = "", defaultDueDay = 5, defaultRentTiming = "ADVANCE", defaultVariableSymbol = "", defaultTenantBankAccount = "", proposals = {}, contractNumberProposals = {}, ownerAccountsByUnit = {}, tenantAccountsByTenant = {}, showGenerateCharges = false, defaultAutoChargesEnabled = true, defaultIndexationEnabled = false, defaultIndexationPercent = "", showFinancialOnboarding = false, currentBusinessPeriod = "", defaultDeposit = "" }: Props) {
  const initialUnit = defaultUnitId || unitOptions[0]?.[0] || "";
  const initialTenant = defaultTenantId || tenantOptions?.[0]?.[0] || "";
  const [unitId, setUnitId] = useState(initialUnit);
  const [tenantId, setTenantId] = useState(initialTenant);
  const [additionalPartyIds, setAdditionalPartyIds] = useState(() => new Set(defaultContractingPartyIds.filter((id) => id !== initialTenant)));
  const [termType, setTermType] = useState(defaultEndDate ? "FIXED" : "INDEFINITE");
  const initialVs = defaultVariableSymbol || proposals[initialUnit] || "";
  const [variableSymbol, setVariableSymbol] = useState(initialVs);
  const initialContractNumber = defaultContractNumber || contractNumberProposals[initialUnit] || "";
  const [contractNumber, setContractNumber] = useState(initialContractNumber);
  const [tenantBankAccount, setTenantBankAccount] = useState(defaultTenantBankAccount || tenantAccountsByTenant[initialTenant]?.[0] || "");
  const [indexationEnabled, setIndexationEnabled] = useState(defaultIndexationEnabled);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [openingBalanceType, setOpeningBalanceType] = useState("ZERO");
  const [deposit, setDeposit] = useState(String(defaultDeposit));
  const [openingDepositStatus, setOpeningDepositStatus] = useState("NOT_FUNDED");
  const historicalOnboarding = showFinancialOnboarding && Boolean(currentBusinessPeriod && startDate.slice(0, 7) < currentBusinessPeriod);
  const proposed = useMemo(() => proposals[unitId] || "", [proposals, unitId]);
  const ownerAccount = ownerAccountsByUnit[unitId] || null;
  const knownTenantAccounts = tenantAccountsByTenant[tenantId] || [];

  function changeUnit(next: string) {
    const priorProposal = proposals[unitId] || "";
    const priorContractProposal = contractNumberProposals[unitId] || "";
    setUnitId(next);
    if (!variableSymbol || variableSymbol === priorProposal) setVariableSymbol(proposals[next] || "");
    if (!contractNumber || contractNumber === priorContractProposal) setContractNumber(contractNumberProposals[next] || "");
  }

  function changeTenant(next: string) {
    const priorKnown = tenantAccountsByTenant[tenantId] || [];
    setTenantId(next);
    setAdditionalPartyIds((current) => {
      const updated = new Set(current);
      updated.delete(next);
      return updated;
    });
    if (!tenantBankAccount || tenantBankAccount === priorKnown[0]) setTenantBankAccount(tenantAccountsByTenant[next]?.[0] || "");
  }

  return <>
    <label className="field"><span>Jednotka *</span><select name="unitId" value={unitId} onChange={(event) => changeUnit(event.target.value)} required>{unitOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    {tenantOptions && <label className="field"><span>Hlavní smluvní strana *</span><select name="tenantId" value={tenantId} onChange={(event) => changeTenant(event.target.value)} required>{tenantOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><small>Hlavní strana se používá jako výchozí kontakt a plátce. Další smluvní partnery vyberte níže.</small></label>}
    {tenantOptions && <fieldset className="field field-full lease-party-picker"><legend>Osoby a role ve smlouvě</legend><p>Hlavní strana je automaticky smluvní stranou, primárním plátcem i kontaktem. U dalších osob určete jejich skutečnou roli; jeden člověk může mít více rolí.</p><div className="lease-party-role-list">{tenantOptions.filter(([value]) => value !== tenantId).map(([value, label]) => <div className="lease-party-role-row" key={value}><strong>{label}</strong><div><label className="checkbox-field"><input type="checkbox" name="contractingPartyIds" value={value} checked={additionalPartyIds.has(value)} onChange={(event) => setAdditionalPartyIds((current) => { const updated = new Set(current); if (event.target.checked) updated.add(value); else updated.delete(value); return updated; })}/><span>Smluvní strana</span></label><label className="checkbox-field"><input type="checkbox" name="payerPartyIds" value={value} defaultChecked={defaultPayerPartyIds.includes(value)}/><span>Plátce</span></label><label className="checkbox-field"><input type="checkbox" name="contactPartyIds" value={value} defaultChecked={defaultContactPartyIds.includes(value)}/><span>Kontakt</span></label><label className="checkbox-field"><input type="checkbox" name="guarantorPartyIds" value={value} defaultChecked={defaultGuarantorPartyIds.includes(value)}/><span>Ručitel</span></label></div></div>)}</div>{tenantOptions.length < 2 && <small>Založte nejprve druhý samostatný profil nájemníka. Není kvůli tomu nutné vytvářet další smlouvu.</small>}<small>Osobu, která v jednotce pouze bydlí a nemá smluvní odpovědnost, evidujte v sekci Obyvatelé.</small></fieldset>}
    <label className="field"><span>Účet vlastníka pro úhrady *</span><input value={ownerAccount?.label || "U jednotky není vybraný platební účet"} readOnly/><input type="hidden" name="ownerBankAccountId" value={ownerAccount?.id || ""}/><small>Účet se přebírá z vlastnictví vybrané jednotky a použije se v předpisech i QR platbě.</small></label>
    <label className="field"><span>Účet nájemníka ve smlouvě</span><input name="tenantBankAccount" list="tenant-bank-accounts" value={tenantBankAccount} onChange={(event) => setTenantBankAccount(event.target.value)} placeholder="IBAN nebo číslo účtu plátce"/><datalist id="tenant-bank-accounts">{knownTenantAccounts.map((account) => <option value={account} key={account}/>)}</datalist><small>Použije se pro první automatické párování příchozí platby.</small></label>
    <label className="field"><span>Číslo smlouvy</span><input name="contractNumber" value={contractNumber} onChange={(event) => setContractNumber(event.target.value)}/><small>{contractNumberProposals[unitId] ? `Automatický návrh podle stabilního ID nemovitosti, jednotky a pořadí vztahu: ${contractNumberProposals[unitId]}` : "Číslo smlouvy lze zadat ručně."}</small></label>
    <label className="field"><span>Doba trvání *</span><select name="termType" value={termType} onChange={(event) => setTermType(event.target.value)}><option value="FIXED">Na dobu určitou</option><option value="INDEFINITE">Na dobu neurčitou</option></select></label>
    <label className="field"><span>Platnost od *</span><input name="startDate" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required/></label>
    {termType === "FIXED" && <label className="field"><span>Platnost do *</span><input name="endDate" type="date" defaultValue={defaultEndDate} required/></label>}
    <div className="field notice"><strong>Stav smlouvy se určuje automaticky</strong><span>Budoucí / Aktivní / Ukončená se vypočítá z platnosti smlouvy a případného ukončení.</span></div>
    <label className="field"><span>Den splatnosti *</span><input name="dueDay" type="number" min={1} max={31} defaultValue={defaultDueDay} required/></label>
    <label className="field"><span>Způsob placení</span><select name="rentTiming" defaultValue={defaultRentTiming}><option value="ADVANCE">Dopředné – v daném měsíci</option><option value="ARREARS">Zpětné – v následujícím měsíci</option></select></label>
    <label className="field"><span>Variabilní symbol *</span><input name="variableSymbol" inputMode="numeric" pattern="[0-9]{1,10}" maxLength={10} value={variableSymbol} onChange={(event) => setVariableSymbol(event.target.value.replace(/\D/g, "").slice(0, 10))} required/><small>{proposed ? `Automatický návrh podle stabilního ID nemovitosti, jednotky a pořadí vztahu: ${proposed}` : "VS musí být číselný a historicky unikátní na stejném příjmovém účtu vlastníka."}</small></label>
    <label className="field"><span>Kauce Kč</span><input name="deposit" type="number" step="0.01" min="0" value={deposit} onChange={(event) => setDeposit(event.target.value)}/></label>
    <label className="field"><span>Úrok kauce % p.a.</span><input name="depositInterest" type="number" step="0.01" min="0" max="100" defaultValue="0"/><small>0 % je povolená smluvní/evidenční sazba.</small></label>
    {historicalOnboarding && <div className="field field-full automation-box historical-onboarding"><h3>Převzetí existující smlouvy</h3><p className="muted-copy">Smlouva začala před zahájením evidence ve FlatCloudu. Zvolte, od kterého měsíce má FlatCloud evidovat předpisy a jaké bylo saldo při převzetí.</p><label className="field"><span>Finanční evidence od</span><input name="financialTrackingFromPeriod" type="month" defaultValue={currentBusinessPeriod} min={startDate.slice(0, 7)} required/></label><fieldset><legend>Počáteční stav</legend>{[["ZERO","Bez nedoplatku a bez přeplatku"],["DEBT","Nedoplatek"],["OVERPAYMENT","Přeplatek"]].map(([value,label])=><label className="checkbox-field" key={value}><input type="radio" name="openingBalanceType" value={value} checked={openingBalanceType===value} onChange={()=>setOpeningBalanceType(value)}/><span>{label}</span></label>)}</fieldset>{openingBalanceType!=="ZERO"&&<><label className="field"><span>Částka Kč</span><input name="openingBalanceAmount" type="number" step="0.01" min="0.01" required/></label><label className="field"><span>Poznámka k převzetí</span><input name="openingBalanceNote" placeholder="Volitelný původ nebo vysvětlení salda"/></label></>}{Number(deposit)>0&&<fieldset><legend>Stav kauce při převzetí</legend>{[["NOT_FUNDED","Kauce není složena"],["FULLY_FUNDED","Kauce je složena v plné výši"],["PARTIAL","Kauce je složena částečně"]].map(([value,label])=><label className="checkbox-field" key={value}><input type="radio" name="openingDepositStatus" value={value} checked={openingDepositStatus===value} onChange={()=>setOpeningDepositStatus(value)}/><span>{label}</span></label>)}{openingDepositStatus==="PARTIAL"&&<label className="field"><span>Držená částka Kč</span><input name="openingDepositHeldAmount" type="number" step="0.01" min="0.01" max={deposit} required/></label>}</fieldset>}</div>}
    {showGenerateCharges && <div className="field field-full automation-box"><h3>Automatizace předpisů</h3><label className="checkbox-field"><input type="checkbox" name="autoChargesEnabled" defaultChecked={defaultAutoChargesEnabled}/><span>{termType === "FIXED" ? "Automaticky vytvořit a udržovat předpisy na celé období smlouvy" : "Automaticky vytvářet předpisy 12 měsíců dopředu"}</span></label><small>FlatCloud doplní předpisy při založení i prodloužení smlouvy a změny budoucích částek promítne bez zásahu do uhrazené historie.</small><label className="checkbox-field"><input type="checkbox" name="indexationEnabled" checked={indexationEnabled} onChange={(event) => setIndexationEnabled(event.target.checked)}/><span>Automatická pevná procentní indexace nájemného při výročí smlouvy</span></label>{indexationEnabled && <label className="field automation-percent"><span>Roční indexace %</span><input name="indexationPercent" type="number" step="0.01" min="0.01" max="100" defaultValue={defaultIndexationPercent ?? ""} required/><small>Např. 5 znamená navýšení nájemného o 5 % při každém výročí smlouvy.</small></label>}</div>}
  </>;
}
