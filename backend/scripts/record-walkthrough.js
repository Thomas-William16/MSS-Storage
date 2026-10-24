import "./test-env.js";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { chromium } from "@playwright/test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import {
  User,
  Category,
  Equipment,
  EquipmentItem,
  Borrowing,
  BorrowingItem,
  EquipmentRequest,
  Maintenance,
} from "../src/models/index.js";
const key = process.argv[2];
assert.ok(
  ["admin", "keeper", "scout"].includes(key),
  "Choose admin, keeper or scout",
);
const build = process.env.WALKTHROUGH_BUILD || "/workspace/walkthrough-build";
const scripts = JSON.parse(
  await fs.readFile(path.join(build, "scripts.json"), "utf8"),
);
const script = scripts[key],
  port = 3160 + ["admin", "keeper", "scout"].indexOf(key),
  base = `http://localhost:${port}`;
process.env.FRONTEND_URL = base;
process.env.PUBLIC_APP_URL = base;
const { app } = await import("../src/app.js");
const { connectDatabase } = await import("../src/config/database.js");
const { createItems } = await import("../src/services/inventory.js");
const { issue } = await import("../src/services/borrowing.js");
const { createRequest, changeRequest } =
  await import("../src/services/requests.js");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const future = (days) => new Date(Date.now() + days * 86400000);
