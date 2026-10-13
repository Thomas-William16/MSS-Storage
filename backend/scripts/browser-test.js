import "./test-env.js";
import sharp from "sharp";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import { User } from "../src/models/index.js";
import { app } from "../src/app.js";
import assert from "node:assert/strict";
const replica = await MongoMemoryReplSet.create({
  binary: { version: "7.0.24", checkMD5: true },
  replSet: { count: 1, storageEngine: "wiredTiger" },
});
let server, browser, page;
try {
  await connectDatabase(replica.getUri("scout_storage_browser_test"));
  await User.create({
    name: "Browser Admin",
    email: "admin@browser.test",
    passwordHash: await bcrypt.hash("Browser-test-only-password", 12),
    role: "ADMIN",
  });
  server = await new Promise((resolve) => {
    const s = app.listen(3000, "127.0.0.1", () => resolve(s));
  });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://localhost:3000/login.html");
  await page.getByLabel("Email address").fill("admin@browser.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser-test-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard.html");
  await page.getByRole("heading", { name: "Storage overview" }).waitFor();
  await page.goto("http://localhost:3000/categories.html");
  await page.getByRole("button", { name: "Add new" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Camping");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("cell", { name: "Camping", exact: true }).waitFor();
  await page.goto("http://localhost:3000/equipment.html");
  await page.getByRole("button", { name: "New equipment" }).click();
  await page.getByLabel("Equipment name").fill("Patrol Tent");
  await page.getByLabel("Total stock", { exact: true }).fill("2");
  await page.getByLabel("Equipment photo", { exact: true }).setInputFiles({
    name: "tent.png",
    mimeType: "image/png",
    buffer: await sharp({
      create: { width: 40, height: 40, channels: 3, background: "#71508b" },
    })
      .png()
      .toBuffer(),
  });
  await page.getByRole("img", { name: "Equipment photo preview" }).waitFor();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("link", { name: "Patrol Tent" }).click();
  await page
    .locator('[data-count="available"] strong')
    .filter({ hasText: /^2$/ })
    .waitFor();
  await page.getByRole("img", { name: "Patrol Tent photo" }).waitFor();
  await page.getByRole("button", { name: "Add items" }).click();
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Review batch", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByRole("link", { name: /PATROL-TENT-.*-001/ }).waitFor();
  await page
    .locator('[data-count="available"] strong')
    .filter({ hasText: /^4$/ })
    .waitFor();
  await page.goto("http://localhost:3000/equipment.html");
  await page.getByRole("button", { name: "New equipment" }).click();
  await page.getByLabel("Equipment name").fill("Camp Stove");
  await page.getByLabel("Total stock", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("link", { name: "Camp Stove", exact: true }).waitFor();
  await page.goto("http://localhost:3000/users.html");
  await page.getByRole("button", { name: "New user" }).click();
  await page.getByLabel("Full name").fill("Patrol Scout");
  await page.getByLabel("Email", { exact: true }).fill("scout@browser.test");
  await page
    .getByLabel("Password (at least 12 characters)")
    .fill("Scout-browser-only-password");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("cell", { name: "Patrol Scout", exact: true }).waitFor();
  await page.goto("http://localhost:3000/borrowings.html");
  await page.getByRole("button", { name: "Issue equipment" }).click();
  await page
    .getByLabel("Borrower", { exact: true })
    .selectOption({ label: "Patrol Scout" });
  await page
    .getByLabel("Purpose", { exact: true })
    .fill("Browser verified camp");
  const tentCard = page.locator(".borrow-card").filter({
    has: page.getByRole("heading", { name: "Patrol Tent", exact: true }),
  });
  await tentCard.getByLabel("Patrol Tent quantity to add").fill("2");
  await tentCard.getByRole("button", { name: "Add to cart" }).click();
  await page
    .locator(".borrow-card")
    .filter({
      has: page.getByRole("heading", { name: "Camp Stove", exact: true }),
    })
    .getByRole("button", { name: "Add to cart" })
    .click();
  await page
    .locator(".cart-summary")
    .filter({ hasText: "2 equipment types · 3 physical items" })
    .waitFor();
  assert.equal(
    await page
      .locator(".borrow-card")
      .filter({
        has: page.getByRole("heading", { name: "Camp Stove", exact: true }),
      })
      .getByRole("button", { name: "Add to cart" })
      .isDisabled(),
    true,
  );
  await page.screenshot({
    path: "/tmp/scout-storage-cart-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Confirm issuance" }).click();
  await page.getByRole("cell", { name: "Browser verified camp" }).waitFor();
  await page.getByRole("link", { name: /BR-/ }).first().click();
  await page.getByRole("button", { name: "Record returns" }).click();
  for (const check of await page
    .getByRole("checkbox", { name: /^Return / })
    .all())
    await check.check();
  await page
    .getByRole("button", { name: "Record returns", exact: true })
    .last()
    .click();
  await page.locator(".detail-line .badge.returned").waitFor();
  const loanDetail = await page.evaluate(async () => {
    const id = new URLSearchParams(location.search).get("id");
    return (await (await fetch(`/api/v1/borrowings/${id}`)).json()).data;
  });
  assert.ok(
    loanDetail.items.every((item) => item.resolution === "RETURNED"),
    "Cart items must be returned, not marked lost",
  );
  await page.goto("http://localhost:3000/requests.html");
  await page.getByRole("button", { name: "New request" }).click();
  await page.getByLabel("Purpose", { exact: true }).fill("Scout day hike");
  await page.getByLabel(/Patrol Tent.*currently available/).fill("1");
  await page.getByRole("button", { name: "Submit request" }).click();
  await page.getByRole("cell", { name: "Scout day hike" }).waitFor();
  await page.getByRole("link", { name: /RQ-/ }).first().click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByLabel("Decision notes").fill("Approved for hike");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".detail-line .badge.approved").waitFor();
  await page.goto("http://localhost:3000/equipment.html");
  await page.getByRole("link", { name: "Patrol Tent" }).click();
  await page.getByRole("link", { name: /PATROL-TENT-.*-001/ }).click();
  await page.getByRole("button", { name: "Report damage" }).click();
  await page.getByLabel("Describe the damage").fill("Torn seam");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".badge.maintenance").waitFor();
  await page.getByRole("img", { name: "Item QR code" }).waitFor();
  await page.goto("http://localhost:3000/maintenance.html");
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".badge.completed").waitFor();
  for (const route of [
    "reports",
    "audit-logs",
    "locations",
    "settings",
    "dashboard",
  ]) {
    await page.goto(`http://localhost:3000/${route}.html`);
    await page.locator("main h1").waitFor();
    assert.equal(await page.locator("main .form-error").count(), 0, route);
  }
  await page.screenshot({
    path: "/tmp/scout-storage-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/dashboard.html");
  await page.getByRole("heading", { name: "Storage overview" }).waitFor();
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Equipment", exact: true })
    .click();
  await page.getByRole("heading", { name: "Equipment", exact: true }).waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Mobile page must not overflow",
  );
  await page.screenshot({
    path: "/tmp/scout-storage-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await page.goto("http://localhost:3000/borrowings.html");
  await page.getByRole("button", { name: "Issue equipment" }).click();
  await page
    .getByRole("heading", { name: "Borrowing cart", exact: true })
    .waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Mobile cart must not overflow",
  );
  await page.screenshot({
    path: "/tmp/scout-storage-cart-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login.html");
  await page.getByLabel("Email address").fill("scout@browser.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Scout-browser-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard.html");
  await page.getByRole("heading", { name: "Storage overview" }).waitFor();
  assert.equal(
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Users", exact: true })
      .count(),
    0,
  );
  await page.goto("http://localhost:3000/requests.html");
  await page.getByRole("button", { name: "New request" }).click();
  await page.getByLabel("Purpose", { exact: true }).fill("Scout owned request");
  await page.getByLabel(/Patrol Tent.*currently available/).fill("1");
  await page.getByRole("button", { name: "Submit request" }).click();
  await page.getByRole("cell", { name: "Scout owned request" }).waitFor();
  await page.getByRole("link", { name: /RQ-/ }).first().click();
  assert.equal(
    await page.getByRole("button", { name: "Approve", exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "Cancel request" }).click();
  await page.getByLabel("Decision notes").fill("Activity cancelled");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".detail-line .badge.cancelled").waitFor();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login.html");
  console.log(
    "Browser integration passed: login, taxonomy, equipment/photo/initial stock/bulk items, user, multi-type borrowing cart/return, request/approval, damage/repair, QR, reports/audit/settings, mobile navigation, scout request/cancellation and logout.",
  );
} catch (error) {
  await page?.screenshot({
    path: "/tmp/scout-storage-browser-failure.png",
    fullPage: true,
  });
  console.error(await page?.locator("dialog, #toasts").allTextContents());
  throw error;
} finally {
  await browser?.close();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await mongoose.disconnect();
  await replica.stop();
}
