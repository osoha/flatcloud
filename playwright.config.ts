import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const localBaseUrl = `http://127.0.0.1:${port}`;
const baseURL = process.env.E2E_BASE_URL || localBaseUrl;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "cs-CZ",
    timezoneId: "Europe/Prague",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run start -- --hostname 127.0.0.1 -p ${port}`,
        url: `${localBaseUrl}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          DATABASE_URL: process.env.DATABASE_URL || "",
          NEXT_TELEMETRY_DISABLED: "1",
          SESSION_SECRET:
            process.env.SESSION_SECRET ||
            "flatcloud-local-e2e-session-secret-at-least-32-characters",
        },
      },
});
