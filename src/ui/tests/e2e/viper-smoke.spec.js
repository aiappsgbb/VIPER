import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const truthy = new Set(["1", "true", "yes", "y", "on"]);
const uploadEnabled = truthy.has(String(process.env.VIPER_SMOKE_UPLOAD || "").toLowerCase());
const chatEnabled = truthy.has(String(process.env.VIPER_SMOKE_CHAT || "").toLowerCase());
const actionSummaryEnabled = truthy.has(String(process.env.VIPER_SMOKE_ACTION_SUMMARY || "").toLowerCase());
const providedVideoPath = process.env.VIPER_SMOKE_VIDEO_PATH || "";
const providedVideoUrl = process.env.VIPER_SMOKE_VIDEO_URL || "";

function collectUxErrors(page, options = {}) {
  const errors = [];
  const allowedApiStatuses = options.allowedApiStatuses ?? {};
  const allowedFailedRequests = options.allowedFailedRequests ?? [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  page.on("response", (response) => {
    const status = response.status();
    if (status < 400) {
      return;
    }

    let pathName;
    try {
      pathName = new URL(response.url()).pathname;
    } catch {
      return;
    }

    if (!pathName.startsWith("/api/")) {
      return;
    }

    const allowedStatuses = allowedApiStatuses[pathName] ?? [];
    if (allowedStatuses.includes(status)) {
      return;
    }

    errors.push(`${response.request().method()} ${pathName} returned HTTP ${status}`);
  });
  page.on("requestfailed", (request) => {
    let pathName;
    try {
      pathName = new URL(request.url()).pathname;
    } catch {
      return;
    }

    if (!pathName.startsWith("/api/")) {
      return;
    }

    const failureText = request.failure()?.errorText ?? "unknown error";
    if (
      allowedFailedRequests.some((allowFailedRequest) =>
        allowFailedRequest({ method: request.method(), pathName, failureText }),
      )
    ) {
      return;
    }

    errors.push(`${request.method()} ${pathName} failed: ${failureText}`);
  });

  return errors;
}

function allowAbortedContentVideoRequest({ method, pathName, failureText }) {
  return method === "GET" && /^\/api\/content\/[^/]+\/video$/u.test(pathName) && failureText === "net::ERR_ABORTED";
}

async function getDashboardAccess(request) {
  const response = await request.get("/dashboard", { maxRedirects: 0 });
  return {
    location: response.headers().location || "",
    status: response.status(),
  };
}

async function expectNoUxErrors(errors) {
  expect(errors, `Unexpected browser console/page/API errors:\n${errors.join("\n")}`).toEqual([]);
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

  const uploadButton = page.getByRole("banner").getByRole("button", { name: "Upload videos" });
  await expect(uploadButton).toBeVisible();
  const dialog = page.getByRole("dialog");
  const dialogHeading = dialog.getByRole("heading", { name: "Upload videos" });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await uploadButton.click();
    try {
      await expect(dialogHeading).toBeVisible({ timeout: 3_000 });
      return dialog;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      await page.waitForTimeout(500);
    }
  }

  return dialog;
}

