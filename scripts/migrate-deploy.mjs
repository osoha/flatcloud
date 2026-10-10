import { spawnSync } from "node:child_process";

// A subscription simulation release must fail before touching a mismatched DB.
if (process.env.FLATBERRY_SUBSCRIPTIONS_SANDBOX === "1") {
  const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
  const isolatedLocal = !process.env.RENDER_SERVICE_ID && ["localhost", "127.0.0.1", "postgres"].includes(database.hostname);
  const namedSandbox = process.env.RENDER_SERVICE_ID === "srv-dacselkmqu1s73bmjoq0" && process.env.RENDER_GIT_BRANCH === "sandbox/ux-agent" && database.pathname === "/flatcloud_ux_sandbox";
  if (!isolatedLocal && !namedSandbox) throw new Error("Subscription sandbox release blocked: service, branch and database must match the isolated sandbox.");
}

const prismaCommand = process.platform === "win32" ? "npx.cmd" : "npx";

// These migrations are explicitly safe to retry after Prisma recorded a failed
// attempt.
// V21.3 and the password-reset SQL are idempotent, so a partial PostgreSQL
// application can be resumed without removing existing data.
const recoverableMigrations = [
  "20260716190000_invitation_unit_ids",
  "20260826190000_v21_3_lease_lifecycle",
  "20260929113000_self_service_password_reset",
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
