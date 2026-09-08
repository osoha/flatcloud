import { expect, test } from "@playwright/test";
import { prisma } from "../lib/db";
import { createDistributionOpportunity, createDistributionProspect } from "../lib/distribution/crm";
import { createWelcomeLetter, updateWelcomeLetter } from "../lib/distribution/welcome-letters";
import { R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";

test.beforeAll(() => { if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("R24 requires local/CI DB"); });
test.afterAll(async () => { await prisma.$disconnect(); });

test("R24 souběh příležitosti a konceptu uvítání nevytvoří duplicitu ani odeslání", async () => {
  const actor = await prisma.user.findUniqueOrThrow({ where: { email: R24_ROLE_USERS.distributionLead } });
  const unit = await prisma.unit.findFirstOrThrow({ where: { property: { active: true, flatcloudConsolidationBasisPoints: { gt: 0 } } } });
  const prospect = await createDistributionProspect(actor, { name: "R24_AGENT_QA_2026_09 · concurrent draft", email: "r24-concurrency@example.invalid" });
  const input = { prospectId: prospect.id, unitId: unit.id, stage: "WON" as const, askingPriceCents: 100000, offeredPriceCents: 100000, nextActionAt: null, note: "R24 TEST · žádná skutečná transakce" };
  const opportunities = await Promise.allSettled([createDistributionOpportunity(actor, input), createDistributionOpportunity(actor, input)]);
  expect(opportunities.filter(result => result.status === "fulfilled")).toHaveLength(1);
  const opportunity = await prisma.distributionOpportunity.findUniqueOrThrow({ where: { prospectId_unitId: { prospectId: prospect.id, unitId: unit.id } }, include: { events: true } });
  expect(opportunity.events).toHaveLength(1);
  const createInput = { opportunityId: opportunity.id, ownershipRegisteredAt: new Date("2026-09-15T12:00:00Z") };
  const letters = await Promise.allSettled([createWelcomeLetter(actor, createInput), createWelcomeLetter(actor, createInput)]);
  expect(letters.filter(result => result.status === "fulfilled")).toHaveLength(1);
  const letter = await prisma.distributionWelcomeLetter.findFirstOrThrow({ where: { opportunityId: opportunity.id } });
  await expect(createWelcomeLetter(actor, createInput)).rejects.toThrow("rozpracovaný");
  const updated = await updateWelcomeLetter(actor, letter.id, { ...letter, subject: "R24_AGENT_QA_2026_09 · TEST NEODESÍLAT", documentIds: [] });
  expect(updated.id).toBe(letter.id);
  expect(updated.status).toBe("DRAFT");
  expect(updated.revision).toBe(1);
  expect(updated.sentAt).toBeNull();
  expect(updated.readyAt).toBeNull();
  expect(await prisma.distributionWelcomeLetter.count({ where: { opportunityId: opportunity.id } })).toBe(1);
  expect(await prisma.auditLog.count({ where: { entityId: letter.id, action: "DISTRIBUTION_WELCOME_LETTER_CREATED" } })).toBe(1);
});
