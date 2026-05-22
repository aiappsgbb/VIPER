import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const truthy = new Set(["1", "true", "yes", "y", "on"]);
const uploadEnabled = truthy.has(String(process.env.VIPER_SMOKE_UPLOAD || "").toLowerCase());
const providedVideoPath = process.env.VIPER_SMOKE_VIDEO_PATH || "";
const providedVideoUrl = process.env.VIPER_SMOKE_VIDEO_URL || "";

function collectPageErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
}

async function getDashboardAccess(request) {
  const response = await request.get("/dashboard", { maxRedirects: 0 });
  return {
    location: response.headers().location || "",
    status: response.status(),
  };
}

async function expectNoPageErrors(errors) {
  expect(errors, `Unexpected browser console/page errors:\n${errors.join("\n")}`).toEqual([]);
}

async function expectLoginVisualSanity(page) {
  const colors = await page.locator("body").evaluate(() => {
    const card = document.querySelector(".shadow-xl");
    const root = document.querySelector(".min-h-screen");
    return {
      cardBackground: card ? getComputedStyle(card).backgroundColor : "",
      rootBackground: root ? getComputedStyle(root).backgroundImage : "",
    };
  });

  expect(colors.cardBackground).toContain("255, 255, 255");
  expect(colors.rootBackground).toContain("gradient");
}

async function expectDashboardVisualSanity(page) {
  const colors = await page.locator("body").evaluate(() => {
    const header = document.querySelector("header");
    const main = document.querySelector("main") || document.body;
    return {
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      headerBackground: header ? getComputedStyle(header).backgroundColor : "",
      mainColor: getComputedStyle(main).color,
    };
  });

  expect(colors.headerBackground).not.toBe("rgb(0, 0, 0)");
  expect(colors.mainColor).not.toBe("rgb(255, 255, 255)");
}

