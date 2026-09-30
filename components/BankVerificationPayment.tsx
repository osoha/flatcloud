import qrcode from "qrcode-generator";
import { bankVerificationPaymentPayload } from "@/lib/bank-verification-qr";
import { domesticAccountLabel, formatIban, type OwnerBankAccountLike } from "@/lib/owner-bank-account";

export function BankVerificationPayment({ account, variableSymbol, units, verified }: {
  account: OwnerBankAccountLike;
  variableSymbol: string;
  units: string[];
  verified: boolean;
}) {
  const payload = bankVerificationPaymentPayload(account, variableSymbol);
  const qr = payload ? qrcode(0, "M") : null;
  if (qr && payload) { qr.addData(payload); qr.make(); }
  const qrSrc = qr?.createDataURL(5, 8);
  const accountLabel = domesticAccountLabel(account.accountNumber, account.bankCode) || formatIban(account.iban);

  const payment = <div className={`verification-payment ${verified ? "verification-retest" : "verification-box"}`}>
    <div className="verification-payment-details">
      <small>Jednotky: {units.join(" · ")}</small>
      <strong>Testovací platba: 1,00 Kč</strong>
      <span>Účet: {accountLabel || "není vyplněn"}</span>
      <span>Variabilní symbol: <b>{variableSymbol}</b></span>
      <span className={`status ${verified ? "ok" : "warn"}`}>{verified ? "Funguje" : "Čeká na test"}</span>
    </div>
    {qrSrc ? <div className="verification-payment-qr"><img src={qrSrc} width={164} height={164} alt={`QR platba 1 Kč na účet ${accountLabel}, variabilní symbol ${variableSymbol}`}/><a href={qrSrc} download="flatberry-overeni-platby.gif">Stáhnout QR</a></div> : <small className="verification-payment-help">QR platba vyžaduje platný účet v Kč a shodu domácího čísla s IBANem.</small>}
  </div>;
  return verified ? <details className="verification-verified">
    <summary><span className="status ok">Účet ověřen</span><span>{accountLabel}</span><small>Jednotky: {units.join(" · ")}</small></summary>
    {payment}
  </details> : payment;
}
