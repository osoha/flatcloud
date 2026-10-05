import {validIban} from "./bank-verification-qr";
import {czIbanFromDomestic, paymentIban, type OwnerBankAccountLike} from "./owner-bank-account";

export function rentPaymentPayload(account:OwnerBankAccountLike|null,variableSymbol:string,amountCents:number,currency:string) {
  if(!account||currency!=="CZK"||(account.currency||"CZK").toUpperCase()!=="CZK"||!Number.isSafeInteger(amountCents)||amountCents<=0||!/^\d{1,10}$/.test(variableSymbol))return null;
  try {
    const iban=paymentIban(account);
    const domestic=czIbanFromDomestic(account.accountNumber,account.bankCode);
    if(!validIban(iban)||(domestic&&domestic!==iban))return null;
    return `SPD*1.0*ACC:${iban}*AM:${(amountCents/100).toFixed(2)}*CC:CZK*X-VS:${variableSymbol}`;
  }catch{return null;}
}