function commandExists(command) {
  try {
    execFileSync("sh", ["-c", `command -v ${command}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function createSmokeVideo(outputPath) {
  execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=160x90:rate=1",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=mono:sample_rate=16000",
      "-t",
      "1",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      outputPath,
    ],
    { stdio: "pipe" },
  );
}

async function downloadSmokeVideoFromUrl(videoUrl, outputPath) {
  expect(typeof fetch, "Node.js fetch API is required for VIPER_SMOKE_VIDEO_URL.").toBe("function");

  let parsedUrl;
  try {
    parsedUrl = new URL(videoUrl);
  } catch (error) {
    throw new Error(`VIPER_SMOKE_VIDEO_URL is not a valid URL: ${videoUrl}`);
  }

  expect(["http:", "https:"], "VIPER_SMOKE_VIDEO_URL must use http or https.").toContain(parsedUrl.protocol);

  const response = await fetch(parsedUrl);
  expect(response.ok, `Failed to download VIPER_SMOKE_VIDEO_URL ${videoUrl}: HTTP ${response.status}`).toBe(true);

  const arrayBuffer = await response.arrayBuffer();
  expect(arrayBuffer.byteLength, `VIPER_SMOKE_VIDEO_URL ${videoUrl} returned an empty body.`).toBeGreaterThan(0);
  fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
}

async function resolveVideoPath(testInfo) {
  if (providedVideoPath) {
    expect(fs.existsSync(providedVideoPath), `VIPER_SMOKE_VIDEO_PATH does not exist: ${providedVideoPath}`).toBe(true);
    return providedVideoPath;
  }

  if (providedVideoUrl) {
    const urlPath = new URL(providedVideoUrl).pathname;
    const extension = path.extname(urlPath) || ".mp4";
    const downloadedPath = testInfo.outputPath(`viper-smoke-url-${Date.now()}${extension}`);
    fs.mkdirSync(path.dirname(downloadedPath), { recursive: true });
    await downloadSmokeVideoFromUrl(providedVideoUrl, downloadedPath);
    return downloadedPath;
  }

  test.skip(!commandExists("ffmpeg"), "Set VIPER_SMOKE_VIDEO_PATH or install ffmpeg to generate a runtime smoke video.");
  const generatedPath = testInfo.outputPath(`viper-smoke-${Date.now()}.mp4`);
  fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
  createSmokeVideo(generatedPath);
  return generatedPath;
}

async function getUploadSurface(page) {
  const main = page.locator("main");
  if (await main.getByRole("heading", { name: "Upload videos" }).isVisible()) {
    return main;
  }

  await page.getByRole("button", { name: "Upload videos" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Upload videos" })).toBeVisible();
  return dialog;
}

test.describe("VIPER smoke journey", () => {
  test("login page, auth boundaries, and dark-mode styling are healthy", async ({ page, request }) => {
    const errors = collectPageErrors(page);

    const loginResponse = await page.goto("/login", { waitUntil: "domcontentloaded" });
    expect(loginResponse?.status()).toBeLessThan(500);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Continue (with Entra ID|to dashboard)/ })).toBeVisible();
    await expectLoginVisualSanity(page);

    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expectLoginVisualSanity(page);

    const sessionResponse = await request.get("/api/auth/session");
    expect(sessionResponse.status()).toBe(410);

    const dashboardAccess = await getDashboardAccess(request);
    if (dashboardAccess.status >= 300 && dashboardAccess.status < 400) {
      expect(dashboardAccess.location).toContain("/.auth/login/aad");
    } else {
      expect(dashboardAccess.status).toBe(200);
    }

    await expectNoPageErrors(errors);
  });

  test("dashboard upload UX is usable when an authenticated smoke session is available", async ({ page, request }) => {
    const dashboardAccess = await getDashboardAccess(request);
    test.skip(
      dashboardAccess.status !== 200,
      `Dashboard requires EasyAuth (${dashboardAccess.status}); run this against anonymous smoke mode or an authenticated browser context.`,
    );

    const errors = collectPageErrors(page);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Signed in as")).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload videos" }).first()).toBeVisible();
    await expectDashboardVisualSanity(page);

    const uploadSurface = await getUploadSurface(page);
    await expect(uploadSurface.locator("#collection")).toBeVisible();
    await expect(uploadSurface.locator("#files")).toBeVisible();
    await uploadSurface.getByRole("button", { name: "Upload videos" }).click();
    await expect(
      page.getByText("Attach at least one video file to upload.").or(page.getByText("Select a collection for the upload.")),
    ).toBeVisible();

    await expectNoPageErrors(errors);
  });

  test("video upload smoke succeeds and does not surface storage permission errors", async ({ page, request }, testInfo) => {
    test.skip(!uploadEnabled, "Set VIPER_SMOKE_UPLOAD=true to run the real upload journey.");

    const dashboardAccess = await getDashboardAccess(request);
    test.skip(
      dashboardAccess.status !== 200,
      `Dashboard requires EasyAuth (${dashboardAccess.status}); run upload smoke against anonymous smoke mode or an authenticated browser context.`,
    );

    const videoPath = await resolveVideoPath(testInfo);
    const errors = collectPageErrors(page);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const uploadSurface = await getUploadSurface(page);

    const title = `VIPER smoke upload ${Date.now()}`;
    await uploadSurface.locator("#title").fill(title);
    await uploadSurface.locator("#description").fill("Automated smoke upload used to verify UI and storage permissions.");
    const collectionId = await uploadSurface.locator("#collection").evaluate((select) => select.value);
    expect(collectionId, "No upload collection is selected on the dashboard.").toBeTruthy();

    const uploadResponse = await request.post("/api/upload", {
      multipart: {
        collectionId,
        title,
        description: "Automated smoke upload used to verify UI and storage permissions.",
        files: {
          name: path.basename(videoPath),
          mimeType: "video/mp4",
          buffer: fs.readFileSync(videoPath),
        },
      },
      timeout: 180_000,
    });

    const responseBody = await uploadResponse.json().catch(() => ({}));
    const uploadedContentId = responseBody?.content?.id ?? responseBody?.contents?.[0]?.id ?? null;
    expect(
      uploadResponse.ok(),
      `Upload failed with HTTP ${uploadResponse.status()}: ${JSON.stringify(responseBody)}`,
    ).toBe(true);
    expect(JSON.stringify(responseBody)).not.toMatch(/AuthorizationPermissionMismatch|AuthorizationFailure|Forbidden/i);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 30_000 });

    if (uploadedContentId) {
      const deleteResponse = await request.delete(`/api/content/${uploadedContentId}`);
      if (!deleteResponse.ok()) {
        console.warn(`Unable to clean up smoke upload ${uploadedContentId}: HTTP ${deleteResponse.status()}`);
      }
    }

    await expectNoPageErrors(errors);
  });
});
