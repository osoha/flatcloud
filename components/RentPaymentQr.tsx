import qrcode from "qrcode-generator";
import {rentPaymentPayload} from "@/lib/rent-payment-qr";
import type {OwnerBankAccountLike} from "@/lib/owner-bank-account";

export function RentPaymentQr({account,variableSymbol,amountCents,currency}:{account:OwnerBankAccountLike|null;variableSymbol:string;amountCents:number;currency:string}) {
  const payload=rentPaymentPayload(account,variableSymbol,amountCents,currency);
  if(!payload)return <p>QR platba není pro tento předpis dostupná. Použijte ověřené platební údaje ze smlouvy.</p>;
  const qr=qrcode(0,"M");qr.addData(payload);qr.make();
  return <div className="verification-payment-qr"><img src={qr.createDataURL(5,8)} width={164} height={164} alt="QR kód pro úhradu otevřeného předpisu"/><small>Po načtení ověřte v bankovní aplikaci částku a příjemce.</small></div>;
}
