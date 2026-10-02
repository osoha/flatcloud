import assert from "node:assert/strict";
import { parseBankNotification } from "../lib/inbound-bank/bank-email";
import { payerDisplayName } from "../lib/bank-payer-display";
import { expenseRuleMatches } from "../lib/bank-expense-rule-policy";

const debit = "Odchozí platba\nVáš účet: 2000145399/3030\nÚčet příjemce: 123456789/0800\nČástka: 2 500,00 CZK\nVS: 123\nZpráva: Zálohy SVJ";
const parsed = parseBankNotification({ from: "info@airbank.cz", text: debit });
assert.equal(parsed.amountCents, -250000);
assert.equal(parsed.recipientAccount, "2000145399/3030");
assert.equal(parsed.counterpartyAccount, "123456789/0800");
assert.equal(parsed.autoProcessEligible, true);
assert.equal(parseBankNotification({ from: "info@airbank.cz", text: `${debit}\nPříchozí platba` }).autoProcessEligible, false);
for (const text of [debit.replace("Váš účet:", "Neznámé pole:"), debit.replace("Částka: 2 500,00 CZK", "Zůstatek: 2 500,00 CZK")]) assert.equal(parseBankNotification({ from: "info@airbank.cz", text }).autoProcessEligible, false);
for (const from of ["notice@example.invalid", "info@airbank.cz.fake.invalid"]) assert.equal(parseBankNotification({ from, text: debit }).autoProcessEligible, false);
assert.equal(parseBankNotification({ from: "info@airbank.cz", text: debit, authenticationResults: "dmarc=fail" }).autoProcessEligible, false);
const cs = parseBankNotification({ from: "notice@csas.cz", text: "Směr platby: odchozí\nČíslo účtu: 2000145399/0800\nČíslo účtu protistrany: 123/3030\nČástka v měně transakce: 100,00 Kč" });
assert.equal(cs.amountCents, -10000);
assert.equal(cs.recipientAccount, "2000145399/0800");
assert.equal(cs.counterpartyAccount, "123/3030");

const payment = { amountCents: 10000, counterpartyName: "Neznámý plátce", counterpartyAccount: "19-2000145399/0800", recipientAccount: "2000145399/3030" };
const lease = { tenantBankAccount: "000019-2000145399/0800", tenant: { id: "one", name: "Testovací nájemník", payerAccounts: [] }, ownerBankAccount: { accountNumber: "2000145399", bankCode: "3030", iban: null } };
assert.equal(payerDisplayName(payment, [lease]), "Testovací nájemník");
assert.equal(payerDisplayName(payment, [lease, lease]), "Testovací nájemník");
assert.equal(payerDisplayName(payment, [lease, { ...lease, tenant: { ...lease.tenant, id: "two", name: "Jiný nájemník" } }]), "Plátce neuveden");
assert.equal(payerDisplayName({ ...payment, amountCents: -10000 }, [lease]), "Plátce neuveden");
assert.equal(payerDisplayName({ ...payment, counterpartyName: "Skutečný plátce z banky" }, [lease]), "Skutečný plátce z banky");
assert.equal(payerDisplayName({ ...payment, recipientAccount: "9999/0800" }, [lease]), "Plátce neuveden");
assert.equal(payerDisplayName({ ...payment, counterpartyAccount: "CZ6508000000192000145399" }, [lease]), "Testovací nájemník");

const bank = { amountCents: -15000, counterpartyIban: null, counterpartyName: null, variableSymbol: null, message: "Poplatek za vedení účtu" };
assert.equal(expenseRuleMatches({ direction: "OUT", message: "Poplatek za vedení účtu" }, bank), true);
assert.equal(expenseRuleMatches({ direction: "OUT", message: "Poplatek za vedení účtu" }, { ...bank, message: "Zálohy SVJ" }), false);
assert.equal(expenseRuleMatches({ direction: "IN", message: "Poplatek za vedení účtu" }, bank), false);
console.log("Bank routing direction, source trust, payer display ambiguity and waste-rule isolation passed");
