import assert from "node:assert/strict";
import { expenseAccountIdentity, parseExpenseStatement, expenseMoney, settledCents, bankRemainder } from "../lib/bank-expense-values";
const head="id;datum;castka;mena;protistrana;ucet;vs;zprava\n";
const rows=parseExpenseStatement('\uFEFF'+head+'A;2026-01-01;-10 000,00;CZK;"Firma; s.r.o.";123/0800;001;"Text\nřádek"\nB;2026-01-02;500.01;CZK;Firma;123/0800;;Vratka');
assert.equal(rows[0].amountCents,-1000000);assert.equal(rows[1].amountCents,50001);assert.equal(rows[0].counterpartyName,"Firma; s.r.o.");
for(const value of ["1e3","1.001","NaN","21474836.48","--1",""])assert.throws(()=>expenseMoney(value));
for(const line of ['A;2026-02-30;-1;CZK;;;;','A;2026-01-01;0;CZK;;;;','A;2026-01-01;-1;EUR;;;;','A;2026-01-01;-1;CZK;;;;\nA;2026-01-02;-1;CZK;;;;'])assert.throws(()=>parseExpenseStatement(head+line));
assert.equal(settledCents([{kind:"COST_PAYMENT",amountCents:1000000,voidedAt:null},{kind:"COST_PAYMENT",amountCents:800000,voidedAt:null},{kind:"COST_REFUND",amountCents:50000,voidedAt:null},{kind:"COST_PAYMENT",amountCents:999,voidedAt:new Date()}]),1750000);
assert.equal(bankRemainder(-1800000,[{amountCents:1000000,voidedAt:null}]),800000);
console.log("P01B CSV precision, signs, dates, uniqueness and settlement balances passed");

assert.equal(expenseAccountIdentity({iban:"CZ6508000000192000145399"}),expenseAccountIdentity({accountNumber:"19-2000145399",bankCode:"0800"}));
