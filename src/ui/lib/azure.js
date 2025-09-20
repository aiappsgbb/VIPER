import { DefaultAzureCredential } from "@azure/identity";
import {
  BlobSASPermissions,
  BlobServiceClient,
  SASProtocol,
  generateBlobSASQueryParameters,
} from "@azure/storage-blob";

const blobServiceClients = new Map();
const delegationKeyCache = new Map();

function getManagedIdentityClientId() {
  const clientId = process.env.AZURE_STORAGE_MANAGED_IDENTITY_CLIENT_ID;
  return typeof clientId === "string" && clientId.trim().length ? clientId.trim() : undefined;
}

function getBlobServiceClient(accountUrl) {
  const normalizedUrl = accountUrl ?? null;
  if (!normalizedUrl) {
    throw new Error("Azure Storage account URL is required to create a blob service client.");
  }

  if (!blobServiceClients.has(normalizedUrl)) {
    const credential = new DefaultAzureCredential({
      managedIdentityClientId: getManagedIdentityClientId(),
    });
    blobServiceClients.set(normalizedUrl, new BlobServiceClient(normalizedUrl, credential));
  }

  return blobServiceClients.get(normalizedUrl);
}

function parseBlobUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return null;
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    return null;
  }

  const path = url.pathname.replace(/^\/+/u, "");
  if (!path) {
    return null;
  }

  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  const [rawContainerName, ...rawBlobSegments] = segments;
  const containerName = decodeURIComponent(rawContainerName);
  const blobName = rawBlobSegments.map((segment) => decodeURIComponent(segment)).join("/");

  if (!containerName || !blobName) {
    return null;
  }

  return {
    accountUrl: `${url.protocol}//${url.host}`,
    containerName,
    blobName,
  };
}

function resolveAccountName(accountUrl) {
  if (process.env.AZURE_STORAGE_ACCOUNT_NAME && process.env.AZURE_STORAGE_ACCOUNT_NAME.trim().length) {
    return process.env.AZURE_STORAGE_ACCOUNT_NAME.trim();
  }

  if (!accountUrl) {
    return null;
  }

  try {
    const { hostname } = new URL(accountUrl);
    const firstSegment = hostname.split(".")[0];
    return firstSegment || null;
  } catch (error) {
    return null;
  }
}

function appendQueryString(baseUrl, queryString) {
  const url = new URL(baseUrl);
  if (url.search && url.search.length > 1) {
    url.search = `${url.search.slice(1)}&${queryString}`;
  } else {
    url.search = queryString;
  }
  return url.toString();
}

async function getDelegationKey(accountUrl) {
  const existing = delegationKeyCache.get(accountUrl);
  const now = Date.now();
  const minimumValidityWindowMs = 5 * 60 * 1000; // 5 minutes

  if (existing && existing.expiresOn.getTime() - now > minimumValidityWindowMs) {
    return existing;
  }

  const client = getBlobServiceClient(accountUrl);
  const startsOn = new Date(now - minimumValidityWindowMs);
  const expiresOn = new Date(now + 60 * 60 * 1000); // 1 hour validity
  const key = await client.getUserDelegationKey(startsOn, expiresOn);

  const cacheEntry = {
    key,
    startsOn,
    expiresOn,
  };
  delegationKeyCache.set(accountUrl, cacheEntry);
  return cacheEntry;
}

export async function generateBlobReadSasUrl(rawUrl, options = {}) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return null;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch (error) {
    return null;
  }

  if (parsedUrl.searchParams.has("sig")) {
    return rawUrl;
  }

  const blobTarget = parseBlobUrl(rawUrl);
  if (!blobTarget) {
    return null;
  }

  const accountName = resolveAccountName(blobTarget.accountUrl);
  if (!accountName) {
    return null;
  }

  let delegation;
  try {
    delegation = await getDelegationKey(blobTarget.accountUrl);
  } catch (error) {
    console.warn("[azure] Failed to acquire user delegation key for SAS generation", error);
    return null;
  }

  const now = Date.now();
  const desiredExpiryMs =
    typeof options.expiresInSeconds === "number" && Number.isFinite(options.expiresInSeconds)
      ? options.expiresInSeconds * 1000
      : 30 * 60 * 1000; // default 30 minutes

  let expiresOn = new Date(now + desiredExpiryMs);
  if (expiresOn.getTime() > delegation.expiresOn.getTime()) {
    expiresOn = new Date(delegation.expiresOn.getTime());
  }

  const startsOn = new Date(now - 5 * 60 * 1000);

  try {
    const sas = generateBlobSASQueryParameters(
      {
        containerName: blobTarget.containerName,
        blobName: blobTarget.blobName,
        permissions: BlobSASPermissions.parse("r"),
        protocol: SASProtocol.Https,
        startsOn,
        expiresOn,
      },
      delegation.key,
      accountName,
    ).toString();

    return appendQueryString(rawUrl, sas);
  } catch (error) {
    console.warn("[azure] Failed to generate SAS URL for blob", error);
    return null;
  }
}

export async function getVideoPlaybackUrl(rawUrl, options = {}) {
  const sasUrl = await generateBlobReadSasUrl(rawUrl, options);
  if (sasUrl) {
    return sasUrl;
  }

  if (typeof rawUrl === "string" && rawUrl.length > 0) {
    return rawUrl;
  }

  return null;
}
