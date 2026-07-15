import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const name = process.env.INITIAL_ADMIN_NAME?.trim() || "Hlavní administrátor";

  if (!email || !password) {
    throw new Error("Chybí INITIAL_ADMIN_EMAIL nebo INITIAL_ADMIN_PASSWORD.");
  }
  if (password.length < 12) {
    throw new Error("INITIAL_ADMIN_PASSWORD musí mít alespoň 12 znaků.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Administrátor ${email} již existuje. Bez změny hesla.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: "SUPER_ADMIN",
      active: true,
    },
  });
  console.log(`Vytvořen první administrátor: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
