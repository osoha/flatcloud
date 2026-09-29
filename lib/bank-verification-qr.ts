import { czIbanFromDomestic, paymentIban, type OwnerBankAccountLike } from "./owner-bank-account";

function validIban(iban: string) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/** Czech QR Platba payload for the existing 1 Kč bank-notification check. */
export function bankVerificationPaymentPayload(account: OwnerBankAccountLike, variableSymbol: string) {
  if ((account.currency || "CZK").toUpperCase() !== "CZK" || !/^\d{8}$/.test(variableSymbol)) return null;
  try {
    const iban = paymentIban(account);
    const domesticIban = czIbanFromDomestic(account.accountNumber, account.bankCode);
    if (!validIban(iban) || (domesticIban && domesticIban !== iban)) return null;
    return `SPD*1.0*ACC:${iban}*AM:1.00*CC:CZK*X-VS:${variableSymbol}`;
  } catch {
    return null;
  }
}
