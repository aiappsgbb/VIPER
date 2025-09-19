import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildContentAccessWhere } from "@/lib/access";
import { buildBackendUrl } from "@/lib/backend";

function getActionSummaryEndpoint() {
  const configured = process.env.ACTION_SUMMARY_ENDPOINT;
  if (configured && typeof configured === "string" && configured.trim().length) {
    return configured.trim();
  }
  return buildBackendUrl("/analysis/action-summary");
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

function coercePositiveInteger(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const intValue = Math.floor(value);
    return intValue > 0 ? intValue : null;
  }

  if (typeof value === "string" && value.trim().length) {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
  }

  return null;
}

function coercePositiveNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 ? value : null;
  }

  if (typeof value === "string" && value.trim().length) {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
  }

  return null;
}

function coerceBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function normalizeAnalysisTemplate(template) {
  if (!Array.isArray(template)) {
    return null;
  }

  const normalized = template
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const normalizedEntry = {};
      Object.entries(entry).forEach(([rawKey, rawValue]) => {
        if (typeof rawKey !== "string") {
          return;
        }

        const key = rawKey.trim();
        if (!key) {
          return;
        }

        if (typeof rawValue === "string") {
          normalizedEntry[key] = rawValue;
        } else if (rawValue == null) {
          normalizedEntry[key] = "";
        } else {
          try {
            normalizedEntry[key] = JSON.stringify(rawValue);
          } catch (error) {
            normalizedEntry[key] = String(rawValue);
          }
        }
      });

      return Object.keys(normalizedEntry).length ? normalizedEntry : null;
    })
    .filter(Boolean);

  return normalized.length ? normalized : null;
}

function buildRequestPayload({ content, session, cobraMeta, analysisTemplate }) {
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

  const uploadMetadata =
    (typeof cobraMeta.uploadMetadata === "object" && cobraMeta.uploadMetadata !== null
      ? cobraMeta.uploadMetadata
      : null) || {};

  const segmentLength = coercePositiveInteger(uploadMetadata.segment_length);
  if (segmentLength != null) {
    payload.segment_length = segmentLength;
  }

  const fps = coercePositiveNumber(uploadMetadata.fps);
  if (fps != null) {
    payload.fps = fps;
  }

  const maxWorkers = coercePositiveInteger(uploadMetadata.max_workers);
  if (maxWorkers != null) {
    payload.max_workers = maxWorkers;
  }

  const runAsync = coerceBoolean(uploadMetadata.run_async);
  if (runAsync != null) {
    payload.run_async = runAsync;
  }

  const overwriteOutput = coerceBoolean(uploadMetadata.overwrite_output);
  if (overwriteOutput != null) {
    payload.overwrite_output = overwriteOutput;
  }

  const reprocessSegments = coerceBoolean(uploadMetadata.reprocess_segments);
  if (reprocessSegments != null) {
    payload.reprocess_segments = reprocessSegments;
  }

  const generateTranscripts = coerceBoolean(uploadMetadata.generate_transcripts);
  if (generateTranscripts != null) {
    payload.generate_transcripts = generateTranscripts;
  }

  const trimToNearestSecond = coerceBoolean(uploadMetadata.trim_to_nearest_second);
  if (trimToNearestSecond != null) {
    payload.trim_to_nearest_second = trimToNearestSecond;
  }

  const allowPartialSegments = coerceBoolean(uploadMetadata.allow_partial_segments);
  if (allowPartialSegments != null) {
    payload.allow_partial_segments = allowPartialSegments;
  }

  const uploadToAzure = coerceBoolean(uploadMetadata.upload_to_azure);
  if (uploadToAzure != null) {
    payload.upload_to_azure = uploadToAzure;
  }

  const outputDirectory = uploadMetadata.output_directory;
  if (typeof outputDirectory === "string" && outputDirectory.trim().length) {
    payload.output_directory = outputDirectory.trim();
  }

  if (payload.segment_length == null) {
    payload.segment_length = 10;
  }

  if (payload.fps == null) {
    payload.fps = 0.33;
  }

  if (typeof payload.generate_transcripts !== "boolean") {
    payload.generate_transcripts = true;
  }

  if (typeof payload.trim_to_nearest_second !== "boolean") {
    payload.trim_to_nearest_second = false;
  }

  if (typeof payload.allow_partial_segments !== "boolean") {
    payload.allow_partial_segments = true;
  }

  if (typeof payload.overwrite_output !== "boolean") {
    payload.overwrite_output = false;
  }

  if (typeof payload.reprocess_segments !== "boolean") {
    payload.reprocess_segments = false;
  }

  if (typeof payload.run_async !== "boolean") {
    payload.run_async = true;
  }

  if (typeof payload.upload_to_azure !== "boolean") {
    payload.upload_to_azure = true;
  }

  if (cobraMeta.manifestPath) {
    payload.skip_preprocess = true;
  }

  if (Array.isArray(analysisTemplate) && analysisTemplate.length > 0) {
    payload.analysis_template = analysisTemplate;
  }

  return payload;
}

