import { mkdir } from "node:fs/promises";
import path from "node:path";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test as setup } from "@playwright/test";

const AUTH_STORAGE_STATE_PATH = path.join(process.cwd(), "playwright/.clerk/user.json");

setup.describe.configure({ mode: "serial" });

setup("configures Clerk testing", async () => {
  await clerkSetup();
});

setup("signs in the authenticated E2E user", async ({ page }) => {
  await page.goto("/");
  await clerk.signIn({
    page,
    emailAddress: process.env.E2E_CLERK_USER_EMAIL!,
  });
  await page.goto("/orders");
  await expect(page).toHaveURL(/\/orders$/);

  await mkdir(path.dirname(AUTH_STORAGE_STATE_PATH), { recursive: true });
  await page.context().storageState({ path: AUTH_STORAGE_STATE_PATH });
});
