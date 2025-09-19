import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

function ensureChapterAnalysisEndpoint() {
  const endpoint = process.env.CHAPTER_ANALYSIS_ENDPOINT;
  if (!endpoint) {
    throw new Error("CHAPTER_ANALYSIS_ENDPOINT is not configured");
  }
  return endpoint;
}

function cloneProcessingMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }
  return JSON.parse(JSON.stringify(metadata));
}

function getCobraMetadata(metadata) {
  const clone = cloneProcessingMetadata(metadata);
  const cobra = typeof clone.cobra === "object" && clone.cobra !== null ? clone.cobra : {};
  clone.cobra = cobra;
  return { clone, cobra };
}

function buildDisplayName(session, content) {
  return (
    session.user.name ||
    session.user.email ||
    content.uploadedBy?.name ||
    content.uploadedBy?.email ||
    "Unknown user"
  );
}

function buildRequestPayload({ content, session, cobraMeta }) {
  const payload = {
    video_path: cobraMeta.localVideoPath,
    manifest_path: cobraMeta.manifestPath ?? null,
    organization: content.organizationId,
    organization_name: content.organization?.name ?? undefined,
    collection: content.collectionId,
    collection_name: content.collection?.name ?? undefined,
    user: session.user.id,
    user_name: buildDisplayName(session, content),
    video_id: content.id,
    video_url: content.videoUrl,
  };

  if (cobraMeta.manifestPath) {
    payload.skip_preprocess = true;
  }

  return payload;
}

export async function POST(_request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentId = params?.contentId;
  if (!contentId) {
    return NextResponse.json({ error: "Content id is required" }, { status: 400 });
  }

  const content = await prisma.content.findFirst({
    where: {
      id: contentId,
      collection: {
        memberships: {
          some: {
            userId: session.user.id,
          },
        },
      },
    },
    include: {
      organization: true,
      collection: true,
      uploadedBy: true,
    },
  });

  if (!content) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  const { clone: processingMetadata, cobra: cobraMeta } = getCobraMetadata(
    content.processingMetadata,
  );

  if (!cobraMeta.localVideoPath) {
    return NextResponse.json(
      {
        error:
          "The uploaded video is missing from the processing service. Re-upload the video before running analyses.",
      },
      { status: 400 },
    );
  }

  const now = new Date();
  cobraMeta.lastChapterAnalysisRequestedAt = now.toISOString();
  processingMetadata.cobra = cobraMeta;

  await prisma.content.update({
    where: { id: content.id },
    data: {
      chapterAnalysisStatus: "PROCESSING",
      analysisRequestedAt: now,
      processingMetadata,
    },
  });

  let response;
  let data;
  try {
    response = await fetch(ensureChapterAnalysisEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildRequestPayload({ content, session, cobraMeta })),
    });
    data = await response.json().catch(() => null);
  } catch (error) {
    cobraMeta.chapterAnalysis = {
      lastRunAt: new Date().toISOString(),
      status: "FAILED",
      error: error.message,
    };
    processingMetadata.cobra = cobraMeta;

    await prisma.content.update({
      where: { id: content.id },
      data: {
        chapterAnalysisStatus: "FAILED",
        processingMetadata,
      },
    });

    return NextResponse.json({ error: "Failed to contact the analysis service." }, { status: 502 });
  }

  if (!response?.ok) {
    const errorMessage =
      data?.detail ||
      data?.error ||
      data?.message ||
      "Chapter analysis request failed";

    cobraMeta.chapterAnalysis = {
      lastRunAt: new Date().toISOString(),
      status: "FAILED",
      error: errorMessage,
    };
    processingMetadata.cobra = cobraMeta;

    await prisma.content.update({
      where: { id: content.id },
      data: {
        chapterAnalysisStatus: "FAILED",
        processingMetadata,
      },
    });

    return NextResponse.json({ error: errorMessage }, { status: response.status || 500 });
  }

  cobraMeta.manifestPath = data?.manifest_path ?? cobraMeta.manifestPath ?? null;
  cobraMeta.chapterAnalysis = {
    lastRunAt: new Date().toISOString(),
    analysisOutputPath: data?.analysis_output_path ?? null,
    storageArtifacts: data?.storage_artifacts ?? null,
  };
  processingMetadata.cobra = cobraMeta;

  await prisma.content.update({
    where: { id: content.id },
    data: {
      chapterAnalysisStatus: "COMPLETED",
      processingMetadata,
    },
  });

  return NextResponse.json(
    {
      analysis: data?.analysis ?? "ChapterAnalysis",
      manifestPath: data?.manifest_path ?? null,
    },
    { status: 200 },
  );
}
