import { NextResponse } from "next/server";
import { BlobServiceClient } from "@azure/storage-blob";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { randomUUID } from "crypto";

function getBlobServiceClient() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not configured");
  }
  return BlobServiceClient.fromConnectionString(connectionString);
}

export async function POST(request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
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
    where: {
      id: collectionId,
      memberships: {
        some: {
          userId: session.user.id,
        },
      },
    },
    include: {
      organization: true,
    },
  });

  if (!collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const blobServiceClient = getBlobServiceClient();
  const containerName = process.env.AZURE_STORAGE_CONTAINER || "cobra-upload";
  const containerClient = blobServiceClient.getContainerClient(containerName);
  await containerClient.createIfNotExists();

  const blobName = `${randomUUID()}.mp4`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: file.type || "video/mp4" },
  });

  const content = await prisma.content.create({
    data: {
      title: title || file.name,
      description: description || null,
      videoUrl: `${containerClient.url}/${blobName}`,
      collectionId: collection.id,
      organizationId: collection.organizationId,
      uploadedById: session.user.id,
      analysisRequestedAt: new Date(),
    },
    include: {
      organization: true,
      collection: true,
      uploadedBy: true,
    },
  });

  const payload = {
    contentId: content.id,
    videoUrl: content.videoUrl,
    organizationId: collection.organizationId,
    collectionId: collection.id,
  };

  const tasks = [
    process.env.ACTION_SUMMARY_ENDPOINT,
    process.env.CHAPTER_ANALYSIS_ENDPOINT,
  ]
    .filter(Boolean)
    .map((endpoint) =>
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch((error) => ({ error })),
    );

  if (tasks.length) {
    await Promise.allSettled(tasks);
  }

  return NextResponse.json({ content }, { status: 201 });
}
