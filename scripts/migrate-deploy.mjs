import { spawnSync } from "node:child_process";

const prismaCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const recoverableMigration = "20260716190000_invitation_unit_ids";

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

// Prisma po P3018 odmítá spouštět další migrace, dokud není neúspěšný
// pokus označen jako vrácený. Příkaz uspěje jen tehdy, když je tato konkrétní
// migrace skutečně v neúspěšném stavu. Na nové nebo již opravené databázi
// bezpečně selže a pokračujeme standardním migrate deploy.
const recovery = runPrisma(
  ["migrate", "resolve", "--rolled-back", recoverableMigration],
  { capture: true },
);

if (recovery.status === 0) {
  process.stdout.write(recovery.stdout ?? "");
  process.stderr.write(recovery.stderr ?? "");
  console.log(`[db:migrate] Obnovena neúspěšná migrace ${recoverableMigration}.`);
} else {
  console.log("[db:migrate] Žádná neúspěšná V12 migrace nevyžaduje obnovení.");
}

const deploy = runPrisma(["migrate", "deploy"]);
process.exit(deploy.status ?? 1);
