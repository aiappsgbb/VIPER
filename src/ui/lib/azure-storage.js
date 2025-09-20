import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";

let cachedBlobServiceClient = null;

export function getAccountUrl() {
  const explicitUrl = process.env.AZURE_STORAGE_ACCOUNT_URL;
  if (explicitUrl && typeof explicitUrl === "string" && explicitUrl.trim().length) {
    return explicitUrl.trim();
  }

  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  if (accountName && typeof accountName === "string" && accountName.trim().length) {
    return `https://${accountName.trim()}.blob.core.windows.net`;
  }

  throw new Error(
    "Configure AZURE_STORAGE_ACCOUNT_URL or AZURE_STORAGE_ACCOUNT_NAME for managed identity access.",
  );
}

function createBlobServiceClient() {
  const accountUrl = getAccountUrl();
  const credential = new DefaultAzureCredential({
    managedIdentityClientId: process.env.AZURE_STORAGE_MANAGED_IDENTITY_CLIENT_ID,
  });
  return new BlobServiceClient(accountUrl, credential);
}

export function getBlobServiceClient() {
  if (!cachedBlobServiceClient) {
    cachedBlobServiceClient = createBlobServiceClient();
  }
  return cachedBlobServiceClient;
}

export function getVideoContainerName() {
  return (
    process.env.AZURE_STORAGE_VIDEO_CONTAINER ||
    process.env.AZURE_STORAGE_OUTPUT_CONTAINER ||
    "videos"
  );
}

export function parseBlobUrl(blobUrl) {
  if (!blobUrl || typeof blobUrl !== "string") {
    return null;
  }

  try {
    const parsed = new URL(blobUrl);
    const path = parsed.pathname.replace(/^\/+/, "");
    if (!path) {
      return null;
    }

    const [container, ...blobParts] = path.split("/");
    if (!container || !blobParts.length) {
      return null;
    }

    const blobName = decodeURIComponent(blobParts.join("/"));
    return { container, blobName };
  } catch (error) {
    return null;
  }
}

export function isBlobUrl(blobUrl) {
  return Boolean(parseBlobUrl(blobUrl));
}

export async function deleteBlobByUrl(blobUrl) {
  const components = parseBlobUrl(blobUrl);
  if (!components) {
    return false;
  }

  try {
    const client = getBlobServiceClient();
    const containerClient = client.getContainerClient(components.container);
    const blobClient = containerClient.getBlobClient(components.blobName);
    await blobClient.deleteIfExists({ deleteSnapshots: "include" });
    return true;
  } catch (error) {
    console.warn("[azure] Failed to delete blob", { blobUrl, error });
    return false;
  }
}
