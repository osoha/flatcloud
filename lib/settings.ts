import { prisma } from "./db";

export async function appSettings() {
  return prisma.appSetting.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global" },
  });
}
