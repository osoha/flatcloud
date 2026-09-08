import { PrismaClient } from "@prisma/client";
import { ensureR24AgentRoles } from "../prisma/seed-r24-agent-roles";

const prisma = new PrismaClient();
ensureR24AgentRoles(prisma)
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
