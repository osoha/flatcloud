import assert from "node:assert/strict";
import {inboxRecipientUserId,transactionRecipientUserId,payerRecipientUserId} from "../lib/inbound-bank/queue-routing";

const active=new Set(["owner-a","owner-b","manager"]);
const grants=new Set(["house-a:manager","house-b:manager"]);
const managers=new Map([["house-a","manager"],["house-b","manager"]]);
const account=(owner:string|null,propertyId:string)=>({accountNumber:"123456789",bankCode:"0300",iban:null,owner:{userId:owner},propertyLinks:[{propertyId}],unitOwnerships:[],leases:[]});
const recipient={recipientAccount:"123456789/0300"};

assert.equal(inboxRecipientUserId(recipient,[account("owner-a","house-a")],active,managers,grants),"owner-a");
assert.equal(inboxRecipientUserId(recipient,[account("owner-a","house-a"),account("owner-b","house-b")],active,managers,grants),null,"a shared number with different owners stays central");
assert.equal(inboxRecipientUserId(recipient,[account("owner-a","house-a"),account(null,"house-b")],active,managers,grants),null,"a partially identified shared number stays central");
assert.equal(inboxRecipientUserId(recipient,[account(null,"house-a"),account(null,"house-b")],active,managers,grants),"manager");
assert.equal(inboxRecipientUserId(recipient,[account(null,"house-a"),account(null,"house-b")],active,managers,new Set(["house-a:manager"])),null,"an incomplete grant cannot hide mail from admin");
assert.equal(inboxRecipientUserId({recipientAccount:null},[account("owner-a","house-a")],active,managers,grants),null);
assert.equal(transactionRecipientUserId({bankAccount:{owner:null,property:{id:"house-a",managerId:"manager"}}},active,grants),"manager");
assert.equal(transactionRecipientUserId({bankAccount:{owner:null,property:{id:"house-a",managerId:"manager"}}},active,new Set()),null);

const lease={startDate:new Date("2025-01-01"),endDate:null,terminatedOn:null,cancelledAt:null,tenantBankAccount:"555/0300",tenant:{payerAccounts:[]},ownerBankAccount:{owner:{userId:"owner-a"}},unit:{property:{managerId:"manager"}}};
assert.equal(payerRecipientUserId({counterpartyAccount:"555/0300"},[lease],active),"owner-a");
assert.equal(payerRecipientUserId({counterpartyAccount:"555/0300"},[lease,{...lease,ownerBankAccount:{owner:{userId:"owner-b"}}}],active),null,"ambiguous payers stay central");
assert.equal(payerRecipientUserId({counterpartyAccount:"other/0300"},[lease],active),null);
console.log("Bank queue routing: unique owner, authorized manager, ambiguous recipient and known payer OK");