export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentId = params?.contentId;
  if (!contentId) {
    return NextResponse.json({ error: "Content id is required" }, { status: 400 });
  }

  const content = await prisma.content.findFirst({
    where: buildContentAccessWhere(session.user, contentId),
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

  const normalizedExistingTemplate = normalizeAnalysisTemplate(
    cobraMeta.actionSummary?.analysisTemplate,
  );
  const existingTemplate =
    normalizedExistingTemplate ??
    (Array.isArray(cobraMeta.actionSummary?.analysisTemplate)
      ? cobraMeta.actionSummary.analysisTemplate
      : null);

  let requestBody = null;
  if (request.headers.get("content-type")?.includes("application/json")) {
    try {
      requestBody = await request.json();
    } catch (error) {
      requestBody = null;
    }
  }

  let analysisTemplate = existingTemplate;
  if (
    requestBody &&
    Object.prototype.hasOwnProperty.call(requestBody, "analysisTemplate")
  ) {
    if (requestBody.analysisTemplate === null) {
      analysisTemplate = null;
    } else {
      const normalizedRequestedTemplate = normalizeAnalysisTemplate(
        requestBody.analysisTemplate,
      );
      if (normalizedRequestedTemplate) {
        analysisTemplate = normalizedRequestedTemplate;
      }
    }
  }

  const now = new Date();
  cobraMeta.lastActionSummaryRequestedAt = now.toISOString();
  processingMetadata.cobra = cobraMeta;

  await prisma.content.update({
    where: { id: content.id },
    data: {
      actionSummaryStatus: "PROCESSING",
      analysisRequestedAt: now,
      processingMetadata,
    },
  });

  let response;
  let data;
  try {
    response = await fetch(getActionSummaryEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildRequestPayload({
          content,
          session,
          cobraMeta,
          analysisTemplate,
        }),
      ),
    });
    data = await response.json().catch(() => null);
  } catch (error) {
    cobraMeta.actionSummary = {
      lastRunAt: new Date().toISOString(),
      status: "FAILED",
      error: error.message,
      analysisTemplate,
    };
    processingMetadata.cobra = cobraMeta;

    await prisma.content.update({
      where: { id: content.id },
      data: {
        actionSummaryStatus: "FAILED",
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
      "Action summary request failed";

    cobraMeta.actionSummary = {
      lastRunAt: new Date().toISOString(),
      status: "FAILED",
      error: errorMessage,
      analysisTemplate,
    };
    processingMetadata.cobra = cobraMeta;

    await prisma.content.update({
      where: { id: content.id },
      data: {
        actionSummaryStatus: "FAILED",
        processingMetadata,
      },
    });

    return NextResponse.json({ error: errorMessage }, { status: response.status || 500 });
  }

  cobraMeta.manifestPath = data?.manifest_path ?? cobraMeta.manifestPath ?? null;
  const responseTemplate =
    normalizeAnalysisTemplate(data?.analysis_template) ?? analysisTemplate ?? null;
  analysisTemplate = responseTemplate;
  cobraMeta.actionSummary = {
    lastRunAt: new Date().toISOString(),
    analysis: data?.analysis ?? null,
    analysisOutputPath: data?.analysis_output_path ?? null,
    storageArtifacts: data?.storage_artifacts ?? null,
    searchUploads: data?.search_uploads ?? [],
    analysisTemplate: analysisTemplate,
    filters: {
      organizationId: content.organizationId,
      collectionId: content.collectionId,
      contentId: content.id,
    },
  };
  processingMetadata.cobra = cobraMeta;

  await prisma.content.update({
    where: { id: content.id },
    data: {
      actionSummaryStatus: "COMPLETED",
      processingMetadata,
    },
  });

  return NextResponse.json(
    {
      analysis: data?.analysis ?? "ActionSummary",
      manifestPath: data?.manifest_path ?? null,
      searchUploads: data?.search_uploads ?? [],
      analysisOutputPath: data?.analysis_output_path ?? null,
      storageArtifacts: data?.storage_artifacts ?? null,
      analysisTemplate,
      filters: {
        organizationId: content.organizationId,
        collectionId: content.collectionId,
        contentId: content.id,
      },
    },
    { status: 200 },
  );
}
