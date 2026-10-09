import { PropertyPermission } from "@prisma/client";

/** Missing fields (for example in an older form) preserve grants; only an explicit empty field revokes one. */
export function submittedUserPermissions<K extends "propertyId" | "unitId">(
  form: FormData,
  prefix: "property" | "unit",
  key: K,
  current: Array<Record<K, string> & { permission: PropertyPermission }>,
) {
  const permissions = new Map<string, PropertyPermission>(current.map(row => [row[key], row.permission]));
  for (const [name, value] of form.entries()) {
    if (!name.startsWith(`${prefix}:`)) continue;
    const id = name.slice(prefix.length + 1);
    if (!id || typeof value !== "string" || (value && !Object.values(PropertyPermission).includes(value as PropertyPermission))) {
      throw new Error("Neplatná úroveň oprávnění. Obnovte formulář.");
    }
    if (value === "") permissions.delete(id);
    else permissions.set(id, value as PropertyPermission);
  }
  return [...permissions].map(([id, permission]) => ({ [key]: id, permission }) as Record<K, string> & { permission: PropertyPermission });
}
