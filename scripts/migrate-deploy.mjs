import { spawnSync } from "node:child_process";

const prismaCommand = process.platform === "win32" ? "npx.cmd" : "npx";

// These migrations are explicitly safe to retry after Prisma recorded a failed
// attempt.
// V21.3 SQL is written idempotently so a partial PostgreSQL application can be
// resumed.
const recoverableMigrations = [
  "20260716190000_invitation_unit_ids",
  "20260826190000_v21_3_lease_lifecycle",
];

function runPrisma(args, { capture = false } = {}) {
  const result = spawnSync(prismaCommand, ["prisma", ...args], {
    env: process.env,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

for (const migration of recoverableMigrations) {
  const recovery = runPrisma(
    ["migrate", "resolve", "--rolled-back", migration],
    { capture: true },
  );

  if (recovery.status === 0) {
    process.stdout.write(recovery.stdout ?? "");
    process.stderr.write(recovery.stderr ?? "");
    console.log(`[db:migrate] Neúspěšná migrace ${migration} označena jako rolled-back; následuje bezpečný retry.`);
  }
}

const deploy = runPrisma(["migrate", "deploy"]);
process.exit(deploy.status ?? 1);
