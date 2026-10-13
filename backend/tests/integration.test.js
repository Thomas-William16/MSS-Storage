import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { app, apiStore } from "../src/app.js";
import { loginStore } from "../src/routes/auth.js";
import { connectDatabase } from "../src/config/database.js";
import {
  User,
  Session,
  Category,
  Equipment,
  EquipmentItem,
  Borrowing,
  BorrowingItem,
  EquipmentRequest,
  Maintenance,
  AuditLog,
  Counter,
  roles,
} from "../src/models/index.js";
import { permissionMatrix } from "../src/middleware/security.js";
import { csvCell } from "../src/services/reports.js";
let replica, users, clients, csrf, category, equipment;
const origin = "http://localhost:3000",
  secret = "Test-only-password-2026";
const future = (days = 7) =>
  new Date(Date.now() + days * 86400000).toISOString();
const send = (role, method, path, body) =>
  clients[role][method](`/api/v1${path}`)
    .set("Origin", origin)
    .set("X-CSRF-Token", csrf[role])
    .send(body);
async function items(quantity = 2, extra = {}) {
  const res = await send(
    "ADMIN",
    "post",
    `/equipment/${equipment._id}/items/bulk`,
    { quantity, ...extra },
  );
  expect(res.status, res.text).toBe(201);
  return res.body.data;
}
async function loan(itemIds, extra = {}) {
  return send("ADMIN", "post", "/borrowings", {
    user: String(users.SCOUT._id),
    itemIds,
    expectedReturnDate: future(),
    purpose: "Weekend camp",
    ...extra,
  });
}
beforeAll(async () => {
  // Always a fresh, disposable replica set. Never use MONGODB_URI or a production DB in tests.
  replica = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
    binary: { version: "7.0.24", checkMD5: true },
  });
  await connectDatabase(replica.getUri("scout_storage_test"));
});
afterAll(async () => {
  await mongoose.disconnect();
  await replica?.stop();
});
beforeEach(async () => {
  await loginStore.resetAll();
  await apiStore.resetAll();
  for (const model of Object.values(mongoose.models))
    await model.deleteMany({});
  users = {};
  clients = {};
  csrf = {};
  const passwordHash = await bcrypt.hash(secret, 12);
  for (const role of roles) {
    users[role] = await User.create({
      name: role,
      email: `${role.toLowerCase()}@test.local`,
      role,
      passwordHash,
    });
    clients[role] = request.agent(app);
    const res = await clients[role]
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .send({ email: users[role].email, password: secret });
    expect(res.status, res.text).toBe(200);
    csrf[role] = res.body.data.csrfToken;
  }
  category = await Category.create({ name: "Camping" });
  equipment = await Equipment.create({
    name: "Tent",
    category: category._id,
    minimumStock: 2,
  });
});
describe("Authentication and access", () => {
  it("uses HttpOnly cookies, hides hashes, revokes logout, rejects expired sessions", async () => {
    const me = await clients.ADMIN.get("/api/v1/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.data.user.passwordHash).toBeUndefined();
    const login = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .send({ email: users.ADMIN.email, password: secret });
    expect(login.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(login.headers["set-cookie"][0]).toContain("SameSite=Lax");
    expect((await send("ADMIN", "post", "/auth/logout", {})).status).toBe(200);
    expect((await clients.ADMIN.get("/api/v1/auth/me")).status).toBe(401);
    await Session.updateMany(
      { user: users.SCOUT._id },
      { $set: { expiresAt: new Date(0) } },
    );
    expect((await clients.SCOUT.get("/api/v1/auth/me")).status).toBe(401);
  });
  it("rejects invalid credentials, missing authentication, CSRF and hostile origins", async () => {
    expect((await request(app).get("/api/v1/equipment")).status).toBe(401);
    expect(
      (
        await request(app)
          .post("/api/v1/auth/login")
          .set("Origin", origin)
          .send({ email: users.ADMIN.email, password: "incorrect" })
      ).status,
    ).toBe(401);
    expect(
      (
        await clients.ADMIN.post("/api/v1/equipment")
          .set("Origin", origin)
          .send({ name: "Boat", category: String(category._id) })
      ).status,
    ).toBe(403);
    expect(
      (
        await clients.ADMIN.post("/api/v1/equipment")
          .set("Origin", "https://evil.example")
          .set("X-CSRF-Token", csrf.ADMIN)
          .send({ name: "Boat", category: String(category._id) })
      ).status,
    ).toBe(403);
    expect(
      (await request(app).post("/api/v1/auth/register").send({ role: "ADMIN" }))
        .status,
    ).not.toBe(201);
  });
  it("tests the explicit permission matrix against representative protected endpoints for every role", async () => {
    const endpoints = {
      inventory: ["get", "/equipment"],
      manageInventory: [
        "post",
        "/equipment",
        { name: "Boat", category: String(category._id) },
      ],
      borrow: ["post", "/borrowings", {}],
      requests: ["get", "/requests"],
      reviewRequests: [
        "post",
        `/requests/${new mongoose.Types.ObjectId()}/approve`,
        { notes: "Approved" },
      ],
      maintenance: [
        "patch",
        `/maintenance/${new mongoose.Types.ObjectId()}`,
        {},
      ],
      reportDamage: ["post", "/maintenance", {}],
      reports: ["get", "/reports/inventory"],
      users: ["post", "/users", {}],
      taxonomy: ["post", "/categories", { name: "Outdoor" }],
      audit: ["get", "/audit-logs"],
    };
    for (const [permission, [method, path, body]] of Object.entries(endpoints))
      for (const role of roles) {
        const res = await send(role, method, path, body);
        if (permissionMatrix[permission].includes(role))
          expect(res.status, `${role} ${permission}`).not.toBe(403);
        else expect(res.status, `${role} ${permission}`).toBe(403);
      }
  });
  it("prevents mass assignment and deactivated users from retaining access", async () => {
    expect(
      (
        await send("SCOUT", "patch", `/users/${users.SCOUT._id}`, {
          role: "ADMIN",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await send("ADMIN", "post", "/users", {
          name: "New user",
          email: "new@test.local",
          password: secret,
          role: "SCOUT",
          isActive: true,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send("ADMIN", "post", "/users", {
          name: "New user",
          email: "new@test.local",
          password: "short",
          role: "SCOUT",
        })
      ).status,
    ).toBe(400);
    const res = await send(
      "ADMIN",
      "patch",
      `/users/${users.SCOUT._id}/status`,
      { isActive: false },
    );
    expect(res.status).toBe(200);
    expect((await clients.SCOUT.get("/api/v1/auth/me")).status).toBe(401);
  });
  it("never returns a newly changed password hash", async () => {
    const res = await send("ADMIN", "patch", `/users/${users.LEADER._id}`, {
      password: secret + "a",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.passwordHash).toBeUndefined();
    expect((await clients.LEADER.get("/api/v1/auth/me")).status).toBe(401);
  });
});
describe("Inventory integrity", () => {
  it("creates, updates, archives equipment and protects referenced taxonomy", async () => {
    const created = await send("STORAGE_KEEPER", "post", "/equipment", {
      name: "Stove",
      category: String(category._id),
      minimumStock: 3,
    });
    expect(created.status).toBe(201);
    expect(
      (
        await send("ADMIN", "patch", `/equipment/${created.body.data._id}`, {
          name: "Camp stove",
        })
      ).status,
    ).toBe(200);
    expect(
      (await send("ADMIN", "delete", `/categories/${category._id}`)).status,
    ).toBe(409);
    expect(
      (await send("ADMIN", "delete", `/equipment/${created.body.data._id}`))
        .status,
    ).toBe(200);
    expect(
      (await Equipment.findById(created.body.data._id)).archivedAt,
    ).toBeTruthy();
    expect(
      (
        await send(
          "ADMIN",
          "post",
          `/equipment/${created.body.data._id}/items/bulk`,
          { quantity: 1 },
        )
      ).status,
    ).toBe(409);
  });
  it("creates atomic bulk batches, rejects duplicate codes with no partial writes", async () => {
    const created = await items(3);
    expect(new Set(created.map((x) => x.itemCode)).size).toBe(3);
    const before = await Counter.findById(equipment._id);
    const res = await send(
      "ADMIN",
      "post",
      `/equipment/${equipment._id}/items/bulk`,
      { quantity: 2, codes: ["CUSTOM-001", created[0].itemCode] },
    );
    expect(res.status).toBe(409);
    expect(await EquipmentItem.countDocuments()).toBe(3);
    expect((await Counter.findById(equipment._id)).value).toBe(before.value);
    expect(
      (
        await send("ADMIN", "post", `/equipment/${equipment._id}/items/bulk`, {
          quantity: 2,
          codes: ["SAME", "SAME"],
        })
      ).status,
    ).toBe(400);
  });
  it("generates unique codes under concurrent batch creation", async () => {
    const results = await Promise.all([
      send("ADMIN", "post", `/equipment/${equipment._id}/items/bulk`, {
        quantity: 3,
      }),
      send("STORAGE_KEEPER", "post", `/equipment/${equipment._id}/items/bulk`, {
        quantity: 3,
      }),
    ]);
    for (const res of results) expect(res.status, res.text).toBe(201);
    expect(
      new Set((await EquipmentItem.find()).map((x) => x.itemCode)).size,
    ).toBe(6);
  });
  it("tracks damaged condition separately from mutually exclusive statuses and generates QR", async () => {
    const created = await items(2, { condition: "DAMAGED" });
    const result = await clients.ADMIN.get(
      `/api/v1/equipment/${equipment._id}`,
    );
    expect(result.body.data.counts.total).toBe(2);
    expect(result.body.data.counts.damaged).toBe(2);
    expect(result.body.data.counts.maintenance).toBe(2);
    const qr = await clients.SCOUT.get(`/api/v1/items/${created[0]._id}/qr`);
    expect(qr.status).toBe(200);
    expect(qr.headers["content-type"]).toContain("image/svg+xml");
    expect(qr.text || qr.body.toString("utf8")).toContain("<svg");
  });
});
describe("Borrowing and returns", () => {
  it("borrows available items, prevents status edits and archive during borrowing", async () => {
    const created = await items(2),
      res = await loan(created.map((x) => x._id));
    expect(res.status, res.text).toBe(201);
    expect(await EquipmentItem.countDocuments({ status: "BORROWED" })).toBe(2);
    expect(await BorrowingItem.countDocuments()).toBe(2);
    expect(
      (
        await send("ADMIN", "patch", `/items/${created[0]._id}`, {
          status: "AVAILABLE",
        })
      ).status,
    ).toBe(409);
    expect(
      (await send("ADMIN", "delete", `/equipment/${equipment._id}`)).status,
    ).toBe(409);
  });
  it("rejects unavailable, duplicate, unknown items and dates without partial issuance", async () => {
    const created = await items(2);
    await loan([created[0]._id]);
    expect((await loan([created[0]._id, created[1]._id])).status).toBe(409);
    expect((await EquipmentItem.findById(created[1]._id)).status).toBe(
      "AVAILABLE",
    );
    expect((await loan([created[1]._id, created[1]._id])).status).toBe(400);
    expect((await loan([String(new mongoose.Types.ObjectId())])).status).toBe(
      404,
    );
    expect(
      (await loan([created[1]._id], { expectedReturnDate: future(-1) })).status,
    ).toBe(400);
  });
  it("allows exactly one concurrent borrowing of the same item", async () => {
    const [item] = await items(1);
    const results = await Promise.all([loan([item._id]), loan([item._id])]);
    expect(results.map((x) => x.status).sort()).toEqual([201, 409]);
    expect(await Borrowing.countDocuments()).toBe(1);
    expect(await BorrowingItem.countDocuments()).toBe(1);
  });
  it("preserves partial returns, routes damage and lost items correctly, rejects repeat returns", async () => {
    const created = await items(3),
      res = await loan(created.map((x) => x._id)),
      id = res.body.data._id;
    const first = await send("ADMIN", "post", `/borrowings/${id}/return`, {
      items: [{ itemId: created[0]._id, condition: "GOOD" }],
    });
    expect(first.status, first.text).toBe(200);
    expect(first.body.data.status).toBe("PARTIAL");
    expect((await EquipmentItem.findById(created[1]._id)).status).toBe(
      "BORROWED",
    );
    expect(
      (
        await send("ADMIN", "post", `/borrowings/${id}/return`, {
          items: [{ itemId: created[0]._id, condition: "GOOD" }],
        })
      ).status,
    ).toBe(409);
    const last = await send(
      "STORAGE_KEEPER",
      "post",
      `/borrowings/${id}/return`,
      {
        items: [
          {
            itemId: created[1]._id,
            condition: "DAMAGED",
            notes: "Torn canvas",
          },
          { itemId: created[2]._id, condition: "FAIR", lost: true },
        ],
      },
    );
    expect(last.status, last.text).toBe(200);
    expect(last.body.data.status).toBe("RETURNED");
    expect((await EquipmentItem.findById(created[1]._id)).status).toBe(
      "MAINTENANCE",
    );
    expect((await EquipmentItem.findById(created[2]._id)).status).toBe("LOST");
    expect(await Maintenance.countDocuments()).toBe(1);
  });
  it("computes overdue from outstanding loans and enforces cross-user privacy", async () => {
    const [item] = await items(1),
      res = await loan([item._id]),
      id = res.body.data._id;
    await Borrowing.updateOne(
      { _id: id },
      { $set: { expectedReturnDate: new Date(Date.now() - 1000) } },
    );
    expect(
      (await clients.SCOUT.get(`/api/v1/borrowings/${id}`)).body.data.overdue,
    ).toBe(true);
    expect((await clients.LEADER.get(`/api/v1/borrowings/${id}`)).status).toBe(
      403,
    );
    expect(
      (await clients.LEADER.get("/api/v1/borrowings")).body.data,
    ).toHaveLength(0);
    expect(
      (await clients.ADMIN.get("/api/v1/reports/overdue")).body.meta.total,
    ).toBe(1);
    await send("ADMIN", "post", `/borrowings/${id}/return`, {
      items: [{ itemId: item._id, condition: "GOOD" }],
    });
    expect(
      (await clients.ADMIN.get("/api/v1/reports/overdue")).body.meta.total,
    ).toBe(0);
  });
  it("cancels erroneous issuance while preserving history and auditing", async () => {
    const [item] = await items(1),
      res = await loan([item._id]);
    expect(
      (
        await send("ADMIN", "post", `/borrowings/${res.body.data._id}/cancel`, {
          notes: "Entered by mistake; item never left storage",
        })
      ).status,
    ).toBe(200);
    expect((await EquipmentItem.findById(item._id)).status).toBe("AVAILABLE");
    expect(await BorrowingItem.countDocuments()).toBe(1);
    expect(
      await AuditLog.exists({ action: "BORROWING_CANCELLED" }),
    ).toBeTruthy();
  });
});
describe("Requests, maintenance and reporting", () => {
  async function req(quantity = 1) {
    return send("SCOUT", "post", "/requests", {
      items: [{ equipment: String(equipment._id), quantity }],
      neededFrom: future(1),
      neededUntil: future(7),
      purpose: "Patrol hike",
    });
  }
  it("approves without reserving, issues exact approved items once, records history", async () => {
    const [item] = await items(1),
      created = await req(),
      id = created.body.data._id;
    expect(created.status).toBe(201);
    expect((await clients.LEADER.get(`/api/v1/requests/${id}`)).status).toBe(
      403,
    );
    expect(
      (
        await send("ADMIN", "post", `/requests/${id}/approve`, {
          notes: "Approved",
        })
      ).status,
    ).toBe(200);
    expect((await EquipmentItem.findById(item._id)).status).toBe("AVAILABLE");
    const issued = await loan([item._id], { requestId: id });
    expect(issued.status, issued.text).toBe(201);
    expect((await EquipmentRequest.findById(id)).status).toBe("ISSUED");
    expect(
      (await EquipmentRequest.findById(id)).history.map((x) => x.status),
    ).toEqual(["PENDING", "APPROVED", "ISSUED"]);
  });
  it("rejects insufficient stock, rejects requests, restricts cancellation to owners or staff", async () => {
    const created = await req(2),
      id = created.body.data._id;
    expect(
      (
        await send("ADMIN", "post", `/requests/${id}/approve`, {
          notes: "Approved",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await send("LEADER", "post", `/requests/${id}/cancel`, {
          notes: "Cancel",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await send("STORAGE_KEEPER", "post", `/requests/${id}/reject`, {
          notes: "Insufficient stock",
        })
      ).status,
    ).toBe(200);
    expect((await EquipmentRequest.findById(id)).status).toBe("REJECTED");
    const second = await req();
    expect(
      (
        await send(
          "SCOUT",
          "post",
          `/requests/${second.body.data._id}/cancel`,
          { notes: "Plans changed" },
        )
      ).status,
    ).toBe(200);
  });
  it("revalidates stock when issuing an approved request", async () => {
    const [item] = await items(1),
      created = await req();
    await send("ADMIN", "post", `/requests/${created.body.data._id}/approve`, {
      notes: "Approved",
    });
    await loan([item._id]);
    expect(
      (await loan([item._id], { requestId: created.body.data._id })).status,
    ).toBe(409);
    expect(
      (await EquipmentRequest.findById(created.body.data._id)).status,
    ).toBe("APPROVED");
  });
  it("handles maintenance transitions and allows own borrowed-item damage reports without duplicate repairs", async () => {
    const [item] = await items(1),
      borrowed = await loan([item._id]);
    expect(
      (
        await send("LEADER", "post", "/maintenance", {
          equipmentItem: item._id,
          description: "Broken",
        })
      ).status,
    ).toBe(403);
    const repair = await send("SCOUT", "post", "/maintenance", {
      equipmentItem: item._id,
      description: "Torn canvas",
    });
    expect(repair.status, repair.text).toBe(201);
    expect((await EquipmentItem.findById(item._id)).status).toBe("BORROWED");
    expect(
      (
        await send(
          "ADMIN",
          "post",
          `/maintenance/${repair.body.data._id}/complete`,
          { condition: "GOOD", restore: true },
        )
      ).status,
    ).toBe(409);
    await send(
      "ADMIN",
      "post",
      `/borrowings/${borrowed.body.data._id}/return`,
      { items: [{ itemId: item._id, condition: "DAMAGED" }] },
    );
    expect(await Maintenance.countDocuments()).toBe(1);
    expect(
      (
        await send("ADMIN", "patch", `/maintenance/${repair.body.data._id}`, {
          status: "IN_PROGRESS",
          cost: 20,
          notes: "Patching",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await send(
          "ADMIN",
          "post",
          `/maintenance/${repair.body.data._id}/complete`,
          { condition: "GOOD", restore: true, cost: 25 },
        )
      ).status,
    ).toBe(200);
    expect((await EquipmentItem.findById(item._id)).status).toBe("AVAILABLE");
    expect(
      await AuditLog.exists({ action: "MAINTENANCE_COMPLETED" }),
    ).toBeTruthy();
  });
  it("returns database statistics, operational reports and safe paged CSV exports", async () => {
    const created = await items(3);
    await loan([created[0]._id]);
    const dash = await clients.ADMIN.get("/api/v1/reports/dashboard");
    expect(dash.body.data.physicalItems).toBe(3);
    expect(dash.body.data.counts.BORROWED).toBe(1);
    for (const type of [
      "inventory",
      "borrowings",
      "overdue",
      "damaged",
      "lost",
      "maintenance",
      "most-borrowed",
    ]) {
      const res = await clients.ADMIN.get(`/api/v1/reports/${type}?limit=1`);
      expect(res.status, res.text).toBe(200);
      expect(res.body.meta.limit).toBe(1);
    }
    const csv = await clients.ADMIN.get("/api/v1/reports/inventory?format=csv");
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('"Tent"');
    expect(csvCell("=CMD()")).toBe('"\'=CMD()"');
    expect(csvCell("  +SUM(1)")).toContain("'");
    expect((await clients.SCOUT.get("/api/v1/reports/inventory")).status).toBe(
      403,
    );
    expect(
      (await clients.ADMIN.get("/api/v1/equipment?limit=10000")).status,
    ).toBe(400);
    expect((await clients.ADMIN.get("/api/v1/items/not-an-id")).status).toBe(
      400,
    );
    expect(
      (await clients.ADMIN.get("/api/v1/equipment?search[$ne]=x")).status,
    ).toBe(200);
  });
});

describe("Additional state and HTTP invariants", () => {
  it("limits related user records to names and roles on private borrower and request pages", async () => {
    const [item] = await items(1);
    const borrowed = await loan([item._id]);
    const detail = await clients.SCOUT.get(
      `/api/v1/borrowings/${borrowed.body.data._id}`,
    );
    expect(detail.status).toBe(200);
    expect(detail.body.data.borrowedBy.name).toBe("ADMIN");
    expect(detail.body.data.borrowedBy.email).toBeUndefined();
    expect(detail.body.data.borrowedBy.phone).toBeUndefined();
    const requested = await send("SCOUT", "post", "/requests", {
      items: [{ equipment: String(equipment._id), quantity: 1 }],
      neededFrom: future(1),
      neededUntil: future(),
      purpose: "Private request",
    });
    const reqDetail = await clients.SCOUT.get(
      `/api/v1/requests/${requested.body.data._id}`,
    );
    expect(reqDetail.status).toBe(200);
    expect(reqDetail.body.data.history[0].user.email).toBeUndefined();
    expect(
      (await clients.ADMIN.get("/api/v1/borrowings")).body.data[0].borrowedBy
        .email,
    ).toBeUndefined();
    expect(
      (await clients.SCOUT.get("/api/v1/auth/me")).body.data.user.email,
    ).toBe(users.SCOUT.email);
  });

  it("keeps a reported repair blocking issuance even if a return is recorded good", async () => {
    const [item] = await items(1),
      borrowing = await loan([item._id]);
    expect(
      (
        await send("SCOUT", "post", "/maintenance", {
          equipmentItem: item._id,
          description: "Inspect the buckle",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await send(
          "ADMIN",
          "post",
          `/borrowings/${borrowing.body.data._id}/return`,
          { items: [{ itemId: item._id, condition: "GOOD" }] },
        )
      ).status,
    ).toBe(200);
    expect((await EquipmentItem.findById(item._id)).status).toBe("MAINTENANCE");
    expect((await loan([item._id])).status).toBe(409);
  });
  it("rejects mismatched request issuance without mutating items or the request", async () => {
    const created = await items(2);
    const requested = await send("SCOUT", "post", "/requests", {
      items: [{ equipment: String(equipment._id), quantity: 2 }],
      neededFrom: future(1),
      neededUntil: future(),
      purpose: "Camp",
    });
    await send(
      "ADMIN",
      "post",
      `/requests/${requested.body.data._id}/approve`,
      { notes: "Approved" },
    );
    expect(
      (await loan([created[0]._id], { requestId: requested.body.data._id }))
        .status,
    ).toBe(400);
    expect(await EquipmentItem.countDocuments({ status: "AVAILABLE" })).toBe(2);
    expect(
      (await EquipmentRequest.findById(requested.body.data._id)).status,
    ).toBe("APPROVED");
  });
  it("keeps archived equipment unavailable and rejects Unicode CSRF payloads safely", async () => {
    const [item] = await items(1);
    await send("ADMIN", "delete", `/equipment/${equipment._id}`);
    expect((await EquipmentItem.findById(item._id)).status).toBe("RETIRED");
    expect((await loan([item._id])).status).toBe(409);
    const result = await clients.ADMIN.post("/api/v1/categories")
      .set("Origin", origin)
      .set("X-CSRF-Token", "é".repeat(64))
      .send({ name: "Unsafe" });
    expect(result.status).toBe(403);
  });
  it("enforces login rate limiting without disabling the security middleware", async () => {
    // Requests still count against the live limiter, even when input validation fails.
    let response;
    for (let i = 0; i < 21; i++)
      response = await request(app)
        .post("/api/v1/auth/login")
        .set("Origin", origin)
        .send({ email: "not-an-email", password: "invalid" });
    expect(response.status).toBe(429);
    expect(response.body.error.message).toContain("Too many login attempts");
  });
});
