import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PropertyPermission, UserRole } from "@prisma/client";
import { editableUserAccessChanged, type EditableUserAccess } from "../lib/user-access-management";

const read = (path: string) => readFileSync(path, "utf8");
let passed = 0;
function check(name: string, run: () => void) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

const access: EditableUserAccess = {
  role: UserRole.PROPERTY_MANAGER,
  active: true,
  allProperties: false,
  memberships: [{ propertyId: "p1", permission: PropertyPermission.EDIT }],
  unitMemberships: [{ unitId: "u1", permission: PropertyPermission.VIEW }],
};

check("grant ordering does not create a false access change", () => {
  const reordered = {
    ...access,
    memberships: [
      { propertyId: "p2", permission: PropertyPermission.VIEW },
      ...access.memberships,
    ],
  };
  assert.equal(editableUserAccessChanged(reordered, { ...reordered, memberships: reordered.memberships.slice().reverse() }), false);
});

check("role, activation and granular grants are security-significant", () => {
  assert.equal(editableUserAccessChanged(access, { ...access, role: UserRole.MANAGER }), true);
  assert.equal(editableUserAccessChanged(access, { ...access, active: false }), true);
  assert.equal(editableUserAccessChanged(access, { ...access, unitMemberships: [] }), true);
});

check("user mutation reconfirms access impact inside the transaction", () => {
  const route = read("app/api/users/[id]/route.ts");
  const transaction = route.slice(route.indexOf("prisma.$transaction"));
  assert.match(transaction, /editableUserAccessChanged/);
  assert.match(transaction, /confirmAccessChange/);
  assert.match(route, /unitMemberships, avatarChanged/);
  assert.match(read("app/uzivatele/[id]/page.tsx"), /Efektivní rozsah přístupu/);
});

check("mail retention is previewed and confirmed on UI and server", () => {
  const page = read("app/nastaveni/system/page.tsx");
  const route = read("app/api/settings/inbound-mail/cleanup/route.ts");
  assert.match(page, /confirmCleanup/);
  assert.match(page, /eligibleRawNotifications/);
  assert.match(page, /Účetní záznamy zůstanou zachované/);
  assert.match(route, /form\.get\("confirmCleanup"\) !== "on"/);
});

check("manual scheduled delivery is confirmed on UI and server", () => {
  const page = read("app/nastaveni/system/page.tsx");
  const route = read("app/api/settings/notifications/run/route.ts");
  assert.match(page, /confirmScheduledRun/);
  assert.match(page, /všech zpráv, které jsou podle kalendáře právě splatné/);
  assert.match(route, /form\.get\("confirmScheduledRun"\) !== "on"/);
});

console.log(`R10D verifier passed (${passed} checks).`);
