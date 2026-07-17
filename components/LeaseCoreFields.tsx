"use client";

import { useMemo, useState } from "react";

type Option = [string, string];
type OwnerAccountOption = { id: string; label: string } | null;

type Props = {
  unitOptions: Option[];
  tenantOptions?: Option[];
  defaultUnitId?: string;
  defaultTenantId?: string;
  defaultContractNumber?: string | null;
  defaultStartDate: string;
  defaultEndDate?: string;
  defaultStatus?: string;
  defaultDueDay?: number;
  defaultRentTiming?: string;
  defaultVariableSymbol?: string;
  defaultTenantBankAccount?: string | null;
  proposals?: Record<string, string | null>;
  ownerAccountsByUnit?: Record<string, OwnerAccountOption>;
  tenantAccountsByTenant?: Record<string, string[]>;
  showGenerateCharges?: boolean;
};

export function LeaseCoreFields({ unitOptions, tenantOptions, defaultUnitId, defaultTenantId, defaultContractNumber, defaultStartDate, defaultEndDate = "", defaultStatus = "ACTIVE", defaultDueDay = 5, defaultRentTiming = "ADVANCE", defaultVariableSymbol = "", defaultTenantBankAccount = "", proposals = {}, ownerAccountsByUnit = {}, tenantAccountsByTenant = {}, showGenerateCharges = false }: Props) {
  const initialUnit = defaultUnitId || unitOptions[0]?.[0] || "";
  const initialTenant = defaultTenantId || tenantOptions?.[0]?.[0] || "";
  const [unitId, setUnitId] = useState(initialUnit);
  const [tenantId, setTenantId] = useState(initialTenant);
  const [termType, setTermType] = useState(defaultEndDate ? "FIXED" : "INDEFINITE");
  const initialVs = defaultVariableSymbol || proposals[initialUnit] || "";
  const [variableSymbol, setVariableSymbol] = useState(initialVs);
  const [tenantBankAccount, setTenantBankAccount] = useState(defaultTenantBankAccount || tenantAccountsByTenant[initialTenant]?.[0] || "");
  const proposed = useMemo(() => proposals[unitId] || "", [proposals, unitId]);
  const ownerAccount = ownerAccountsByUnit[unitId] || null;
  const knownTenantAccounts = tenantAccountsByTenant[tenantId] || [];

  function changeUnit(next: string) {
    const priorProposal = proposals[unitId] || "";
    setUnitId(next);
    if (!variableSymbol || variableSymbol === priorProposal) setVariableSymbol(proposals[next] || "");
  }

  function changeTenant(next: string) {
    const priorKnown = tenantAccountsByTenant[tenantId] || [];
    setTenantId(next);
    if (!tenantBankAccount || tenantBankAccount === priorKnown[0]) setTenantBankAccount(tenantAccountsByTenant[next]?.[0] || "");
  }

  return <>
    <label className="field"><span>Jednotka *</span><select name="unitId" value={unitId} onChange={(event) => changeUnit(event.target.value)} required>{unitOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    {tenantOptions && <label className="field"><span>Nájemník *</span><select name="tenantId" value={tenantId} onChange={(event) => changeTenant(event.target.value)} required>{tenantOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>}
    <label className="field"><span>Účet vlastníka pro úhrady *</span><input value={ownerAccount?.label || "U jednotky není vybraný platební účet"} readOnly/><input type="hidden" name="ownerBankAccountId" value={ownerAccount?.id || ""}/><small>Účet se přebírá z vlastnictví vybrané jednotky a použije se v předpisech i QR platbě.</small></label>
    <label className="field"><span>Účet nájemníka ve smlouvě</span><input name="tenantBankAccount" list="tenant-bank-accounts" value={tenantBankAccount} onChange={(event) => setTenantBankAccount(event.target.value)} placeholder="IBAN nebo číslo účtu plátce"/><datalist id="tenant-bank-accounts">{knownTenantAccounts.map((account) => <option value={account} key={account}/>)}</datalist><small>Použije se pro první automatické párování příchozí platby.</small></label>
    <label className="field"><span>Číslo smlouvy</span><input name="contractNumber" defaultValue={defaultContractNumber || ""}/></label>
    <label className="field"><span>Doba trvání *</span><select name="termType" value={termType} onChange={(event) => setTermType(event.target.value)}><option value="FIXED">Na dobu určitou</option><option value="INDEFINITE">Na dobu neurčitou</option></select></label>
    <label className="field"><span>Platnost od *</span><input name="startDate" type="date" defaultValue={defaultStartDate} required/></label>
    {termType === "FIXED" && <label className="field"><span>Platnost do *</span><input name="endDate" type="date" defaultValue={defaultEndDate} required/></label>}
    <label className="field"><span>Stav smlouvy</span><select name="status" defaultValue={defaultStatus}><option value="ACTIVE">Aktivní</option><option value="FUTURE">Budoucí</option><option value="ENDED">Ukončená</option></select></label>
    <label className="field"><span>Den splatnosti *</span><input name="dueDay" type="number" min={1} max={31} defaultValue={defaultDueDay} required/></label>
    <label className="field"><span>Způsob placení</span><select name="rentTiming" defaultValue={defaultRentTiming}><option value="ADVANCE">Dopředné – v daném měsíci</option><option value="ARREARS">Zpětné – v následujícím měsíci</option></select></label>
    <label className="field"><span>Variabilní symbol *</span><input name="variableSymbol" inputMode="numeric" pattern="[0-9]{1,10}" maxLength={10} value={variableSymbol} onChange={(event) => setVariableSymbol(event.target.value.replace(/\D/g, "").slice(0, 10))} required/><small>{proposed ? `Návrh podle domu, jednotky a pořadí smlouvy: ${proposed}` : "VS musí být číselný a unikátní v celé evidenci."}</small></label>
    {showGenerateCharges && termType === "FIXED" && <label className="checkbox-field field-full"><input type="checkbox" name="generateCharges"/><span>Po vytvoření smlouvy vytvořit předpisy na celé sjednané období</span></label>}
  </>;
}
