import "./test-env.js";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { chromium } from "@playwright/test";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { app } from "../src/app.js";
import { connectDatabase } from "../src/config/database.js";
import { User } from "../src/models/index.js";
const replica = await MongoMemoryReplSet.create({
  binary: { version: "7.0.24", checkMD5: true },
  replSet: { count: 1, storageEngine: "wiredTiger" },
});
let server, browser;
try {
  await connectDatabase(replica.getUri("walkthrough_player_test"));
  const password = crypto.randomBytes(20).toString("hex");
  await User.create({
    name: "Tutorial viewer",
    email: "viewer@demo.example",
    passwordHash: await bcrypt.hash(password, 12),
    role: "SCOUT",
  });
  server = await new Promise((resolve) => {
    const s = app.listen(3000, "127.0.0.1", () => resolve(s));
  });
  for (const key of ["admin", "keeper", "scout"]) {
    const response = await fetch(
      `http://localhost:3000/walkthrough-media/${key}.ar.mp4`,
      { headers: { Range: "bytes=0-1023" } },
    );
    assert.equal(response.status, 206);
    assert.ok(response.headers.get("content-type").includes("video/mp4"));
    assert.equal((await response.arrayBuffer()).byteLength, 1024);
    assert.equal(
      (await fetch(`http://localhost:3000/walkthrough-media/${key}.ar.vtt`))
        .status,
      200,
    );
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:3000/login.html");
  await page.getByLabel("Email address").fill("viewer@demo.example");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard.html");
  await page.getByRole("link", { name: "Walkthroughs", exact: true }).click();
  await page
    .getByRole("heading", { name: "دليل الاستخدام بالفيديو", exact: true })
    .waitFor();
  const previews = [];
  for (const [key, title, chapter] of [
    ["admin", "مسؤول النظام", "مسؤول النظام: نظرة عامة"],
    ["keeper", "أمين المخزن", "أمين المخزن: التشغيل اليومي"],
    ["scout", "الكشّاف", "الكشّاف: الطلب والمتابعة"],
  ]) {
    await page.getByRole("button", { name: title, exact: true }).click();
    const video = page.locator("video");
    await page.getByRole("button", { name: new RegExp(chapter) }).click();
    await page.waitForFunction(() => {
      const v = document.querySelector("video");
      return v && !v.paused && v.currentTime > 0;
    });
    const stats = await video.evaluate((v) => ({
      duration: v.duration,
      width: v.videoWidth,
      height: v.videoHeight,
      src: v.currentSrc,
    }));
    assert.ok(stats.duration > 150);
    assert.equal(stats.width, 1280);
    assert.equal(stats.height, 840);
    assert.ok(stats.src.endsWith(`${key}.ar.mp4`));
    previews.push({ key, ...stats });
    await video.evaluate(async (v) => {
      const track = v.textTracks[0];
      track.mode = "hidden";
      await new Promise((resolve, reject) => {
        if (track.cues?.length) return resolve();
        v.querySelector("track").addEventListener("load", resolve, {
          once: true,
        });
        setTimeout(
          () =>
            track.cues?.length
              ? resolve()
              : reject(new Error("Arabic captions failed to load")),
          5000,
        );
      });
    });
    assert.ok(
      await video.evaluate((v) => v.textTracks[0].cues.length > 10),
      "Full Arabic captions must parse",
    );
    await video.evaluate((v) => v.pause());
  }
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "تنزيل الفيديو", exact: true }).click();
  const downloaded = await downloadEvent;
  await downloaded.saveAs("/workspace/walkthrough-build/download-test.mp4");
  const hashes = JSON.parse(
    await fs.readFile("docs/walkthroughs/sha256.json", "utf8"),
  );
  assert.equal(
    crypto
      .createHash("sha256")
      .update(
        await fs.readFile("/workspace/walkthrough-build/download-test.mp4"),
      )
      .digest("hex"),
    hashes["scout.ar.mp4"],
  );
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(350);
  await page.screenshot({
    path: "/workspace/walkthrough-build/player-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(350);
  await page.screenshot({
    path: "/workspace/walkthrough-build/player-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        result: "passed",
        checks: [
          "MP4 byte-range delivery",
          "Arabic captions served",
          "all role players decode and play",
          "chapter seeking",
          "download checksum matches the published video",
          "desktop/mobile layout",
          "no browser errors",
        ],
        videos: previews,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await mongoose.disconnect();
  await replica.stop();
}