const replica = await MongoMemoryReplSet.create({
  binary: { version: "7.0.24", checkMD5: true },
  replSet: { count: 1, storageEngine: "wiredTiger" },
});
let browser, context, page, server;
const timeline = {
  key,
  title: script.title,
  role: script.role,
  scenes: [],
  assertions: [],
  demoDatabase: true,
};
const errors = [];
const capture = path.join(build, key);
await fs.mkdir(capture, { recursive: true });
const password = crypto.randomBytes(20).toString("hex");
const memberPassword = crypto.randomBytes(20).toString("hex");
try {
  await connectDatabase(replica.getUri(`walkthrough_${key}_isolated`));
  const passwordHash = await bcrypt.hash(password, 12);
  const users = {};
  for (const [role, name, email] of [
    ["ADMIN", "مدير تجريبي", "admin@demo.example"],
    ["STORAGE_KEEPER", "أمين مخزن تجريبي", "keeper@demo.example"],
    ["SCOUT", "كشّاف تجريبي", "scout@demo.example"],
  ])
    users[role] = await User.create({ name, email, passwordHash, role });
  const other = await User.create({
    name: "كشّاف آخر",
    email: "other@demo.example",
    passwordHash,
    role: "SCOUT",
  });
  const category = await Category.create({
    name: "Camping",
    description: "Demo equipment for this tutorial only",
  });
  const tent = await Equipment.create({
    name: "Patrol Tent",
    category: category._id,
    minimumStock: 2,
    description: "Tent with individually tracked physical items",
  });
  const stove = await Equipment.create({
    name: "Camp Stove",
    category: category._id,
    description: "Portable cooking stove",
  });
  const tents = await createItems(users.ADMIN, tent._id, {
    quantity: 6,
    codes: Array.from(
      { length: 6 },
      (_, i) => `TENT-${String(i + 1).padStart(3, "0")}`,
    ),
  });
  const stoves = await createItems(users.ADMIN, stove._id, {
    quantity: 3,
    codes: ["STOVE-001", "STOVE-002", "STOVE-003"],
  });
  const scoutLoan = await issue(users.ADMIN, {
    user: String(users.SCOUT._id),
    itemIds: [String(tents[0]._id), String(stoves[0]._id)],
    expectedReturnDate: future(4),
    purpose: "Scout day camp",
  });
  await issue(users.ADMIN, {
    user: String(other._id),
    itemIds: [String(tents[1]._id)],
    expectedReturnDate: future(2),
    purpose: "Other scout camp",
  });
  const req = await createRequest(users.SCOUT, {
    items: [{ equipment: String(tent._id), quantity: 1 }],
    neededFrom: future(1),
    neededUntil: future(7),
    purpose: "Weekend patrol camp",
  });
  const rejectReq = await createRequest(users.SCOUT, {
    items: [{ equipment: String(stove._id), quantity: 1 }],
    neededFrom: future(1),
    neededUntil: future(7),
    purpose: "Alternative camp request",
  });
  const approved = await createRequest(users.SCOUT, {
    items: [{ equipment: String(tent._id), quantity: 1 }],
    neededFrom: future(1),
    neededUntil: future(6),
    purpose: "Approved scout request",
  });
  await changeRequest(
    users.ADMIN,
    String(approved._id),
    "APPROVED",
    "Approved by the demo administrator",
  );
  server = await new Promise((resolve) => {
    const s = app.listen(port, "127.0.0.1", () => resolve(s));
  });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: capture, size: { width: 1280, height: 720 } },
    locale: "en-GB",
    timezoneId: "Africa/Cairo",
    reducedMotion: "reduce",
  });
  const start = performance.now();
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  async function go(route) {
    await page.goto(base + route);
    await page.locator("main h1, #login-form h1").first().waitFor();
    await pause(500);
  }
  async function click(locator) {
    await locator.scrollIntoViewIfNeeded();
    const handle = await locator.elementHandle();
    const box = await locator.boundingBox();
    if (box)
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
        steps: 10,
      });
    await handle.evaluate((n) => {
      n.dataset.previousOutline = n.style.outline;
      n.style.outline = "3px solid #bc995f";
      n.style.outlineOffset = "3px";
    });
    await pause(550);
    await locator.click();
    try {
      await handle.evaluate(
        (n) => (n.style.outline = n.dataset.previousOutline || ""),
      );
    } catch {}
    await pause(450);
  }
  async function fill(label, value) {
    const loc = page.getByLabel(label, { exact: true });
    await loc.scrollIntoViewIfNeeded();
    await loc.fill("");
    await loc.pressSequentially(value, { delay: 35 });
    await pause(200);
  }
  async function save() {
    await click(page.getByRole("button", { name: "Save", exact: true }));
    await page.locator("dialog").waitFor({ state: "hidden" });
  }
  async function openLoan(purpose) {
    await go("/borrowings.html");
    await click(
      page
        .getByRole("row")
        .filter({ hasText: purpose })
        .getByRole("link", { name: /BR-/ }),
    );
    await page.getByRole("heading", { name: /Borrowing BR-/ }).waitFor();
  }
  async function openRequest(purpose) {
    await go("/requests.html");
    await click(
      page
        .getByRole("row")
        .filter({ hasText: purpose })
        .getByRole("link", { name: /RQ-/ }),
    );
    await page.getByRole("heading", { name: /Request RQ-/ }).waitFor();
  }
  async function decision(action, purpose, notes) {
    await openRequest(purpose);
    await click(page.getByRole("button", { name: action, exact: true }));
    await fill("Decision notes", notes);
    await save();
    await page
      .locator(
        `.detail-line .badge.${action === "Approve" ? "approved" : action === "Reject" ? "rejected" : "cancelled"}`,
      )
      .waitFor();
  }
  async function addCart(name, quantity) {
    const card = page
      .locator(".borrow-card")
      .filter({ has: page.getByRole("heading", { name, exact: true }) });
    await card.getByLabel(`${name} quantity to add`).fill(String(quantity));
    await click(card.getByRole("button", { name: "Add to cart" }));
  }
  async function newIssue() {
    await go("/borrowings.html");
    await click(page.getByRole("button", { name: "Issue equipment" }));
    await page
      .getByLabel("Borrower", { exact: true })
      .selectOption({ label: users.SCOUT.name });
    await fill("Purpose", `${key} demo camp`);
    await addCart("Patrol Tent", 2);
    await addCart("Camp Stove", 1);
    await pause(1800);
    await click(page.getByRole("button", { name: "Confirm issuance" }));
    await page
      .getByRole("cell", { name: `${key} demo camp`, exact: true })
      .waitFor();
    assert.equal(
      await BorrowingItem.countDocuments({
        borrowing: (await Borrowing.findOne({ purpose: `${key} demo camp` }))
          ._id,
      }),
      3,
    );
  }
  async function reportDamage(itemId, description) {
    await go(`/equipment-item.html?id=${itemId}`);
    await click(
      page.getByRole("button", { name: "Report damage", exact: true }),
    );
    await fill("Describe the damage", description);
    await save();
    await page.locator(".badge.damaged").first().waitFor();
  }
  async function repair() {
    await go("/maintenance.html");
    const row = page
      .getByRole("row")
      .filter({
        has: page.getByRole("button", { name: "Update", exact: true }),
      })
      .first();
    await click(row.getByRole("button", { name: "Update", exact: true }));
    await page
      .getByLabel("Repair status", { exact: true })
      .selectOption("IN_PROGRESS");
    await page
      .getByLabel("Cost (organization currency)", { exact: true })
      .fill("20");
    await fill("Notes", "Repair in progress");
    await save();
    const finish = page
      .getByRole("button", { name: "Complete", exact: true })
      .first();
    await click(finish);
    await page
      .getByLabel("Condition after repair", { exact: true })
      .selectOption("GOOD");
    await page
      .getByLabel("Authorized disposition", { exact: true })
      .selectOption("yes");
    await page.getByLabel("Final cost", { exact: true }).fill("25");
    await fill("Completion notes", "Repair completed and checked");
    await save();
    await page.locator(".badge.completed").waitFor();
  }
  async function report() {
    await go("/reports.html");
    await page.getByLabel("Report type").selectOption("borrowings");
    await click(page.getByRole("button", { name: "Apply filters" }));
    await pause(800);
    const event = page.waitForEvent("download");
    await click(page.getByRole("button", { name: "Export current page" }));
    const file = await event;
    await file.saveAs(path.join(capture, "report.csv"));
    assert.ok((await fs.stat(path.join(capture, "report.csv"))).size > 0);
    timeline.assertions.push("CSV download succeeded");
  }
  async function login() {
    await fill("Email address", users[script.role].email);
    await fill("Password", password);
    await click(page.getByRole("button", { name: "Sign in", exact: true }));
    await page.waitForURL("**/dashboard.html");
    await page.getByRole("heading", { name: "Storage overview" }).waitFor();
  }
  let lantern, loan;
  const shared = {
    intro: async () => {},
    login,
    overview: async () => {
      await go("/dashboard.html");
      await page.getByRole("heading", { name: "Storage overview" }).waitFor();
    },
    reports: report,
    logout: async () => {
      await click(page.getByRole("button", { name: "Sign out", exact: true }));
      await page.waitForURL("**/login.html");
      assert.equal(
        (await page.request.get(base + "/api/v1/auth/me")).status(),
        401,
      );
    },
  };
  const admin = {
    category: async () => {
      await go("/equipment.html");
      await click(page.getByRole("button", { name: "Add new category" }));
      await fill("Name", "Expedition tools");
      await fill("Description", "Demo category created by an administrator");
      await save();
      await page
        .getByLabel("All categories")
        .locator("option", { hasText: "Expedition tools" })
        .waitFor({ state: "attached" });
    },
    "new-equipment": async () => {
      await go("/equipment.html");
      await click(page.getByRole("button", { name: "New equipment" }));
      await fill("Equipment name", "Camp Lantern");
      await page.getByLabel("Total stock", { exact: true }).fill("2");
      await fill("Description", "Demo lantern");
      await pause(1200);
      await save();
      lantern = await Equipment.findOne({ name: "Camp Lantern" });
      assert.equal(
        await EquipmentItem.countDocuments({
          equipmentId: lantern._id,
          status: "AVAILABLE",
        }),
        2,
      );
    },
    stock: async () => {
      await go("/equipment.html");
      await click(
        page
          .getByRole("row")
          .filter({ hasText: "Camp Lantern" })
          .getByRole("button", { name: "Edit", exact: true }),
      );
      await page.getByLabel("Total stock", { exact: true }).fill("3");
      await save();
      assert.equal(
        await EquipmentItem.countDocuments({ equipmentId: lantern._id }),
        3,
      );
    },
    bulk: async () => {
      await go(`/equipment-details.html?id=${lantern._id}`);
      await click(page.getByRole("button", { name: "Add items" }));
      await page.getByLabel("Quantity", { exact: true }).fill("2");
      await click(
        page.getByRole("button", { name: "Review batch", exact: true }),
      );
      await pause(1500);
      await click(page.getByRole("button", { name: "Confirm", exact: true }));
      await page.locator("dialog").waitFor({ state: "hidden" });
      await page
        .locator('[data-count="available"] strong')
        .filter({ hasText: /^5$/ })
        .waitFor();
    },
    "item-qr": async () => {
      const item = await EquipmentItem.findOne({ equipmentId: lantern._id });
      await go(`/equipment-item.html?id=${item._id}`);
      await page.getByRole("img", { name: "Item QR code" }).waitFor();
      const event = page.waitForEvent("download");
      await click(
        page.getByRole("button", { name: "Download QR", exact: true }),
      );
      const file = await event;
      await file.saveAs(path.join(capture, "item-qr.svg"));
      assert.ok(
        (await fs.readFile(path.join(capture, "item-qr.svg"), "utf8")).includes(
          "<svg",
        ),
      );
    },
    users: async () => {
      await go("/users.html");
      await click(page.getByRole("button", { name: "New user" }));
      await fill("Full name", "Demo member");
      await fill("Email", "member@demo.example");
      await fill("Password (at least 8 characters)", memberPassword);
      await page.getByLabel("Role", { exact: true }).selectOption("SCOUT");
      await save();
      await page
        .getByRole("cell", { name: "Demo member", exact: true })
        .waitFor();
    },
    "account-access": async () => {
      const member = () =>
        page.getByRole("row").filter({ hasText: "member@demo.example" });
      await click(member().getByRole("button", { name: "Edit", exact: true }));
      await page
        .getByLabel("Role", { exact: true })
        .selectOption("STORAGE_KEEPER");
      await save();
      await click(
        member().getByRole("button", { name: "Deactivate", exact: true }),
      );
      await click(page.getByRole("button", { name: "Confirm", exact: true }));
      await member().locator(".badge.inactive").waitFor();
      await click(
        member().getByRole("button", { name: "Activate", exact: true }),
      );
      await click(page.getByRole("button", { name: "Confirm", exact: true }));
      await member().locator(".badge.active").waitFor();
    },
    requests: async () => {
      await decision(
        "Approve",
        "Weekend patrol camp",
        "Available stock checked",
      );
      await decision(
        "Reject",
        "Alternative camp request",
        "Alternative equipment needed for this activity",
      );
    },
    "issue-approved": async () => {
      await openRequest("Weekend patrol camp");
      await click(
        page.getByRole("button", { name: "Issue equipment", exact: true }),
      );
      await addCart("Patrol Tent", 1);
      await click(page.getByRole("button", { name: "Confirm issuance" }));
      await page.waitForURL("**/borrowings.html");
      assert.equal((await EquipmentRequest.findById(req._id)).status, "ISSUED");
    },
    cart: async () => {
      await newIssue();
      loan = await Borrowing.findOne({ purpose: "admin demo camp" });
    },
    "partial-return": async () => {
      await openLoan("admin demo camp");
      await click(
        page.getByRole("button", { name: "Record returns", exact: true }),
      );
      await click(page.getByRole("checkbox", { name: /^Return / }).first());
      await click(
        page
          .getByRole("button", { name: "Record returns", exact: true })
          .last(),
      );
      await page.locator(".detail-line .badge.partial").waitFor();
    },
    "all-return": async () => {
      await click(
        page.getByRole("button", { name: "Record returns", exact: true }),
      );
      await click(
        page.getByRole("button", { name: "Select all", exact: true }),
      );
      const tentRow = page.getByRole("row").filter({ hasText: /TENT-/ });
      await tentRow
        .getByLabel("Returned condition", { exact: true })
        .selectOption("DAMAGED");
      await tentRow
        .getByLabel("Return notes", { exact: true })
        .fill("Torn canvas during demo camp");
      const stoveRow = page.getByRole("row").filter({ hasText: /STOVE-/ });
      await click(
        stoveRow.getByRole("checkbox", { name: "Mark lost", exact: true }),
      );
      await stoveRow
        .getByLabel("Return notes", { exact: true })
        .fill("Lost during demo camp");
      await click(
        page
          .getByRole("button", { name: "Record returns", exact: true })
          .last(),
      );
      await page.locator(".detail-line .badge.returned").waitFor();
      assert.equal(await EquipmentItem.countDocuments({ status: "LOST" }), 1);
      assert.equal(await Maintenance.countDocuments({ status: "OPEN" }), 1);
    },
    maintenance: repair,
    "archive-audit": async () => {
      await go("/equipment.html");
      await click(
        page
          .getByRole("row")
          .filter({ hasText: "Camp Lantern" })
          .getByRole("button", { name: "Archive", exact: true }),
      );
      await click(page.getByRole("button", { name: "Confirm", exact: true }));
      await page
        .getByRole("link", { name: "Camp Lantern", exact: true })
        .waitFor({ state: "hidden" });
      await go("/audit-logs.html");
      await page
        .getByRole("cell", { name: "EQUIPMENT ARCHIVED", exact: true })
        .waitFor();
    },
  };
  const keeper = {
    inventory: async () => {
      await go("/equipment.html");
      await click(page.getByRole("button", { name: "New equipment" }));
      await fill("Equipment name", "Camp Rope");
      await page.getByLabel("Total stock", { exact: true }).fill("2");
      await save();
      assert.equal(
        await EquipmentItem.countDocuments({
          equipmentId: (await Equipment.findOne({ name: "Camp Rope" }))._id,
        }),
        2,
      );
    },
    items: async () => {
      await go(`/equipment-item.html?id=${tents[2]._id}`);
      await click(page.getByRole("button", { name: "Edit item", exact: true }));
      await fill("Serial number", "DEMO-003");
      await fill("Notes", "Checked before issuance");
      await save();
      await page.getByText("DEMO-003", { exact: true }).waitFor();
    },
    requests: async () => {
      await decision(
        "Approve",
        "Weekend patrol camp",
        "Approved after stock review",
      );
      await decision(
        "Reject",
        "Alternative camp request",
        "Activity cancelled",
      );
    },
    cart: newIssue,
    return: async () => {
      await openLoan("keeper demo camp");
      await click(
        page.getByRole("button", { name: "Record returns", exact: true }),
      );
      await click(
        page.getByRole("button", { name: "Select all", exact: true }),
      );
      for (const c of await page
        .getByRole("checkbox", { name: "Mark lost", exact: true })
        .all())
        assert.equal(await c.isChecked(), false);
      await click(
        page
          .getByRole("button", { name: "Record returns", exact: true })
          .last(),
      );
      await page.locator(".detail-line .badge.returned").waitFor();
    },
    damage: async () =>
      reportDamage(tents[2]._id, "Demo damage report: torn seam"),
    repair,
    limits: async () => {
      await go("/equipment.html");
      assert.equal(
        await page.getByRole("button", { name: "Add new category" }).count(),
        0,
      );
      assert.equal(
        await page
          .getByRole("navigation")
          .getByRole("link", { name: "Users", exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByRole("navigation")
          .getByRole("link", { name: "Audit trail", exact: true })
          .count(),
        0,
      );
      assert.equal(
        (await page.request.get(base + "/api/v1/audit-logs")).status(),
        403,
      );
    },
  };
  const scout = {
    equipment: async () => {
      await go("/equipment.html");
      assert.equal(
        await page.getByRole("button", { name: "New equipment" }).count(),
        0,
      );
      await click(page.getByRole("link", { name: "Patrol Tent", exact: true }));
      await page.getByRole("link", { name: "TENT-001", exact: true }).waitFor();
    },
    request: async () => {
      await go("/requests.html");
      await click(page.getByRole("button", { name: "New request" }));
      await fill("Purpose", "Scout hiking request");
      await page.getByLabel(/Patrol Tent.*currently available/).fill("1");
      await page.getByLabel(/Camp Stove.*currently available/).fill("1");
      await click(
        page.getByRole("button", { name: "Submit request", exact: true }),
      );
      await page
        .getByRole("cell", { name: "Scout hiking request", exact: true })
        .waitFor();
    },
    tracking: async () => {
      await openRequest("Scout hiking request");
      assert.equal(
        await page
          .getByRole("button", { name: "Approve", exact: true })
          .count(),
        0,
      );
      await openRequest("Approved scout request");
      await page.locator(".detail-line .badge.approved").waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Issue equipment", exact: true })
          .count(),
        0,
      );
    },
    cancel: async () => {
      await decision("Cancel request", "Scout hiking request", "Plans changed");
    },
    borrowing: async () => {
      await go("/borrowings.html");
      assert.equal(
        await page.getByText("Other scout camp", { exact: true }).count(),
        0,
      );
      await click(
        page
          .getByRole("row")
          .filter({ hasText: "Scout day camp" })
          .getByRole("link", { name: /BR-/ }),
      );
      await page.getByRole("heading", { name: /Borrowing BR-/ }).waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Record returns", exact: true })
          .count(),
        0,
      );
      assert.equal(
        (await page.request.get(base + "/api/v1/reports/inventory")).status(),
        403,
      );
    },
    damage: async () =>
      reportDamage(tents[0]._id, "Demo scout report: damaged tent fabric"),
    maintenance: async () => {
      await go("/maintenance.html");
      await page
        .getByRole("cell", {
          name: "Demo scout report: damaged tent fabric",
          exact: true,
        })
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Complete", exact: true })
          .count(),
        0,
      );
    },
    "qr-account": async () => {
      await go(`/equipment-item.html?id=${tents[0]._id}`);
      await page.getByRole("img", { name: "Item QR code" }).waitFor();
      await pause(2300);
      await go("/settings.html");
      await page
        .getByRole("heading", { name: "My account", exact: true })
        .waitFor();
    },
  };
  await go("/login.html");
  for (const scene of script.scenes) {
    const begun = performance.now(),
      startMs = begun - start;
    console.log(`${key}: ${scene.id} — recording`);
    const action = { ...shared, ...{ admin, keeper, scout }[key] }[scene.id];
    assert.ok(action, scene.id);
    await action();
    const remaining =
      scene.audioDuration * 1000 + 1600 - (performance.now() - begun);
    if (process.env.WALKTHROUGH_FAST === "1") await pause(800);
    else if (remaining > 0) await pause(remaining);
    const endMs = performance.now() - start;
    timeline.scenes.push({ ...scene, startMs, endMs, verified: true });
  }
  assert.deepEqual(errors, [], "No uncaught browser errors allowed");
  timeline.assertions.push(
    "All role workflow steps succeeded",
    "No browser errors",
    "No production data used",
  );
  const video = page.video();
  await context.close();
  context = null;
  timeline.rawVideo = await video.path();
  timeline.durationMs = performance.now() - start;
  timeline.fast = process.env.WALKTHROUGH_FAST === "1";
  await fs.writeFile(
    path.join(capture, "timeline.json"),
    JSON.stringify(timeline, null, 2),
  );
  console.log(`${key}: COMPLETE ${timeline.scenes.length} scenes`);
} catch (error) {
  await fs.writeFile(
    path.join(capture, "failed-timeline.json"),
    JSON.stringify(timeline, null, 2),
  );
  await page
    ?.screenshot({ path: path.join(capture, "failure.png"), fullPage: true })
    .catch(() => {});
  console.error(`${key}: FAILED`, error.message);
  console.error(
    await page?.locator("dialog, #toasts, .form-error").allTextContents(),
  );
  process.exitCode = 1;
} finally {
  await context?.close();
  await browser?.close();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await mongoose.disconnect();
  await replica.stop();
}
