import { PrismaClient } from '@prisma/client';
import { ensureForecastTestHouse } from '../prisma/seed-forecast-test-house';
const db = new PrismaClient();
ensureForecastTestHouse(db).then(result => console.log(JSON.stringify(result)))
  .catch(error => { console.error(error instanceof Error ? error.message : 'Seed selhal.'); process.exitCode = 1; })
  .finally(() => db.$disconnect());
