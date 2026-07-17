export type OwnerBankAccountLike = {
  label?: string | null;
  accountNumber?: string | null;
  bankCode?: string | null;
  iban?: string | null;
  currency?: string | null;
};

export function normalizeIban(value?: string | null) {
  return (value || "").replace(/\s+/g, "").toUpperCase();
}

export function normalizeAccountNumber(value?: string | null) {
  const compact = (value || "").replace(/\s+/g, "");
  if (!compact) return "";
  const withoutBank = compact.split("/")[0];
  const parts = withoutBank.split("-").filter(Boolean);
  if (parts.some((part) => !/^\d+$/.test(part)) || parts.length > 2) throw new Error("Číslo účtu může obsahovat pouze číslice a volitelné předčíslí oddělené pomlčkou.");
  return parts.join("-");
}

export function normalizeBankCode(value?: string | null) {
  const code = (value || "").replace(/\s+/g, "");
  if (!code) return "";
  if (!/^\d{4}$/.test(code)) throw new Error("Kód banky musí mít přesně 4 číslice.");
  return code;
}

export function validateOwnerBankAccount(input: OwnerBankAccountLike) {
  const accountNumber = normalizeAccountNumber(input.accountNumber);
  const bankCode = normalizeBankCode(input.bankCode);
  const iban = normalizeIban(input.iban);
  if (!accountNumber && !iban) throw new Error("U bankovního účtu vyplňte domácí číslo účtu nebo IBAN.");
  if (accountNumber && !bankCode) throw new Error("K domácímu číslu účtu doplňte kód banky.");
  if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) throw new Error("IBAN nemá platný formát.");
  const currency = (input.currency || "CZK").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Měna musí být třípísmenný kód, například CZK.");
  return {
    label: input.label?.trim() || null,
    accountNumber: accountNumber || null,
    bankCode: bankCode || null,
    iban: iban || null,
    currency,
  };
}

export function domesticAccountLabel(accountNumber?: string | null, bankCode?: string | null) {
  if (!accountNumber) return "";
  return `${accountNumber}${bankCode ? `/${bankCode}` : ""}`;
}

export function ownerBankAccountLabel(account: OwnerBankAccountLike) {
  const accountId = domesticAccountLabel(account.accountNumber, account.bankCode) || formatIban(account.iban) || "Účet bez čísla";
  return [account.label, accountId, account.currency && account.currency !== "CZK" ? account.currency : null].filter(Boolean).join(" · ");
}

export function formatIban(value?: string | null) {
  const iban = normalizeIban(value);
  return iban ? iban.replace(/(.{4})/g, "$1 ").trim() : "";
}

export function czIbanFromDomestic(accountNumber?: string | null, bankCode?: string | null) {
  const account = normalizeAccountNumber(accountNumber);
  const code = normalizeBankCode(bankCode);
  if (!account || !code) return "";
  const [prefixRaw, mainRaw] = account.includes("-") ? account.split("-") : ["", account];
  if (prefixRaw.length > 6 || mainRaw.length > 10) return "";
  const bban = `${code}${prefixRaw.padStart(6, "0")}${mainRaw.padStart(10, "0")}`;
  let remainder = 0;
  for (const digit of `${bban}123500`) remainder = (remainder * 10 + Number(digit)) % 97;
  const check = 98 - remainder;
  return `CZ${check.toString().padStart(2, "0")}${bban}`;
}

export function paymentIban(account?: OwnerBankAccountLike | null) {
  return normalizeIban(account?.iban) || czIbanFromDomestic(account?.accountNumber, account?.bankCode);
}

export function normalizePayerAccount(value?: string | null) {
  const compact = (value || "").replace(/\s+/g, "").toUpperCase();
  if (!compact) return "";
  if (/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) return compact;
  const domestic = compact.match(/^([0-9]{1,6}-)?[0-9]{1,10}\/[0-9]{4}$/);
  if (domestic) {
    const [accountNumber, bankCode] = compact.split("/");
    return czIbanFromDomestic(accountNumber, bankCode) || compact;
  }
  return compact;
}
