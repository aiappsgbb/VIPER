import { NextResponse } from "next/server";
import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUploadContent } from "@/lib/rbac";
import { buildCollectionAccessWhere } from "@/lib/access";
import { randomUUID } from "crypto";
import { extname } from "path";
import { buildBackendUrl } from "@/lib/backend";

let cachedBlobServiceClient = null;

function getAccountUrl() {
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

function getBlobServiceClient() {
  if (!cachedBlobServiceClient) {
    cachedBlobServiceClient = createBlobServiceClient();
  }
  return cachedBlobServiceClient;
}

function getVideoContainerName() {
  return (
    process.env.AZURE_STORAGE_VIDEO_CONTAINER ||
    process.env.AZURE_STORAGE_OUTPUT_CONTAINER ||
    "videos"
  );
}

function resolveCobraUploadEndpoint() {
  const override = process.env.COBRAPY_UPLOAD_ENDPOINT;
  if (override && typeof override === "string" && override.trim().length) {
    return override.trim();
  }

  return buildBackendUrl("/videos/upload");
}

async function uploadToCobra(buffer, fileName, mimeType) {
  const endpoint = resolveCobraUploadEndpoint();
  const formData = new FormData();
  const blob = new Blob([buffer], { type: mimeType || "application/octet-stream" });
  formData.append("file", blob, fileName);
  formData.append("upload_to_azure", "true");

  const response = await fetch(endpoint, {
    method: "POST",
    body: formData,
  });

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    // ignore body parsing errors so we can surface a generic message below
  }

  if (!response.ok) {
    const message =
      data?.detail ||
      data?.error ||
      data?.message ||
      "Video upload service returned an unexpected error.";
    throw new Error(message);
  }

  return data;
}

async function uploadToAzureStorage(buffer, fileName, mimeType) {
  const client = getBlobServiceClient();
  const containerName = getVideoContainerName();
  const containerClient = client.getContainerClient(containerName);
  await containerClient.createIfNotExists();

  const extension = extname(fileName) || ".mp4";
  const blobName = `${randomUUID()}${extension}`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: mimeType || "video/mp4" },
  });

  return `${containerClient.url}/${blobName}`;
}

function buildProcessingMetadata({ localPath, storageUrl }) {
  const metadata = {
    cobra: {
      localVideoPath: localPath,
      storageUrl: storageUrl ?? null,
      uploadedAt: new Date().toISOString(),
    },
  };

  return metadata;
}

export async function POST(request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !canUploadContent(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const collectionId = formData.get("collectionId");
  const title = (formData.get("title") ?? "").toString().trim();
  const description = (formData.get("description") ?? "").toString().trim();

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  if (!collectionId || typeof collectionId !== "string") {
    return NextResponse.json({ error: "Collection is required" }, { status: 400 });
  }

  const collection = await prisma.collection.findFirst({
    where: buildCollectionAccessWhere(session.user, collectionId),
    include: {
      organization: true,
    },
  });

  if (!collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  const originalFilename = file.name || "video.mp4";
  const mimeType = file.type || "video/mp4";
  const buffer = Buffer.from(await file.arrayBuffer());

  let cobraUpload;
  try {
    cobraUpload = await uploadToCobra(buffer, originalFilename, mimeType);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  const localVideoPath = cobraUpload?.local_path;
  let storageUrl = cobraUpload?.storage_url ?? null;

  if (!localVideoPath) {
    return NextResponse.json(
      { error: "Video upload service did not return a local file path." },
      { status: 502 },
    );
  }

  if (!storageUrl) {
    try {
      storageUrl = await uploadToAzureStorage(buffer, originalFilename, mimeType);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            "Failed to upload the video to storage. Confirm Azure Storage managed identity settings are configured or enable uploads in CobraPy.",
        },
        { status: 500 },
      );
    }
  }

  const processingMetadata = buildProcessingMetadata({
    localPath: localVideoPath,
    storageUrl,
  });

  const content = await prisma.content.create({
    data: {
      title: title || originalFilename,
      description: description || null,
      videoUrl: storageUrl,
      collectionId: collection.id,
      organizationId: collection.organizationId,
      uploadedById: session.user.id,
      processingMetadata,
    },
    include: {
      organization: true,
      collection: true,
      uploadedBy: true,
    },
  });

  return NextResponse.json({ content }, { status: 201 });
}
