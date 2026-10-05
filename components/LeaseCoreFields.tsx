"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Option = [string, string];
type OwnerAccountOption = { id: string; label: string } | null;
type LandlordChoice = { id: string; name: string; account: OwnerAccountOption };

type Props = {
  unitOptions: Option[];
  tenantCreators?: Record<string, string | null>;
  currentUserId?: string;
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
  ownersByUnit?: Record<string, { id: string; name: string } | null>;
  ownerAccountsByUnit?: Record<string, OwnerAccountOption>;
  landlordChoicesByUnit?: Record<string, LandlordChoice[]>;
  tenantAccountsByTenant?: Record<string, string[]>;
  showGenerateCharges?: boolean;
  defaultAutoChargesEnabled?: boolean;
  defaultIndexationEnabled?: boolean;
  defaultIndexationPercent?: number | string | null;
  showFinancialOnboarding?: boolean;
  currentBusinessPeriod?: string;
  defaultDeposit?: number | string;
  defaultDepositInterest?: number | string;
  propertyId?: string;
};

export function LeaseCoreFields({ tenantCreators = {}, currentUserId, unitOptions, tenantOptions, defaultUnitId, defaultTenantId, defaultContractingPartyIds = [], defaultPayerPartyIds = [], defaultContactPartyIds = [], defaultGuarantorPartyIds = [], defaultContractNumber, defaultStartDate, defaultEndDate = "", defaultDueDay = 5, defaultRentTiming = "ADVANCE", defaultVariableSymbol = "", defaultTenantBankAccount = "", proposals = {}, contractNumberProposals = {}, ownersByUnit = {}, ownerAccountsByUnit = {}, landlordChoicesByUnit, tenantAccountsByTenant = {}, showGenerateCharges = false, defaultAutoChargesEnabled = true, defaultIndexationEnabled = false, defaultIndexationPercent = "", showFinancialOnboarding = false, currentBusinessPeriod = "", defaultDeposit = "", defaultDepositInterest = "0", propertyId }: Props) {
  const tenantSelectRef = useRef<HTMLSelectElement>(null);
  const router = useRouter();
  useEffect(() => {
    const refresh = () => router.refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [router]);
  const initialUnit = defaultUnitId || unitOptions[0]?.[0] || "";
  const initialTenant = defaultTenantId || "";
  const [unitId, setUnitId] = useState(initialUnit);
  const [landlordOwnerId, setLandlordOwnerId] = useState(landlordChoicesByUnit?.[initialUnit]?.length === 1 ? landlordChoicesByUnit[initialUnit][0].id : "");
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
  const [tenantScope, setTenantScope] = useState(currentUserId ? "MINE" : "AVAILABLE");
  const [partySearch, setPartySearch] = useState("");
  const [selectedPartyIds, setSelectedPartyIds] = useState(() => new Set([...defaultContractingPartyIds, ...defaultPayerPartyIds, ...defaultContactPartyIds, ...defaultGuarantorPartyIds].filter(id => id !== initialTenant)));
  useEffect(() => {
    const restoreParties = (event: Event) => {
      const { form, draft } = (event as CustomEvent<{ form: HTMLFormElement; draft: Record<string, string | boolean> }>).detail;
      if (tenantSelectRef.current?.form !== form) return;
      const primary = typeof draft.tenantId === "string" ? draft.tenantId : initialTenant;
      const allowed = new Set((tenantOptions || []).map(([id]) => id));
      const selected = new Set<string>();
      const contracting = new Set<string>();
      for (const [key, checked] of Object.entries(draft)) {
        const [role, id] = key.split(":");
        if (checked !== true || id === primary || !allowed.has(id)) continue;
        if (["contractingPartyIds", "payerPartyIds", "contactPartyIds", "guarantorPartyIds"].includes(role)) selected.add(id);
        if (role === "contractingPartyIds") contracting.add(id);
      }
      if (typeof draft.unitId === "string" && unitOptions.some(([id]) => id === draft.unitId)) setUnitId(draft.unitId);
      if (typeof draft.landlordOwnerId === "string") setLandlordOwnerId(draft.landlordOwnerId);
      if (allowed.has(primary)) setTenantId(primary);
      if (draft.tenantScope === "AVAILABLE" || draft.tenantScope === "MINE") setTenantScope(draft.tenantScope);
      if (typeof draft.tenantBankAccount === "string") setTenantBankAccount(draft.tenantBankAccount);
      if (typeof draft.variableSymbol === "string") setVariableSymbol(draft.variableSymbol);
      if (typeof draft.contractNumber === "string") setContractNumber(draft.contractNumber);
      if (typeof draft.startDate === "string") setStartDate(draft.startDate);
      if (typeof draft.deposit === "string") setDeposit(draft.deposit);
      if (draft.termType === "FIXED" || draft.termType === "INDEFINITE") setTermType(draft.termType);
      setIndexationEnabled(draft.indexationEnabled === true);
      for (const value of ["ZERO", "DEBT", "OVERPAYMENT"]) if (draft[`openingBalanceType:${value}`] === true) setOpeningBalanceType(value);
      for (const value of ["NOT_FUNDED", "FULLY_FUNDED", "PARTIAL"]) if (draft[`openingDepositStatus:${value}`] === true) setOpeningDepositStatus(value);
      setSelectedPartyIds(selected);
      setAdditionalPartyIds(contracting);
    };
    window.addEventListener("flatberry:restore-form-draft", restoreParties);
    return () => window.removeEventListener("flatberry:restore-form-draft", restoreParties);
  }, [tenantOptions, unitOptions, initialTenant]);
  const primaryTenantOptions = tenantOptions?.filter(([id]) => tenantScope === "AVAILABLE" || tenantCreators[id] === currentUserId || id === tenantId) || [];
  const historicalOnboarding = showFinancialOnboarding && Boolean(currentBusinessPeriod && startDate.slice(0, 7) < currentBusinessPeriod);
  const proposed = useMemo(() => proposals[unitId] || "", [proposals, unitId]);
  const landlordChoices = landlordChoicesByUnit?.[unitId] || [];
  const selectedLandlord = landlordChoices.length === 1 ? landlordChoices[0] : landlordChoices.find(owner => owner.id === landlordOwnerId);
  const unitOwner = selectedLandlord || ownersByUnit[unitId];
  const ownerAccount = landlordChoicesByUnit ? selectedLandlord?.account || null : ownerAccountsByUnit[unitId] || null;
  const knownTenantAccounts = tenantAccountsByTenant[tenantId] || [];
  const visiblePartyOptions = tenantOptions?.filter(([value, label]) => value !== tenantId && (!partySearch.trim() || label.toLocaleLowerCase("cs").includes(partySearch.trim().toLocaleLowerCase("cs")))) || [];

  function changeUnit(next: string) {
    const priorProposal = proposals[unitId] || "";
    const priorContractProposal = contractNumberProposals[unitId] || "";
    setUnitId(next);
    setLandlordOwnerId(landlordChoicesByUnit?.[next]?.length === 1 ? landlordChoicesByUnit[next][0].id : "");
    if (!variableSymbol || variableSymbol === priorProposal) setVariableSymbol(proposals[next] || "");
    if (!contractNumber || contractNumber === priorContractProposal) setContractNumber(contractNumberProposals[next] || "");
  }

  function changeTenant(next: string) {
    setTenantId(next);
    setAdditionalPartyIds((current) => {
      const updated = new Set(current);
      updated.delete(next);
      return updated;
    });
    setTenantBankAccount(tenantAccountsByTenant[next]?.[0] || "");
    setSelectedPartyIds(current => new Set([...current].filter(id => id !== next)));
  }

  return <>
    <label className="field"><span>Jednotka *</span><select name="unitId" value={unitId} onChange={(event) => changeUnit(event.target.value)} required>{unitOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    {tenantOptions && currentUserId && <label className="field"><span>Výběr nájemníků</span><select name="tenantScope" value={tenantScope} onChange={event => setTenantScope(event.target.value)}><option value="MINE">Moji založení nájemníci</option><option value="AVAILABLE">Všechny dostupné profily</option></select><small>Starší profily bez doloženého autora najdete mezi dostupnými profily.</small></label>}
    {tenantOptions && <label className="field"><span>Hlavní smluvní strana *</span><select ref={tenantSelectRef} name="tenantId" value={tenantId} onChange={(event) => changeTenant(event.target.value)} required><option value="">Vyberte nájemníka</option>{primaryTenantOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><small>Vyberte vlastní nebo dostupný sdílený profil. Hlavní strana se používá jako výchozí kontakt a plátce.</small>{propertyId && <Link href={`/nemovitosti/${propertyId}/najemnici/novy`} target="_blank" rel="noreferrer">Založit nového nájemníka v nové kartě →</Link>}<button className="secondary" type="button" onClick={() => router.refresh()}>Načíst nově založené profily</button></label>}
    {tenantOptions && <fieldset className="field field-full lease-party-picker"><legend>Osoby a role ve smlouvě</legend><p>Hlavní strana je při nové smlouvě automaticky smluvní stranou, primárním plátcem i kontaktem. Při editaci zůstávají existující role zachovány. U dalších osob určete jejich skutečnou roli.</p>{tenantOptions.length > 4 && <label className="scope-search"><span className="sr-only">Hledat další smluvní osobu</span><input value={partySearch} onChange={(event) => setPartySearch(event.target.value)} placeholder="Najít osobu v této nemovitosti…"/></label>}<label className="field"><span>Přidat osobu do smlouvy</span><select value="" onChange={event => { const value = event.target.value; if (value) setSelectedPartyIds(current => new Set([...current, value])); }}><option value="">Vyberte profil pro další roli</option>{visiblePartyOptions.filter(([value]) => !selectedPartyIds.has(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="lease-party-role-list">{(tenantOptions || []).filter(([value]) => value !== tenantId && selectedPartyIds.has(value)).map(([value, label]) => <div className="lease-party-role-row" key={value}><strong>{label}</strong><button type="button" className="secondary" onClick={() => { setSelectedPartyIds(current => new Set([...current].filter(id => id !== value))); setAdditionalPartyIds(current => new Set([...current].filter(id => id !== value))); }}>Odebrat osobu ze smlouvy</button><div><label className="checkbox-field"><input type="checkbox" name="contractingPartyIds" value={value} checked={additionalPartyIds.has(value)} onChange={(event) => setAdditionalPartyIds((current) => { const updated = new Set(current); if (event.target.checked) updated.add(value); else updated.delete(value); return updated; })}/><span>Smluvní strana</span></label><label className="checkbox-field"><input type="checkbox" name="payerPartyIds" value={value} defaultChecked={defaultPayerPartyIds.includes(value)}/><span>Plátce</span></label><label className="checkbox-field"><input type="checkbox" name="contactPartyIds" value={value} defaultChecked={defaultContactPartyIds.includes(value)}/><span>Kontakt</span></label><label className="checkbox-field"><input type="checkbox" name="guarantorPartyIds" value={value} defaultChecked={defaultGuarantorPartyIds.includes(value)}/><span>Ručitel</span></label></div></div>)}</div>{tenantOptions.length < 2 && <small>Založte nejprve druhý samostatný profil nájemníka. Není kvůli tomu nutné vytvářet další smlouvu.</small>}<small>Osobu, která v jednotce pouze bydlí a nemá smluvní odpovědnost, evidujte v sekci Obyvatelé.</small></fieldset>}
    {landlordChoicesByUnit && (landlordChoices.length === 1 ? <div className="field notice"><strong>Smluvní pronajímatel</strong><span>{landlordChoices[0].name} · převzato z vlastníka jednotky</span><input type="hidden" name="landlordOwnerId" value={landlordChoices[0].id}/></div> : <label className="field"><span>Smluvní pronajímatel *</span><select name="landlordOwnerId" value={landlordOwnerId} onChange={event => setLandlordOwnerId(event.target.value)} required><option value="">Vyberte vlastníka jednotky uvedeného ve smlouvě</option>{landlordChoices.map(owner => <option value={owner.id} key={owner.id}>{owner.name}</option>)}</select><small>Pronajímatel a jeho účet se uloží společně se smlouvou; další potvrzení nebude potřeba.</small></label>)}
    {ownerAccount ? <label className="field"><span>Účet vlastníka pro úhrady *</span><input value={ownerAccount.label} readOnly/><input type="hidden" name="ownerBankAccountId" value={ownerAccount.id}/><small>Účet se přebírá z vlastnictví vybrané jednotky a použije se v předpisech i QR platbě.</small></label> : <div className="field form-error missing-owner-account" role="alert"><strong>Nejprve nastavte účet vlastníka jednotky{unitOwner ? ` · ${unitOwner.name}` : ""}</strong><span>Účet musí být uložen u vlastníka a potvrzen jako příjemce plateb této jednotky. Vyplněná data zůstanou ve formuláři.</span>{propertyId && unitId && <Link href={`/nemovitosti/${propertyId}/jednotky/${unitId}/upravit#prijemce-plateb`} target="_blank" rel="noreferrer">Nastavit příjemce plateb jednotky v nové kartě →</Link>}<button className="secondary" type="button" onClick={() => router.refresh()}>Znovu načíst účet vlastníka</button><select aria-label="Účet vlastníka pro úhrady" value="" onChange={() => undefined} required><option value="">Účet není nastaven</option></select></div>}
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
    <label className="field"><span>Úrok kauce % p.a.</span><input name="depositInterest" type="number" step="0.01" min="0" max="100" defaultValue={defaultDepositInterest}/><small>0 % je povolená smluvní/evidenční sazba.</small></label>
    {historicalOnboarding && <div className="field field-full automation-box historical-onboarding"><h3>Převzetí existující smlouvy</h3><p className="muted-copy">Smlouva začala před zahájením evidence ve FlatBerry. Zvolte, od kterého měsíce má FlatBerry evidovat předpisy a jaké bylo saldo při převzetí.</p><label className="field"><span>Finanční evidence od</span><input name="financialTrackingFromPeriod" type="month" defaultValue={currentBusinessPeriod} min={startDate.slice(0, 7)} required/></label><fieldset><legend>Počáteční stav</legend>{[["ZERO","Bez nedoplatku a bez přeplatku"],["DEBT","Nedoplatek"],["OVERPAYMENT","Přeplatek"]].map(([value,label])=><label className="checkbox-field" key={value}><input type="radio" name="openingBalanceType" value={value} checked={openingBalanceType===value} onChange={()=>setOpeningBalanceType(value)}/><span>{label}</span></label>)}</fieldset>{openingBalanceType!=="ZERO"&&<><label className="field"><span>Částka Kč</span><input name="openingBalanceAmount" type="number" step="0.01" min="0.01" required/></label><label className="field"><span>Poznámka k převzetí</span><input name="openingBalanceNote" placeholder="Volitelný původ nebo vysvětlení salda"/></label></>}{Number(deposit)>0&&<fieldset><legend>Stav kauce při převzetí</legend>{[["NOT_FUNDED","Kauce není složena"],["FULLY_FUNDED","Kauce je složena v plné výši"],["PARTIAL","Kauce je složena částečně"]].map(([value,label])=><label className="checkbox-field" key={value}><input type="radio" name="openingDepositStatus" value={value} checked={openingDepositStatus===value} onChange={()=>setOpeningDepositStatus(value)}/><span>{label}</span></label>)}{openingDepositStatus==="PARTIAL"&&<label className="field"><span>Držená částka Kč</span><input name="openingDepositHeldAmount" type="number" step="0.01" min="0.01" max={deposit} required/></label>}</fieldset>}</div>}
    {showGenerateCharges && <div className="field field-full automation-box"><h2>Automatizace předpisů</h2><label className="checkbox-field"><input type="checkbox" name="autoChargesEnabled" defaultChecked={defaultAutoChargesEnabled}/><span>{termType === "FIXED" ? "Automaticky vytvořit a udržovat předpisy na celé období smlouvy" : "Automaticky vytvářet předpisy 12 měsíců dopředu"}</span></label><small>FlatBerry doplní předpisy při založení i prodloužení smlouvy a změny budoucích částek promítne bez zásahu do uhrazené historie.</small><label className="checkbox-field"><input type="checkbox" name="indexationEnabled" checked={indexationEnabled} onChange={(event) => setIndexationEnabled(event.target.checked)}/><span>Automatická pevná procentní indexace nájemného při výročí smlouvy</span></label>{indexationEnabled && <label className="field automation-percent"><span>Roční indexace %</span><input name="indexationPercent" type="number" step="0.01" min="0.01" max="100" defaultValue={defaultIndexationPercent ?? ""} required/><small>Např. 5 znamená navýšení nájemného o 5 % při každém výročí smlouvy.</small></label>}</div>}
  </>;
}
