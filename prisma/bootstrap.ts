import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function isEnabled(value: string | undefined) {
  return /^(1|true|yes|ano)$/i.test(value?.trim() || "");
}

async function main() {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const name = process.env.INITIAL_ADMIN_NAME?.trim() || "Hlavní administrátor";
  const resetPassword = isEnabled(process.env.RESET_INITIAL_ADMIN_PASSWORD);

  if (!email || !password) {
    throw new Error("Chybí INITIAL_ADMIN_EMAIL nebo INITIAL_ADMIN_PASSWORD.");
  }
  if (password.length < 12) {
    throw new Error("INITIAL_ADMIN_PASSWORD musí mít alespoň 12 znaků.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing) {
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
    return;
  }

  if (resetPassword) {
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { email },
      data: {
        name,
        passwordHash,
        role: "SUPER_ADMIN",
        active: true,
      },
    });
    console.log(`Obnoveno heslo administrátora: ${email}`);
    return;
  }

  if (!existing.active || existing.role !== "SUPER_ADMIN") {
    await prisma.user.update({
      where: { email },
      data: { name, role: "SUPER_ADMIN", active: true },
    });
    console.log(`Obnoven aktivní administrátorský přístup: ${email}`);
    return;
  }

  console.log(
    `Administrátor ${email} již existuje. Heslo zůstalo beze změny. ` +
      `Pro reset nastav RESET_INITIAL_ADMIN_PASSWORD=true a znovu nasaď aplikaci.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
