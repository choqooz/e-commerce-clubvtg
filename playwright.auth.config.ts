import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

loadEnvConfig(process.cwd());

const REQUIRED_AUTH_ENVIRONMENT_VARIABLES = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "E2E_CLERK_USER_EMAIL",
] as const;

function assertAuthenticatedE2EEnvironment(): void {
  const missingVariables = REQUIRED_AUTH_ENVIRONMENT_VARIABLES.filter(
    (variableName) => !process.env[variableName]?.trim(),
  );

  if (missingVariables.length > 0) {
    throw new Error(
      `Authenticated E2E cannot start. Set ${missingVariables.join(", ")} with Clerk development test credentials and a dedicated no-orders test user.`,
    );
  }
}

if (!process.argv.includes("--list")) {
  assertAuthenticatedE2EEnvironment();
}

export default defineConfig({
  testDir: "./tests/authenticated",
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "clerk-auth-setup",
      testMatch: "auth.setup.ts",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "chrome-authenticated",
      testMatch: "**/*.authenticated.spec.ts",
      dependencies: ["clerk-auth-setup"],
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        storageState: "playwright/.clerk/user.json",
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
  },
});
