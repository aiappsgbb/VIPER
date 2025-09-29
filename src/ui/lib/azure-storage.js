import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
} from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";

let cachedBlobServiceClient = null;
let cachedUserDelegation = null;

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

function getAccountName() {
  const accountUrl = getAccountUrl();
  try {
    const parsed = new URL(accountUrl);
    const hostname = parsed.hostname || "";
    const segments = hostname.split(".");
    if (segments.length) {
      return segments[0];
    }
  } catch (error) {
    // Ignore parsing issues and fall through to returning null.
  }
  return null;
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

async function getUserDelegationKey(options = {}) {
  const client = getBlobServiceClient();
  const now = new Date();

  if (
    cachedUserDelegation &&
    cachedUserDelegation.expiresOn instanceof Date &&
    cachedUserDelegation.expiresOn.getTime() - now.getTime() > 2 * 60 * 1000
  ) {
    return cachedUserDelegation;
  }

  const start = new Date(now.getTime() - 5 * 60 * 1000);
  const expiryBufferMs = options?.maxLifetimeMs ?? 60 * 60 * 1000;
  const end = new Date(now.getTime() + expiryBufferMs);

  const key = await client.getUserDelegationKey(start, end);
  cachedUserDelegation = {
    key,
    expiresOn: end,
  };
  return cachedUserDelegation;
}

export async function generateBlobReadSasUrl(blobUrl, options = {}) {
  const components = parseBlobUrl(blobUrl);
  if (!components) {
    return null;
  }

  try {
    const client = getBlobServiceClient();
    const delegation = await getUserDelegationKey({
      maxLifetimeMs: Math.max(15 * 60 * 1000, (options?.expiresInSeconds ?? 0) * 1000),
    });

    if (!delegation?.key) {
      return null;
    }

    const containerClient = client.getContainerClient(components.container);
    const blobClient = containerClient.getBlobClient(components.blobName);

    const now = new Date();
    const startsOn = new Date(now.getTime() - 5 * 60 * 1000);
    const expiresOn = new Date(
      now.getTime() + Math.max(5 * 60 * 1000, (options?.expiresInSeconds ?? 15 * 60) * 1000),
    );

    const accountName = client.accountName ?? getAccountName();
    if (!accountName) {
      return null;
    }

    const sas = generateBlobSASQueryParameters(
      {
        containerName: components.container,
        blobName: components.blobName,
        permissions: BlobSASPermissions.parse("r"),
        startsOn,
        expiresOn,
        protocol: "https",
      },
      delegation.key,
      accountName,
    ).toString();

    return `${blobClient.url}?${sas}`;
  } catch (error) {
    console.error("[azure] Failed to generate SAS URL", { blobUrl, error });
    return null;
  }
}
