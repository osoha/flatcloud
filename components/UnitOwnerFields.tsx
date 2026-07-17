"use client";

import { useMemo, useState } from "react";

type OwnerOption = {
  id: string;
  label: string;
  accounts: { id: string; label: string }[];
};

export function UnitOwnerFields({ owners, defaultOwnerId, defaultAccountId, showSubmit = true }: { owners: OwnerOption[]; defaultOwnerId: string; defaultAccountId?: string | null; showSubmit?: boolean }) {
  const initialOwnerId = owners.some((item) => item.id === defaultOwnerId) ? defaultOwnerId : owners[0]?.id || "";
  const initialAccounts = owners.find((item) => item.id === initialOwnerId)?.accounts || [];
  const initialAccountId = initialAccounts.some((account) => account.id === defaultAccountId) ? defaultAccountId || "" : initialAccounts[0]?.id || "";
  const [ownerId, setOwnerId] = useState(initialOwnerId);
  const [accountId, setAccountId] = useState(initialAccountId);
  const owner = useMemo(() => owners.find((item) => item.id === ownerId), [owners, ownerId]);
  const accounts = owner?.accounts || [];

  function changeOwner(nextOwnerId: string) {
    setOwnerId(nextOwnerId);
    const nextOwner = owners.find((item) => item.id === nextOwnerId);
    setAccountId(nextOwner?.accounts[0]?.id || "");
  }

  return <>
    <label className="field"><span>Vlastník</span><select name="ownerId" value={ownerId} onChange={(event) => changeOwner(event.target.value)} required>{owners.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
    <label className="field"><span>Účet pro nájemné</span><select name="ownerBankAccountId" value={accountId} onChange={(event) => setAccountId(event.target.value)} required disabled={!accounts.length}><option value="">{accounts.length ? "Vyberte účet" : "Vlastník nemá aktivní účet"}</option>{accounts.map((account) => <option value={account.id} key={account.id}>{account.label}</option>)}</select><small>{accounts.length ? "Tento účet se použije ve smlouvě, předpisech a QR platbách." : "Nejprve přidejte bankovní účet v profilu vlastníka."}</small></label>
    {showSubmit && <button className="primary" type="submit" disabled={!ownerId || !accountId}>Uložit vlastníka a účet</button>}
  </>;
}
