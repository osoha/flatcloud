import assert from "node:assert/strict";
import { submittedUserPermissions } from "../lib/submitted-user-permissions";

const current = [{propertyId: "active", permission: "VIEW" as const}, {propertyId: "archived", permission: "ADMIN" as const}];
const form = new FormData();
form.set("property:active", "EDIT");
assert.deepEqual(submittedUserPermissions(form, "property", "propertyId", current), [{propertyId: "active", permission: "EDIT"}, current[1]], "Omitted archived grants survive saving older forms");
form.set("property:archived", "");
assert.deepEqual(submittedUserPermissions(form, "property", "propertyId", current), [{propertyId: "active", permission: "EDIT"}], "Explicit removal still revokes access");
form.set("unit:archived-unit", "VIEW");
assert.deepEqual(submittedUserPermissions(form, "unit", "unitId", [{unitId: "existing", permission: "EDIT"}]), [{unitId: "existing", permission: "EDIT"}, {unitId: "archived-unit", permission: "VIEW"}]);
form.set("property:active", "INVALID");
assert.throws(() => submittedUserPermissions(form, "property", "propertyId", current));
console.log("Submitted user permissions: preserved omissions, explicit changes and invalid input passed.");
