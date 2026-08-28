import { Prisma } from "@prisma/client";
import { prisma } from "./db";

const SERIALIZATION_RETRIES = 3;

export async function serializableTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt >= SERIALIZATION_RETRIES) throw error;
    }
  }
}
