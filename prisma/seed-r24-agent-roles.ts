import bcrypt from "bcryptjs";
import type { PrismaClient, PropertyPermission, UserRole } from "@prisma/client";
import { R24_DATA_MARKER } from "../lib/r24-agent-qa";

export const R24_ROLE_PASSWORD = process.env.E2E_ROLE_PASSWORD || "FlatCloud-R24-Role-Only-2026";

export const R24_ROLE_USERS = {
  novice: "r24.novice@flatcloud.test",
  advanced: "r24.advanced@flatcloud.test",
  externalOwner: "r24.external-owner@flatcloud.test",
  distributionLead: "r24.distribution@flatcloud.test",
  internalAssistant: "r24.assistant@flatcloud.test",
  technicalManager: "r24.technical@flatcloud.test",
  unitManager: "r24.units@flatcloud.test",
  assetManager: "r24.asset@flatcloud.test",
} as const;

type UserFixture = { email: string; name: string; role: UserRole; allProperties?: boolean; propertyName?: string; permission?: PropertyPermission; unitOnly?: boolean };

export async function ensureR24AgentRoles(prisma: PrismaClient) {
  const passwordHash = await bcrypt.hash(R24_ROLE_PASSWORD, 8);
  const fixtures: UserFixture[] = [
    { email: R24_ROLE_USERS.novice, name: "R24 · Novic", role: "OWNER_VIEWER", propertyName: "Dům ve správě", permission: "VIEW", unitOnly: true },
    { email: R24_ROLE_USERS.advanced, name: "R24 · Pokročilý uživatel", role: "PROPERTY_MANAGER", propertyName: "Moskevská", permission: "EDIT" },
    { email: R24_ROLE_USERS.externalOwner, name: "R24 · Externí vlastník", role: "OWNER_VIEWER", propertyName: "Dům ve správě", permission: "VIEW" },
    { email: R24_ROLE_USERS.distributionLead, name: "R24 · Šéf distribuce", role: "MANAGER", allProperties: true },
    { email: R24_ROLE_USERS.internalAssistant, name: "R24 · Interní asistentka", role: "OWNER_VIEWER", propertyName: "Karla Aksamita", permission: "EDIT" },
    { email: R24_ROLE_USERS.technicalManager, name: "R24 · Technický správce", role: "PROPERTY_MANAGER", propertyName: "Moskevská", permission: "EDIT" },
    { email: R24_ROLE_USERS.unitManager, name: "R24 · Správce jednotek", role: "PROPERTY_MANAGER", propertyName: "Dům ve správě", permission: "EDIT" },
    { email: R24_ROLE_USERS.assetManager, name: "R24 · Asset manager", role: "MANAGER", allProperties: true },
  ];

  for (const fixture of fixtures) {
    const user = await prisma.user.upsert({
      where: { email: fixture.email },
      update: { name: fixture.name, role: fixture.role, active: true, allProperties: Boolean(fixture.allProperties), passwordHash, title: R24_DATA_MARKER },
      create: { email: fixture.email, name: fixture.name, role: fixture.role, active: true, allProperties: Boolean(fixture.allProperties), passwordHash, title: R24_DATA_MARKER },
    });
    if (!fixture.propertyName) continue;
    const property = await prisma.property.findFirstOrThrow({ where: { name: fixture.propertyName }, include: { units: { orderBy: { label: "asc" }, take: 1 } } });
    if (fixture.unitOnly) {
      const unit = property.units[0];
      if (!unit) throw new Error(`R24 role ${fixture.email} nemá testovací jednotku.`);
      await prisma.userUnit.upsert({ where: { userId_unitId: { userId: user.id, unitId: unit.id } }, update: { permission: fixture.permission }, create: { userId: user.id, unitId: unit.id, permission: fixture.permission } });
    } else {
      await prisma.userProperty.upsert({ where: { userId_propertyId: { userId: user.id, propertyId: property.id } }, update: { permission: fixture.permission }, create: { userId: user.id, propertyId: property.id, permission: fixture.permission } });
    }
  }
  console.log(`R24 agentní role připraveny: ${fixtures.length}.`);
}
