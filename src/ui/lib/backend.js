const DEFAULT_BACKEND_BASE_URL = "http://localhost:8000";

export function getBackendBaseUrl() {
  const configured = process.env.COBRAPY_BASE_URL;
  if (configured && typeof configured === "string" && configured.trim().length) {
    return configured.trim();
  }
  return DEFAULT_BACKEND_BASE_URL;
}

export function buildBackendUrl(pathname = "/") {
  const base = getBackendBaseUrl();
  try {
    const url = new URL(pathname, base);
    return url.toString();
  } catch (error) {
    // Fall back to default base url if the provided base is invalid.
    const fallbackUrl = new URL(pathname, DEFAULT_BACKEND_BASE_URL);
    return fallbackUrl.toString();
  }
}
