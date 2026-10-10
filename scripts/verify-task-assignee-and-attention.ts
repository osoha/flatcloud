import assert from "node:assert/strict";
import { resolveAutomaticTaskAssignee, shouldBackfillAutomaticAssignee } from "../lib/task-automation";
import { hideAlertsCoveredByAutomaticTasks } from "../lib/task-attention";

const user = (id: string, active = true) => ({ id, active });
const owner = (id: string | null, active = true) => ({ user: id ? user(id, active) : null });
const ownership = (id: string | null, active = true) => ({ owner: owner(id, active) });

assert.equal(resolveAutomaticTaskAssignee({ manager:user("manager"),propertyOwner:owner("owner"),unitOwnerships:[ownership("unit-owner")] }),"manager");
assert.equal(resolveAutomaticTaskAssignee({ manager:null,propertyOwner:owner("property-owner"),unitOwnerships:[ownership("unit-owner")] }),"unit-owner");
assert.equal(resolveAutomaticTaskAssignee({ manager:null,propertyOwner:owner("property-owner"),unitOwnerships:[] }),"property-owner");
assert.equal(resolveAutomaticTaskAssignee({ manager:user("inactive-manager",false),propertyOwner:owner("property-owner"),unitOwnerships:[ownership("unit-owner")] }),"unit-owner");
assert.equal(resolveAutomaticTaskAssignee({ manager:null,propertyOwner:owner("property-owner"),unitOwnerships:[ownership("first"),ownership("second")] }),null);
assert.equal(shouldBackfillAutomaticAssignee({assigneeId:null,status:"OPEN"},"manager"),true);
assert.equal(shouldBackfillAutomaticAssignee({assigneeId:"manual",status:"OPEN"},"manager"),false);
assert.equal(shouldBackfillAutomaticAssignee({assigneeId:null,status:"DONE"},"manager"),false);
assert.equal(shouldBackfillAutomaticAssignee({assigneeId:null,status:"OPEN"},null),false);

const member = (id: string, permission = "EDIT") => ({ permission, user: { ...user(id), role: "PROPERTY_MANAGER" } });
assert.equal(resolveAutomaticTaskAssignee({ manager:null,memberships:[member("assigned-manager")],propertyOwner:owner("property-owner"),unitOwnerships:[ownership("unit-owner")] }),"assigned-manager");
assert.equal(resolveAutomaticTaskAssignee({ manager:null,memberships:[member("a"),member("b")],propertyOwner:owner("property-owner"),unitOwnerships:[ownership("unit-owner")] }),null);
assert.equal(resolveAutomaticTaskAssignee({ manager:null,memberships:[member("viewer","VIEW")],propertyOwner:owner("property-owner"),unitOwnerships:[ownership("unit-owner")] }),"unit-owner");
assert.equal(resolveAutomaticTaskAssignee({ manager:null,ownershipMode:"UNIT_BASED",propertyOwner:owner("svj-contact"),unitOwnerships:[ownership(null)] }),null);
assert.equal(resolveAutomaticTaskAssignee({ manager:null,ownershipMode:"WHOLE_OBJECT",propertyOwner:{id:"company",user:null},communicationOwner:owner("representative"),unitOwnerships:[{owner:{id:"company",user:null}}] }),"representative");
assert.equal(resolveAutomaticTaskAssignee({ manager:null,ownershipMode:"WHOLE_OBJECT",propertyOwner:{id:"company",user:null},communicationOwner:owner("representative"),unitOwnerships:[{owner:{id:"foreign",user:null}}] }),null);
assert.equal(resolveAutomaticTaskAssignee({ manager:null,ownershipMode:"UNIT_BASED",propertyOwner:owner("svj-contact"),unitOwnerships:[{...ownership("zero"),shareBasisPoints:0},ownership("actual")] }),"actual");

const alerts = [
  { kind:"EXPIRY",lease:{id:"covered"},label:"covered expiry" },
  { kind:"ANNIVERSARY",lease:{id:"visible"},label:"visible anniversary" },
];
assert.deepEqual(hideAlertsCoveredByAutomaticTasks(alerts,[{leaseId:"covered",automationRule:{event:"LEASE_EXPIRY"}}]).map((alert)=>alert.label),["visible anniversary"]);
assert.equal(hideAlertsCoveredByAutomaticTasks(alerts,[{leaseId:"covered",automationRule:{event:"LEASE_ANNIVERSARY"}}]).length,2);
assert.equal(hideAlertsCoveredByAutomaticTasks(alerts,[{leaseId:"covered",automationRule:null}]).length,2);

console.log("Automatic task assignee fallback and attention deduplication passed.");
