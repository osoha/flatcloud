import { prisma } from "../lib/db";
import { runRentNotifications } from "../lib/rent-notifications";

runRentNotifications().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
