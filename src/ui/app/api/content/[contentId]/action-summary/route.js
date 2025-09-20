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

function isHttpUrl(value) {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (error) {
    return false;
  }
}

function resolveVideoSource(cobraMeta, content) {
  const candidates = [
    cobraMeta?.videoUrl,
    cobraMeta?.storageUrl,
    content?.videoUrl,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length) {
      return candidate.trim();
    }
  }

  return null;
}

function resolveManifestReference(cobraMeta) {
  if (!cobraMeta || typeof cobraMeta !== "object") {
    return null;
  }

  const candidates = [
    cobraMeta.manifestUrl,
    cobraMeta.manifestPath,
    cobraMeta?.actionSummary?.storageArtifacts?.manifest,
    cobraMeta?.chapterAnalysis?.storageArtifacts?.manifest,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length) {
      return candidate.trim();
    }
  }

  return null;
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

const DEFAULT_ACTION_SUMMARY_CONFIG = {
  segment_length: 10,
  fps: 1,
  max_workers: null,
  run_async: true,

  overwrite_output: true,

  reprocess_segments: false,
  generate_transcripts: true,
  trim_to_nearest_second: false,
  allow_partial_segments: true,
  upload_to_azure: true,
  skip_preprocess: false,
  output_directory: null,
  lens_prompt: null,
};

