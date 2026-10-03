import assert from "node:assert/strict";
import {rentPaymentPayload} from "../lib/rent-payment-qr";

const account={accountNumber:"2000145399",bankCode:"0800",currency:"CZK"};
assert.equal(rentPaymentPayload(account,"123456",12345,"CZK"),"SPD*1.0*ACC:CZ7908000000002000145399*AM:123.45*CC:CZK*X-VS:123456");
assert.equal(rentPaymentPayload(account,"123456",0,"CZK"),null);
assert.equal(rentPaymentPayload(account,"123456",12345,"EUR"),null);
assert.equal(rentPaymentPayload({...account,iban:"CZ0008000000002000145399"},"123456",12345,"CZK"),null);
assert.equal(rentPaymentPayload(account,"1234*PAY",12345,"CZK"),null);
console.log("QR platba: částka, VS, měna a cílový účet ověřeny.");
