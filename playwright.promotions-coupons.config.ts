import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

loadEnvConfig(process.cwd());

const REQUIRED_ENVIRONMENT_VARIABLES = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "CLERK_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "E2E_CLERK_USER_EMAIL",
  "E2E_CLERK_ADMIN_EMAIL",
  "E2E_LOCAL_SUPABASE",
  "E2E_LOCAL_PAYMENT_HANDOFF",
] as const;

const E2E_BASE_URL = "http://localhost:4173";

function assertLocalPromotionsCouponsEnvironment(): void {
  const missing = REQUIRED_ENVIRONMENT_VARIABLES.filter((name) => !process.env[name]?.trim());
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? E2E_BASE_URL;
  const localApp = baseUrl === E2E_BASE_URL;
  const localSupabase = /^http:\/\/(127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (missing.length > 0 || !localApp || !localSupabase || process.env.E2E_LOCAL_SUPABASE !== "true") {
    throw new Error(
      "Promotions/coupons E2E requires local app and Supabase URLs, a disposable fixture, dedicated Clerk customer/admin users, and E2E_LOCAL_SUPABASE=true. Missing: " +
        missing.join(", "),
    );
  }
}

if (!process.argv.includes("--list")) assertLocalPromotionsCouponsEnvironment();

export default defineConfig({
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? E2E_BASE_URL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [
    { name: "customer-setup", testDir: "./tests/authenticated", testMatch: "auth.setup.ts", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "admin-setup", testDir: "./tests/promotions-coupons", testMatch: "admin.auth.setup.ts", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "customer", testDir: "./tests/promotions-coupons", testMatch: "customer.authenticated.spec.ts", dependencies: ["customer-setup"], use: { ...devices["Desktop Chrome"], channel: "chrome", storageState: "playwright/.clerk/user.json" } },
    { name: "admin", testDir: "./tests/promotions-coupons", testMatch: "admin.authenticated.spec.ts", dependencies: ["admin-setup"], use: { ...devices["Desktop Chrome"], channel: "chrome", storageState: "playwright/.clerk/promotions-coupons-admin.json" } },
  ],
  webServer: {
    command: "npm run dev -- --hostname localhost --port 4173",
    env: {
      ADMIN_EMAIL: process.env.E2E_CLERK_ADMIN_EMAIL ?? "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      E2E_LOCAL_PAYMENT_HANDOFF: process.env.E2E_LOCAL_PAYMENT_HANDOFF ?? "",
      E2E_LOCAL_SUPABASE: process.env.E2E_LOCAL_SUPABASE ?? "",
      MP_ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN ?? "",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    },
    reuseExistingServer: false,
    url: E2E_BASE_URL,
  },
});