function sanitizeActionSummaryConfigOverride(config) {
  if (!config || typeof config !== "object") {
    return null;
  }

  const sanitized = {};

  const segmentLength = coercePositiveInteger(
    config.segment_length ?? config.segmentLength,
  );
  if (segmentLength != null) {
    sanitized.segment_length = segmentLength;
  }

  const fps = coercePositiveNumber(config.fps);
  if (fps != null) {
    sanitized.fps = fps;

  }

  if (
    Object.prototype.hasOwnProperty.call(config, "max_workers") ||
    Object.prototype.hasOwnProperty.call(config, "maxWorkers")
  ) {
    const maxWorkersValue = config.max_workers ?? config.maxWorkers;
    const maxWorkers = coercePositiveInteger(maxWorkersValue);
    sanitized.max_workers = maxWorkers != null ? maxWorkers : null;
  }

  if (
    Object.prototype.hasOwnProperty.call(config, "output_directory") ||
    Object.prototype.hasOwnProperty.call(config, "outputDirectory")
  ) {
    const outputDirectory = config.output_directory ?? config.outputDirectory;
    if (typeof outputDirectory === "string" && outputDirectory.trim().length) {
      sanitized.output_directory = outputDirectory.trim();
    } else {
      sanitized.output_directory = null;
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(config, "lens_prompt") ||
    Object.prototype.hasOwnProperty.call(config, "lensPrompt")
  ) {
    const lensValue = config.lens_prompt ?? config.lensPrompt;
    if (typeof lensValue === "string") {
      const trimmedLens = lensValue.trim();
      sanitized.lens_prompt = trimmedLens.length ? trimmedLens : null;
    } else if (lensValue == null) {
      sanitized.lens_prompt = null;
    }
  }

  const booleanFields = [
    ["run_async", config.run_async ?? config.runAsync],
    ["overwrite_output", config.overwrite_output ?? config.overwriteOutput],
    ["reprocess_segments", config.reprocess_segments ?? config.reprocessSegments],
    [
      "generate_transcripts",
      config.generate_transcripts ?? config.generateTranscripts,
    ],
    [
      "trim_to_nearest_second",
      config.trim_to_nearest_second ?? config.trimToNearestSecond,
    ],
    [
      "allow_partial_segments",
      config.allow_partial_segments ?? config.allowPartialSegments,
    ],
    ["upload_to_azure", config.upload_to_azure ?? config.uploadToAzure],
    ["skip_preprocess", config.skip_preprocess ?? config.skipPreprocess],
  ];

  booleanFields.forEach(([key, value]) => {
    const coerced = coerceBoolean(value);
    if (coerced != null) {
      sanitized[key] = coerced;
    }
  });

  return Object.keys(sanitized).length ? sanitized : null;
}

function buildNormalizedActionSummaryConfig({ cobraMeta, configOverride }) {
  const manifestReference = resolveManifestReference(cobraMeta);
  const base = {
    ...DEFAULT_ACTION_SUMMARY_CONFIG,
    skip_preprocess:
      manifestReference && !isHttpUrl(manifestReference)
        ? true
        : DEFAULT_ACTION_SUMMARY_CONFIG.skip_preprocess,
  };

  const sources = [
    { data: cobraMeta?.uploadMetadata, allowFps: false },
    { data: cobraMeta?.actionSummary?.config, allowFps: true },
    { data: configOverride, allowFps: true },
  ];

  sources.forEach(({ data, allowFps }) => {
    if (!data || typeof data !== "object") {

      return;
    }

    const segmentLength = coercePositiveInteger(

      data.segment_length ?? data.segmentLength,

    );
    if (segmentLength != null) {
      base.segment_length = segmentLength;
    }


    const fps = coercePositiveNumber(data.fps);
    if (allowFps && fps != null) {

      base.fps = fps;
    }

    if (

      Object.prototype.hasOwnProperty.call(data, "max_workers") ||
      Object.prototype.hasOwnProperty.call(data, "maxWorkers")
    ) {
      const maxWorkers = coercePositiveInteger(
        data.max_workers ?? data.maxWorkers,

      );
      base.max_workers = maxWorkers != null ? maxWorkers : null;
    }

    if (
      Object.prototype.hasOwnProperty.call(data, "output_directory") ||
      Object.prototype.hasOwnProperty.call(data, "outputDirectory")
    ) {
      const outputDirectory =
        data.output_directory ?? data.outputDirectory ?? null;

      if (typeof outputDirectory === "string" && outputDirectory.trim().length) {
        base.output_directory = outputDirectory.trim();
      } else {
        base.output_directory = null;
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(data, "lens_prompt") ||
      Object.prototype.hasOwnProperty.call(data, "lensPrompt")
    ) {
      const lensValue = data.lens_prompt ?? data.lensPrompt;

      if (typeof lensValue === "string" && lensValue.trim().length) {
        base.lens_prompt = lensValue.trim();
      } else if (lensValue == null) {
        base.lens_prompt = null;
      }
    }

    const booleanFields = [

      ["run_async", data.run_async ?? data.runAsync],
      ["overwrite_output", data.overwrite_output ?? data.overwriteOutput],
      [
        "reprocess_segments",
        data.reprocess_segments ?? data.reprocessSegments,
      ],
      [
        "generate_transcripts",
        data.generate_transcripts ?? data.generateTranscripts,
      ],
      [
        "trim_to_nearest_second",
        data.trim_to_nearest_second ?? data.trimToNearestSecond,
      ],
      [
        "allow_partial_segments",
        data.allow_partial_segments ?? data.allowPartialSegments,
      ],
      ["upload_to_azure", data.upload_to_azure ?? data.uploadToAzure],
      ["skip_preprocess", data.skip_preprocess ?? data.skipPreprocess],

    ];

    booleanFields.forEach(([key, value]) => {
      const coerced = coerceBoolean(value);
      if (coerced != null) {
        base[key] = coerced;
      }
    });
  });

  if (typeof base.output_directory !== "string") {
    base.output_directory = null;
  }

  if (typeof base.lens_prompt === "string") {
    const trimmedLens = base.lens_prompt.trim();
    base.lens_prompt = trimmedLens.length ? trimmedLens : null;
  } else {
    base.lens_prompt = null;
  }

  return base;
}

function buildRequestPayload({
  content,
  session,
  cobraMeta,
  analysisTemplate,
  configOverride,
}) {
  const normalizedConfig = buildNormalizedActionSummaryConfig({
    cobraMeta,
    configOverride,
  });

  const videoSource = resolveVideoSource(cobraMeta, content);
  const manifestReference = resolveManifestReference(cobraMeta);

  const payload = {
    video_path: videoSource,
    manifest_path: manifestReference ?? null,
    organization: content.organizationId,
    organization_name: content.organization?.name ?? undefined,
    collection: content.collectionId,
    collection_name: content.collection?.name ?? undefined,
    user: session.user.id,
    user_name: buildDisplayName(session, content),
    video_id: content.id,
    video_url: videoSource,
    segment_length: normalizedConfig.segment_length,
    fps: normalizedConfig.fps,
    run_async: normalizedConfig.run_async,
    overwrite_output: normalizedConfig.overwrite_output,
    reprocess_segments: normalizedConfig.reprocess_segments,
    generate_transcripts: normalizedConfig.generate_transcripts,
    trim_to_nearest_second: normalizedConfig.trim_to_nearest_second,
    allow_partial_segments: normalizedConfig.allow_partial_segments,
    upload_to_azure: normalizedConfig.upload_to_azure,
    skip_preprocess: normalizedConfig.skip_preprocess,
  };

  if (normalizedConfig.max_workers != null) {
    payload.max_workers = normalizedConfig.max_workers;
  }

  if (typeof normalizedConfig.output_directory === "string") {
    payload.output_directory = normalizedConfig.output_directory;
  }

  if (manifestReference && !isHttpUrl(manifestReference)) {
    payload.skip_preprocess = true;
  }

  if (
    typeof normalizedConfig.lens_prompt === "string" &&
    normalizedConfig.lens_prompt.trim().length
  ) {
    payload.analysis_lens = normalizedConfig.lens_prompt.trim();
  }

  if (Array.isArray(analysisTemplate) && analysisTemplate.length > 0) {
    payload.analysis_template = analysisTemplate;
  }

  return { payload, config: normalizedConfig };
}

async function loadActionSummaryContext(params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const contentId = params?.contentId;
  if (!contentId) {
    return {
      response: NextResponse.json({ error: "Content id is required" }, { status: 400 }),
    };
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
    return {
      response: NextResponse.json({ error: "Content not found" }, { status: 404 }),
    };
  }

  const { clone: processingMetadata, cobra: cobraMeta } = getCobraMetadata(
    content.processingMetadata,
  );

  return { session, content, processingMetadata, cobraMeta };
}

export async function POST(request, { params }) {
  const context = await loadActionSummaryContext(params);
  if (context?.response) {
    return context.response;
  }

  const { session, content, processingMetadata, cobraMeta } = context;

  const videoSource = resolveVideoSource(cobraMeta, content);
  if (!videoSource) {
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

  let requestedConfig = null;
  if (requestBody && Object.prototype.hasOwnProperty.call(requestBody, "config")) {
    requestedConfig = sanitizeActionSummaryConfigOverride(requestBody.config);
  }

  const { payload: requestPayload, config: normalizedConfig } =
    buildRequestPayload({
      content,
      session,
      cobraMeta,
      analysisTemplate,
      configOverride: requestedConfig,
    });

  const now = new Date();
  cobraMeta.lastActionSummaryRequestedAt = now.toISOString();
  cobraMeta.actionSummary = {
    ...(cobraMeta.actionSummary ?? {}),
    config: normalizedConfig,
  };
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
      body: JSON.stringify(requestPayload),
    });
    data = await response.json().catch(() => null);
  } catch (error) {
    cobraMeta.actionSummary = {
      lastRunAt: new Date().toISOString(),
      status: "FAILED",
      error: error.message,
      analysisTemplate,
      config: normalizedConfig,
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
      config: normalizedConfig,
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

  const manifestUrlFromResponse =
    (data?.storage_artifacts && data.storage_artifacts.manifest) ||
    (typeof data?.manifest_path === "string" && isHttpUrl(data.manifest_path)
      ? data.manifest_path
      : null);

  if (manifestUrlFromResponse) {
    cobraMeta.manifestUrl = manifestUrlFromResponse;
    cobraMeta.manifestPath = manifestUrlFromResponse;
  } else if (cobraMeta.manifestUrl) {
    cobraMeta.manifestPath = cobraMeta.manifestUrl;
  } else if (cobraMeta.manifestPath && isHttpUrl(cobraMeta.manifestPath)) {
    cobraMeta.manifestUrl = cobraMeta.manifestPath;
  } else {
    cobraMeta.manifestUrl = null;
    cobraMeta.manifestPath = null;
  }

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
    config: normalizedConfig,
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
      manifestPath: manifestUrlFromResponse ?? cobraMeta.manifestUrl ?? null,
      searchUploads: data?.search_uploads ?? [],
      analysisOutputPath: data?.analysis_output_path ?? null,
      storageArtifacts: data?.storage_artifacts ?? null,
      analysisTemplate,
      config: normalizedConfig,
      filters: {
        organizationId: content.organizationId,
        collectionId: content.collectionId,
        contentId: content.id,
      },
    },
    { status: 200 },
  );
}

