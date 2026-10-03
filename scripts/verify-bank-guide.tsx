import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { BankNotificationGuide } from "../components/BankNotificationGuide";

const render = (codes: string[], includeAssignment = false) => renderToStaticMarkup(
  <BankNotificationGuide mailbox="platby@example.test" accountBankCodes={codes} includeAssignment={includeAssignment}/>,
);

const csob = render(["0300"], true);
assert.match(csob, /Moje info/);
assert.match(csob, /Přiřaďte účet k jednotce/);
assert.match(csob, /platby@example\.test/);
assert.match(csob, /testovací platbu 1 Kč/);

const fio = render(["2010"]);
assert.match(fio, /orientační/);
assert.doesNotMatch(fio, /příchozí zprávy umíme zpracovat/);

const multipleAccounts = render(["0300", "5500"]);
assert.match(multipleAccounts, /Vyberte banku/);
assert.doesNotMatch(multipleAccounts, /příchozí zprávy umíme zpracovat/);

console.log("Bankovní průvodce: výběr, kroky a rozdíl mezi ověřeným a orientačním postupem OK");
