import { mkdir } from "node:fs/promises";
import path from "node:path";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test as setup } from "@playwright/test";

const ADMIN_STORAGE_STATE_PATH = path.join(process.cwd(), "playwright/.clerk/promotions-coupons-admin.json");

setup.describe.configure({ mode: "serial" });

setup("configures Clerk administration testing", async () => {
  await clerkSetup();
});

setup("signs in the promotions and coupons administrator", async ({ page }) => {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_ADMIN_EMAIL! });
  await page.goto("/admin/coupons");
  await expect(page).toHaveURL(/\/admin\/coupons$/);
  await mkdir(path.dirname(ADMIN_STORAGE_STATE_PATH), { recursive: true });
  await page.context().storageState({ path: ADMIN_STORAGE_STATE_PATH });
});