export async function PATCH(request, { params }) {
  const context = await loadActionSummaryContext(params);
  if (context?.response) {
    return context.response;
  }

  const { content, processingMetadata, cobraMeta } = context;

  let requestBody = null;
  if (request.headers.get("content-type")?.includes("application/json")) {
    try {
      requestBody = await request.json();
    } catch (error) {
      requestBody = null;
    }
  }

  if (!requestBody || !Object.prototype.hasOwnProperty.call(requestBody, "config")) {
    return NextResponse.json({ error: "Config payload is required" }, { status: 400 });
  }

  let requestedConfig = null;
  if (requestBody.config != null) {
    requestedConfig = sanitizeActionSummaryConfigOverride(requestBody.config);
  }

  if (!requestedConfig) {
    return NextResponse.json(
      { error: "Provide at least one valid processing setting to update." },
      { status: 400 },
    );
  }

  const normalizedConfig = buildNormalizedActionSummaryConfig({
    cobraMeta,
    configOverride: requestedConfig,
  });

  cobraMeta.actionSummary = {
    ...(cobraMeta.actionSummary ?? {}),
    config: normalizedConfig,
  };
  processingMetadata.cobra = cobraMeta;

  await prisma.content.update({
    where: { id: content.id },
    data: {
      processingMetadata,
    },
  });

  return NextResponse.json({ config: normalizedConfig }, { status: 200 });
}