async function getCurrentCollectionId(page) {
  const collectionHref = await page.locator('a[href^="/dashboard/collections/"]').first().getAttribute("href");
  const collectionId = collectionHref?.match(/^\/dashboard\/collections\/([^/?#]+)/u)?.[1] ?? "";
  expect(collectionId, "No dashboard collection link is available for the upload smoke.").toBeTruthy();
  return collectionId;
}

async function uploadSmokeVideo({ page, request, testInfo, titlePrefix }) {
  const videoPath = await resolveVideoPath(testInfo);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  const title = `${titlePrefix} ${Date.now()}`;
  const collectionId = await getCurrentCollectionId(page);
  const uploadResponse = await request.post("/api/upload", {
    multipart: {
      collectionId,
      title,
      description: "Automated smoke upload used to verify UI, storage permissions, and analysis execution.",
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
  expect(uploadedContentId, `Upload response did not include a content id: ${JSON.stringify(responseBody)}`).toBeTruthy();

  return { id: uploadedContentId, title };
}

async function warnIfCleanupFails(request, contentId) {
  if (!contentId) {
    return;
  }

  const deleteResponse = await request.delete(`/api/content/${contentId}`);
  if (!deleteResponse.ok()) {
    console.warn(`Unable to clean up smoke upload ${contentId}: HTTP ${deleteResponse.status()}`);
  }
}

test.describe("VIPER smoke journey", () => {
  test("login page, auth boundaries, and dark-mode styling are healthy", async ({ page, request }) => {
    const errors = collectUxErrors(page, {
      allowedApiStatuses: {
        "/api/auth/session": [410],
      },
    });

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

    await expectNoUxErrors(errors);
  });

  test("dashboard upload UX is usable when an authenticated smoke session is available", async ({ page, request }) => {
    const dashboardAccess = await getDashboardAccess(request);
    test.skip(
      dashboardAccess.status !== 200,
      `Dashboard requires EasyAuth (${dashboardAccess.status}); run this against anonymous smoke mode or an authenticated browser context.`,
    );

    const errors = collectUxErrors(page);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Signed in as")).toBeVisible();
    await expect(page.getByRole("banner").getByRole("button", { name: "Upload videos" })).toBeVisible();
    await expectDashboardVisualSanity(page);

    const uploadSurface = await getUploadSurface(page);
    await expect(uploadSurface.locator("#collection")).toBeVisible();
    await expect(uploadSurface.locator("#files")).toBeVisible();
    await uploadSurface.getByRole("button", { name: "Upload videos" }).click();
    await expect(
      page.getByText("Attach at least one video file to upload.").or(page.getByText("Select a collection for the upload.")),
    ).toBeVisible();

    await expectNoUxErrors(errors);
  });

  test("video upload smoke succeeds and does not surface storage permission errors", async ({ page, request }, testInfo) => {
    test.skip(!uploadEnabled, "Set VIPER_SMOKE_UPLOAD=true to run the real upload journey.");

    const dashboardAccess = await getDashboardAccess(request);
    test.skip(
      dashboardAccess.status !== 200,
      `Dashboard requires EasyAuth (${dashboardAccess.status}); run upload smoke against anonymous smoke mode or an authenticated browser context.`,
    );

    const errors = collectUxErrors(page, {
      allowedFailedRequests: [allowAbortedContentVideoRequest],
    });

    const uploadedContent = await uploadSmokeVideo({
      page,
      request,
      testInfo,
      titlePrefix: "VIPER smoke upload",
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: uploadedContent.title })).toBeVisible({ timeout: 30_000 });
    await warnIfCleanupFails(request, uploadedContent.id);

    await expectNoUxErrors(errors);
  });

  test("run action summary completes for an uploaded video", async ({ page, request }, testInfo) => {
    test.skip(!actionSummaryEnabled, "Set VIPER_SMOKE_ACTION_SUMMARY=true to run the real action-summary journey.");
    test.setTimeout(900_000);

    const dashboardAccess = await getDashboardAccess(request);
    test.skip(
      dashboardAccess.status !== 200,
      `Dashboard requires EasyAuth (${dashboardAccess.status}); run action-summary smoke against anonymous smoke mode or an authenticated browser context.`,
    );

    const errors = collectUxErrors(page, {
      allowedFailedRequests: [allowAbortedContentVideoRequest],
    });

    const uploadedContent = await uploadSmokeVideo({
      page,
      request,
      testInfo,
      titlePrefix: "VIPER smoke action summary",
    });

    await page.goto(`/dashboard?contentId=${encodeURIComponent(uploadedContent.id)}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: uploadedContent.title })).toBeVisible({ timeout: 30_000 });

    const actionSummaryResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === `/api/content/${uploadedContent.id}/action-summary`,
      { timeout: 840_000 },
    );

    await page.getByRole("button", { name: "Run action summary" }).click();
    const response = await actionSummaryResponse;
    const responseText = await response.text();
    expect(
      response.ok(),
      `Run action summary failed with HTTP ${response.status()}: ${responseText}`,
    ).toBe(true);
    expect(responseText).not.toMatch(/max_completion_tokens|max_tokens/i);

    await expect(page.getByText("Action summary completed and search index updated.")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Run the action summary to generate scene recaps for this video.")).toHaveCount(0);
    await warnIfCleanupFails(request, uploadedContent.id);

    await expectNoUxErrors(errors);
  });

  test("chat API smoke succeeds against the deployed Azure OpenAI model", async ({ request }) => {
    test.skip(!chatEnabled, "Set VIPER_SMOKE_CHAT=true to run the real /api/chat journey.");
    test.setTimeout(240_000);

    const chatResponse = await request.post("/api/chat", {
      data: {
        messages: [
          {
            role: "user",
            content: "Reply with the single word pong.",
          },
        ],
        actionSummary: [],
        chapterAnalysis: [],
        searchScope: "video",
      },
      timeout: 180_000,
    });

    const responseText = await chatResponse.text();
    expect(
      chatResponse.ok(),
      `Chat API failed with HTTP ${chatResponse.status()}: ${responseText}`,
    ).toBe(true);
    expect(responseText.trim(), "Chat API returned an empty response.").not.toBe("");
    expect(responseText).not.toMatch(/max_completion_tokens|max_tokens/i);
  });
});
