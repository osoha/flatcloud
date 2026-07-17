import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function prismaClient() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}

/**
 * Prisma is created lazily on the first real database operation. This keeps
 * build-time route discovery free of database/engine initialization while
 * preserving the existing shared-client API throughout the application.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = prismaClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
