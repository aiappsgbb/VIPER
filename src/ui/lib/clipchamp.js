export function buildClipchampEditorUrl({
  assetUrl,
  startSeconds = 0,
  title,
  durationSeconds,
  summary,
} = {}) {
  if (typeof assetUrl !== "string" || !assetUrl.trim()) {
    return null;
  }

  const params = new URLSearchParams();
  params.set("assetUrl", assetUrl);
  params.set("utm_source", "viper");
  params.set("utm_medium", "search-export");

  if (typeof startSeconds === "number" && Number.isFinite(startSeconds) && startSeconds > 0) {
    params.set("startSeconds", Math.max(0, Math.floor(startSeconds)).toString());
  }

  if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    params.set("durationSeconds", Math.floor(durationSeconds).toString());
  }

  if (typeof title === "string" && title.trim()) {
    params.set("title", title.trim());
  }

  if (typeof summary === "string" && summary.trim()) {
    params.set("summary", summary.trim());
  }

  return `https://app.clipchamp.com/editor?${params.toString()}`;
}
