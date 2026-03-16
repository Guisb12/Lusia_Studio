import { test as setup } from "@playwright/test";

/**
 * Authenticates by filling the login form.
 * Saves browser storage state so all subsequent tests skip login.
 *
 * Required env vars (set in .env or via CLI):
 *   E2E_STUDENT_EMAIL
 *   E2E_STUDENT_PASSWORD
 */
setup("authenticate", async ({ page }) => {
  const email = process.env.E2E_STUDENT_EMAIL;
  const password = process.env.E2E_STUDENT_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Missing E2E_STUDENT_EMAIL or E2E_STUDENT_PASSWORD env vars. " +
        "Set them in .env or pass via CLI: E2E_STUDENT_EMAIL=... npx playwright test",
    );
  }

  await page.goto("/login");

  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for redirect — could be /student, /dashboard, /onboarding, or /auth/recover
  await page.waitForURL(/\/(student|dashboard|onboarding|auth)/, {
    timeout: 15_000,
  });

  const url = page.url();
  if (url.includes("/auth/recover") || url.includes("/onboarding")) {
    throw new Error(
      `Login succeeded but account is not fully set up. ` +
        `Landed on: ${url}. ` +
        `Please enroll and onboard this account first.`,
    );
  }

  console.log(`  Authenticated. Landed on: ${url}`);

  // Save signed-in state
  await page.context().storageState({ path: "./e2e/.auth/student.json" });
});
