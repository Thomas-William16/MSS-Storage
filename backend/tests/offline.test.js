import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import {
  parse,
  z,
  id,
  date,
  password,
  uniqueIds,
  pagination,
} from "../src/middleware/validation.js";
import { permit, permissionMatrix, own } from "../src/middleware/security.js";
import { csvCell } from "../src/services/reports.js";
import { roles as allRoles, EquipmentItem, User } from "../src/models/index.js";
describe("Offline input, authorization and HTTP defenses", () => {
  it("rejects malformed IDs, duplicate inventory selections and unsafe passwords", () => {
    for (const value of ["x", { $ne: null }, "0".repeat(25)])
      expect(() => parse(id, value)).toThrow();
    expect(() => parse(uniqueIds, ["a".repeat(24), "a".repeat(24)])).toThrow();
    expect(() => parse(password, "é".repeat(40))).toThrow();
    expect(() => parse(password, "short")).toThrow();
    expect(parse(date, "2026-10-13T12:00:00+02:00").toISOString()).toBe(
      "2026-10-13T10:00:00.000Z",
    );
  });
  it("enforces all explicit role capabilities and owner access without database assumptions", () => {
    for (const [capability, allowed] of Object.entries(permissionMatrix))
      for (const role of allRoles) {
        let continued = false;
        const run = () =>
          permit(capability)(
            { user: { role } },
            null,
            () => (continued = true),
          );
        if (allowed.includes(role)) {
          run();
          expect(continued).toBe(true);
        } else expect(run).toThrow("Permission denied");
      }
    expect(() =>
      own({ user: "owner" }, { _id: "other", role: "SCOUT" }),
    ).toThrow();
    expect(() =>
      own({ user: "owner" }, { _id: "owner", role: "SCOUT" }),
    ).not.toThrow();
    expect(() =>
      own({ user: "owner" }, { _id: "other", role: "STORAGE_KEEPER" }),
    ).not.toThrow();
  });
  it("bounds pagination, prevents query objects, escapes CSV formulas and quotes", () => {
    expect(() => pagination({ query: { limit: 1000 } })).toThrow();
    expect(() => pagination({ query: { search: { $ne: null } } })).toThrow();
    expect(csvCell("=1+1")).toBe('"\'=1+1"');
    expect(csvCell("\t@CMD")).toContain("'");
    expect(csvCell('a"b')).toBe('"a""b"');
  });
  it("declares unique indexes and restricted field selections", () => {
    expect(User.schema.path("passwordHash").options.select).toBe(false);
    expect(User.schema.indexes()).toContainEqual([
      { email: 1 },
      { unique: true, background: true },
    ]);
    expect(
      EquipmentItem.schema
        .indexes()
        .some(([keys, options]) => keys.itemCode === 1 && options.unique),
    ).toBe(true);
  });
  it("rejects anonymous protected requests and hostile login origins with security headers", async () => {
    const anonymous = await request(app).get("/api/v1/equipment");
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers["x-content-type-options"]).toBe("nosniff");
    expect(anonymous.headers["content-security-policy"]).toContain(
      "object-src 'none'",
    );
    expect(
      (
        await request(app)
          .post("/api/v1/auth/login")
          .set("Origin", "https://evil.test")
          .send({ email: "a@test.local", password: "test" })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post("/api/v1/auth/login")
          .set("Origin", "http://localhost:3000")
          .send({ email: { $ne: null }, password: "test" })
      ).status,
    ).toBe(400);
  });
  it("reports unavailable database in health check and serves actual static pages", async () => {
    expect((await request(app).get("/health")).status).toBe(503);
    const login = await request(app).get("/login.html");
    expect(login.status).toBe(200);
    expect(login.text).toContain("login-form");
    expect(login.text).toContain('type="module"');
  });
});
