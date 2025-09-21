"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import VideoUploadPanel from "@/components/dashboard/video-upload-panel";
import ChatWidget from "@/components/chat/chat-widget";

const ReactPlayer = dynamic(
  () =>
    import("react-player").then(({ default: Player }) => {
      const ReactPlayerWithRef = forwardRef((props, ref) => (
        <Player {...props} ref={ref} />
      ));

      ReactPlayerWithRef.displayName = "ReactPlayer";
      return ReactPlayerWithRef;
    }),
  { ssr: false },
);

function formatStatus(status) {
  const normalized = (status ?? "QUEUED").toUpperCase();
  switch (normalized) {
    case "COMPLETED":
      return "bg-emerald-100 text-emerald-700";
    case "FAILED":
      return "bg-red-100 text-red-700";
    case "PROCESSING":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function safeParseJson(value) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
}

function createWordPreview(text, wordLimit = 15) {
  if (text == null) {
    return "";
  }

  const normalized = String(text).trim();
  if (!normalized) {
    return normalized;
  }

  const words = normalized.split(/\s+/);
  if (words.length <= wordLimit) {
    return normalized;
  }

  return `${words.slice(0, wordLimit).join(" ")}…`;
}

function extractArrayFromAnalysis(analysis, candidateKeys = []) {
  if (!analysis) {
    return [];
  }

  if (Array.isArray(analysis)) {
    return analysis;
  }

  if (typeof analysis === "object") {
    for (const key of candidateKeys) {
      const value = analysis[key];
      if (Array.isArray(value)) {
        return value;
      }
    }
  }

  return [];
}

function extractNumericSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (value == null) {
    return null;
  }

  const stringValue = value.toString().trim();
  if (!stringValue) {
    return null;
  }

  const normalizedValue = stringValue.replace(/,/g, ".");

  const isoMatch = normalizedValue.match(
    /^P(T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)$/i,
  );
  if (isoMatch) {
    const hours = Number.parseFloat(isoMatch[2] ?? "0");
    const minutes = Number.parseFloat(isoMatch[3] ?? "0");
    const seconds = Number.parseFloat(isoMatch[4] ?? "0");

    if (
      !Number.isNaN(hours) &&
      !Number.isNaN(minutes) &&
      !Number.isNaN(seconds)
    ) {
      return hours * 3600 + minutes * 60 + seconds;
    }
  }

  const colonSanitized = normalizedValue
    .replace(/^[^\d-]+/, "")
    .replace(/[^0-9:.]+$/, "");
  if (colonSanitized.includes(":")) {
    const colonParts = colonSanitized
      .split(":")
      .map((part) => part.trim())
      .filter((part) => part !== "");

    if (colonParts.length >= 2) {
      let seconds = 0;
      let multiplier = 1;
      for (let index = colonParts.length - 1; index >= 0; index -= 1) {
        const numericPart = Number.parseFloat(colonParts[index]);
        if (Number.isNaN(numericPart)) {
          seconds = Number.NaN;
          break;
        }
        seconds += numericPart * multiplier;
        multiplier *= 60;
      }
      if (!Number.isNaN(seconds)) {
        return seconds;
      }
    }
  }

  let accumulatedSeconds = 0;
  let matchedDurationUnits = false;
  const durationPattern =
    /(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|h|minutes?|mins?|min|m(?!s)|seconds?|secs?|sec|s)/gi;

  let durationMatch;
  while ((durationMatch = durationPattern.exec(normalizedValue))) {
    matchedDurationUnits = true;
    const amount = Number.parseFloat(durationMatch[1]);
    if (Number.isNaN(amount)) {
      continue;
    }

    const unit = durationMatch[2].toLowerCase();
    if (unit.startsWith("h")) {
      accumulatedSeconds += amount * 3600;
    } else if (unit.startsWith("m")) {
      accumulatedSeconds += amount * 60;
    } else {
      accumulatedSeconds += amount;
    }
  }
  if (matchedDurationUnits) {
    return accumulatedSeconds;
  }

  const fallbackMatch = normalizedValue.match(/-?\d+(?:\.\d+)?/);
  if (!fallbackMatch) {
    return null;
  }

  const numericValue = Number.parseFloat(fallbackMatch[0]);
  return Number.isNaN(numericValue) ? null : numericValue;
}

function formatSecondsLabel(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
    return null;
  }

  const clamped = Math.max(0, seconds);
  const wholeSeconds = Math.floor(clamped);
  const fractional = clamped - wholeSeconds;
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const secs = wholeSeconds % 60;

  const parts = [];
  if (hours > 0) {
    parts.push(hours.toString());
    parts.push(minutes.toString().padStart(2, "0"));
  } else {
    parts.push(minutes.toString());
  }
  parts.push(secs.toString().padStart(2, "0"));

  let label = parts.join(":");

  if (fractional > 0) {
    let decimals = fractional.toFixed(2).slice(1);
    decimals = decimals.replace(/0+$/, "");
    if (decimals && decimals !== ".") {
      label += decimals;
    }
  }

  return label;
}

function hasMeaningfulValue(value) {
  if (value == null) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasMeaningfulValue(item));
  }

  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }

  return true;
}

function formatFieldLabel(fieldName) {
  if (!fieldName) {
    return "";
  }

  return fieldName
    .toString()
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function getValueFromSource(source, fieldName) {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  if (fieldName in source) {
    return source[fieldName];
  }

  const lowerFieldName = fieldName.toLowerCase();
  const matchingKey = Object.keys(source).find(
    (candidate) => candidate.toLowerCase() === lowerFieldName,
  );

  return matchingKey ? source[matchingKey] : undefined;
}

function normalizeDetailValue(value) {
  if (!hasMeaningfulValue(value)) {
    return null;
  }

  if (Array.isArray(value)) {
    const filtered = value.filter((item) => hasMeaningfulValue(item));
    if (!filtered.length) {
      return null;
    }

    const text = filtered
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (typeof item === "number" || typeof item === "boolean") {
          return String(item);
        }
        if (item == null) {
          return "";
        }
        return JSON.stringify(item, null, 2);
      })
      .filter((item) => item !== "")
      .join(", ");

    if (!text) {
      return null;
    }

    return { text, multiline: text.includes("\n") };
  }

  if (typeof value === "object") {
    return { text: JSON.stringify(value, null, 2), multiline: true };
  }

  return { text: String(value), multiline: false };
}

function extractTranscriptUrl(artifacts) {
  if (!artifacts) {
    return null;
  }

  if (typeof artifacts === "string") {
    return artifacts;
  }

  if (Array.isArray(artifacts)) {
    return null;
  }

  if (typeof artifacts === "object" && artifacts !== null) {
    const candidate = artifacts.transcript ?? artifacts.transcription ?? null;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function normalizeTranscriptData(transcript) {
  if (!transcript || typeof transcript !== "object") {
    return {
      text: "",
      durationSeconds: null,
      durationLabel: null,
      segments: [],
    };
  }

  const text = typeof transcript.text === "string" ? transcript.text.trim() : "";
  const durationSeconds = extractNumericSeconds(transcript.duration);
  const durationLabel = durationSeconds != null ? formatSecondsLabel(durationSeconds) : null;

  let segments = [];
  if (Array.isArray(transcript.segments)) {
    segments = transcript.segments
      .map((segment, index) => {
        if (!segment || typeof segment !== "object") {
          return null;
        }

        const segmentText = typeof segment.text === "string" ? segment.text.trim() : "";
        const startSeconds = extractNumericSeconds(segment.start);
        const endSeconds = extractNumericSeconds(segment.end);
        const startLabel = startSeconds != null ? formatSecondsLabel(startSeconds) : null;
        const endLabel = endSeconds != null ? formatSecondsLabel(endSeconds) : null;

        if (!segmentText && startLabel == null && endLabel == null) {
          return null;
        }

        return {
          id: segment.id ?? `segment-${index}`,
          text: segmentText || "No transcription available for this segment.",
          startSeconds,
          endSeconds,
          startLabel,
          endLabel,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const aStart = a.startSeconds ?? Number.POSITIVE_INFINITY;
        const bStart = b.startSeconds ?? Number.POSITIVE_INFINITY;
        if (aStart !== bStart) {
          return aStart - bStart;
        }
        return (a.text || "").localeCompare(b.text || "");
      });
  }

  return {
    text,
    durationSeconds,
    durationLabel,
    segments,
  };
}

const DEFAULT_ACTION_SUMMARY_FIELDS = [
  {
    name: "start_timestamp",
    description: "Timestamp when the scene begins in seconds (for example, 4.97s).",
  },
  {
    name: "end_timestamp",
    description: "Timestamp when the scene ends in seconds (for example, 16s).",
  },
  {
    name: "sentiment",
    description: "Overall sentiment for the scene (Positive, Negative, or Neutral).",
  },
  {
    name: "scene_theme",
    description: "Theme or tone for the scene (for example, Dramatic or Heartfelt).",
  },
  {
    name: "characters",
    description:
      "Key characters involved in the scene with identifying details. For sports, include every player involved.",
  },
  {
    name: "summary",
    description:
      "Detailed summary of the scene that combines the transcript and frames to describe what is happening.",
  },
  {
    name: "actions",
    description: "Specific actions taken by each subject or team within the scene.",
  },
  {
    name: "key_objects",
    description:
      "Important objects that appear in the scene, including colors and descriptive details when available.",
  },
];

function mapTemplateToFields(template) {
  if (!Array.isArray(template)) {
    return DEFAULT_ACTION_SUMMARY_FIELDS.map((field) => ({ ...field }));
  }

  const firstEntry = template.find((item) => item && typeof item === "object");
  if (!firstEntry) {
    return DEFAULT_ACTION_SUMMARY_FIELDS.map((field) => ({ ...field }));
  }

  const entries = Object.entries(firstEntry);
  if (entries.length === 0) {
    return DEFAULT_ACTION_SUMMARY_FIELDS.map((field) => ({ ...field }));
  }

  return entries.map(([name, description]) => ({
    name,
    description: typeof description === "string" ? description : "",
  }));
}

function sanitizeActionSummaryFields(fields) {
  const seenNames = new Set();
  const sanitized = [];

  fields.forEach((field) => {
    const trimmedName = (field?.name ?? "").trim();
    if (!trimmedName || seenNames.has(trimmedName)) {
      return;
    }

    seenNames.add(trimmedName);
    sanitized.push({
      name: trimmedName,
      description: (field?.description ?? "").trim(),
    });
  });

  if (sanitized.length === 0) {
    return DEFAULT_ACTION_SUMMARY_FIELDS.map((field) => ({ ...field }));
  }

  return sanitized;
}

function buildTemplateFromFields(fields) {
  const entry = {};
  fields.forEach((field) => {
    if (!field?.name) {
      return;
    }
    entry[field.name] = field.description ?? "";
  });

  if (Object.keys(entry).length === 0) {
    return [];
  }

  return [entry, { ...entry }];
}

const DEFAULT_SEGMENT_LENGTH = 10;
const DEFAULT_ACTION_SUMMARY_FPS = 1;

function buildDefaultActionSummaryConfigState() {
  return {
    segment_length: DEFAULT_SEGMENT_LENGTH.toString(),
    fps: DEFAULT_ACTION_SUMMARY_FPS.toString(),
    max_workers: "",
    run_async: true,

    overwrite_output: true,

    reprocess_segments: false,
    generate_transcripts: true,
    trim_to_nearest_second: false,
    allow_partial_segments: true,
    upload_to_azure: true,
    skip_preprocess: false,
    output_directory: "",
    lens_prompt: "",
  };
}

function parsePositiveInteger(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const intValue = Math.floor(value);
    return intValue > 0 ? intValue : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.length) {
      return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
  }

  return null;
}

function parsePositiveNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.length) {
      return null;
    }
    const parsed = Number.parseFloat(trimmed);
    return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
  }

  return null;
}

function parseBooleanInput(value) {
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

function buildInitialActionSummaryConfigState(config, uploadMetadata) {
  const state = buildDefaultActionSummaryConfigState();

  const uploadSource =
    uploadMetadata && typeof uploadMetadata === "object" ? uploadMetadata : null;
  const configSource = config && typeof config === "object" ? config : null;

  const sources = [];

  if (uploadSource) {
    sources.push({ data: uploadSource, allowFps: false });
  }

  if (configSource) {
    sources.push({ data: configSource, allowFps: true });
  }

  sources.forEach(({ data, allowFps }) => {
    const segmentLength = parsePositiveInteger(
      data.segment_length ?? data.segmentLength,

    );
    if (segmentLength != null) {
      state.segment_length = segmentLength.toString();
    }


    const fps = parsePositiveNumber(data.fps);
    if (allowFps && fps != null) {

      state.fps = fps.toString();
    }

    if (

      Object.prototype.hasOwnProperty.call(data, "max_workers") ||
      Object.prototype.hasOwnProperty.call(data, "maxWorkers")
    ) {
      const maxWorkers = parsePositiveInteger(
        data.max_workers ?? data.maxWorkers,

      );
      state.max_workers = maxWorkers != null ? maxWorkers.toString() : "";
    }

    if (

      Object.prototype.hasOwnProperty.call(data, "output_directory") ||
      Object.prototype.hasOwnProperty.call(data, "outputDirectory")
    ) {
      const outputDirectory =
        data.output_directory ?? data.outputDirectory ?? "";

      if (typeof outputDirectory === "string") {
        state.output_directory = outputDirectory.trim();
      }
    }

    if (

      Object.prototype.hasOwnProperty.call(data, "lens_prompt") ||
      Object.prototype.hasOwnProperty.call(data, "lensPrompt")
    ) {
      const lensValue = data.lens_prompt ?? data.lensPrompt;
      if (typeof lensValue === "string") {
        state.lens_prompt = lensValue.trim();
      } else if (lensValue == null) {
        state.lens_prompt = "";
      }
    }

    const booleanFields = [
      "run_async",
      "overwrite_output",
      "reprocess_segments",
      "generate_transcripts",
      "trim_to_nearest_second",
      "allow_partial_segments",
      "upload_to_azure",
      "skip_preprocess",
    ];

    booleanFields.forEach((key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      const candidate =

        parseBooleanInput(data[key]) ?? parseBooleanInput(data[camelKey]);

      if (candidate != null) {
        state[key] = candidate;
      }
    });
  });

  return state;
}

function buildActionSummaryConfigPayload(state) {
  const sanitized = {
    segment_length:
      parsePositiveInteger(state.segment_length) ?? DEFAULT_SEGMENT_LENGTH,
    fps: parsePositiveNumber(state.fps) ?? DEFAULT_ACTION_SUMMARY_FPS,
    run_async: Boolean(state.run_async),
    overwrite_output: Boolean(state.overwrite_output),
    reprocess_segments: Boolean(state.reprocess_segments),
    generate_transcripts: Boolean(state.generate_transcripts),
    trim_to_nearest_second: Boolean(state.trim_to_nearest_second),
    allow_partial_segments: Boolean(state.allow_partial_segments),
    upload_to_azure: Boolean(state.upload_to_azure),
    skip_preprocess: Boolean(state.skip_preprocess),
  };

  if (state.max_workers !== undefined) {
    const maxWorkers = parsePositiveInteger(state.max_workers);
    sanitized.max_workers = maxWorkers != null ? maxWorkers : null;
  }

  if (state.output_directory !== undefined) {
    const directory =
      typeof state.output_directory === "string"
        ? state.output_directory.trim()
        : "";
    sanitized.output_directory = directory.length ? directory : null;
  }

  if (state.lens_prompt !== undefined) {
    if (typeof state.lens_prompt === "string") {
      const trimmedLens = state.lens_prompt.trim();
      sanitized.lens_prompt = trimmedLens.length ? trimmedLens : null;
    } else if (state.lens_prompt == null) {
      sanitized.lens_prompt = null;
    }
  }

  return sanitized;
}

function sanitizeActionSummaryConfigState(state) {
  return buildInitialActionSummaryConfigState(
    buildActionSummaryConfigPayload(state),
    null,
  );
}

function summarizeActionSummaryConfig(state) {
  const config = buildActionSummaryConfigPayload(state);
  const summary = [];

  const lensPrompt =
    typeof config.lens_prompt === "string" ? config.lens_prompt.trim() : "";
  if (lensPrompt.length) {
    const preview = lensPrompt.replace(/\s+/g, " ").trim();
    const truncated = preview.length > 120 ? `${preview.slice(0, 117)}…` : preview;
    summary.push(`Lens: ${truncated}`);
  } else {
    summary.push("Lens: Default");
  }

  summary.push(
    `Segment length: ${config.segment_length} second${
      config.segment_length === 1 ? "" : "s"
    }`,
  );
  summary.push(`Frames per second: ${config.fps}`);
  summary.push(
    `Max workers: ${
      config.max_workers == null ? "Auto" : config.max_workers.toString()
    }`,
  );
  summary.push(
    `Generate transcripts: ${config.generate_transcripts ? "Yes" : "No"}`,
  );
  summary.push(
    `Trim to nearest second: ${config.trim_to_nearest_second ? "Yes" : "No"}`,
  );
  summary.push(
    `Allow partial segments: ${config.allow_partial_segments ? "Yes" : "No"}`,
  );
  summary.push(`Overwrite output: ${config.overwrite_output ? "Yes" : "No"}`);
  summary.push(
    `Reprocess segments: ${config.reprocess_segments ? "Yes" : "No"}`,
  );
  summary.push(`Run asynchronously: ${config.run_async ? "Yes" : "No"}`);
  summary.push(`Skip preprocessing: ${config.skip_preprocess ? "Yes" : "No"}`);
  summary.push(`Upload to Azure: ${config.upload_to_azure ? "Yes" : "No"}`);
  summary.push(
    `Output directory: ${
      config.output_directory ? config.output_directory : "Auto"
    }`,
  );

  return summary;
}

const ACTION_SUMMARY_TOGGLE_FIELDS = [
  { key: "run_async", label: "Run asynchronously" },
  { key: "skip_preprocess", label: "Skip preprocessing" },
  { key: "overwrite_output", label: "Overwrite existing output" },
  { key: "reprocess_segments", label: "Reprocess segments" },
  { key: "generate_transcripts", label: "Generate transcripts" },
  { key: "trim_to_nearest_second", label: "Trim to nearest second" },
  { key: "allow_partial_segments", label: "Allow partial segments" },
  { key: "upload_to_azure", label: "Upload results to Azure" },
];

function normalizeActionSummaryEntry(entry, index) {
  if (!entry || typeof entry !== "object") {
    const textValue = typeof entry === "string" ? entry : JSON.stringify(entry, null, 2);
    return {
      id: `action-${index}`,
      summary: textValue,
      start: null,
      end: null,
      actions: null,
      sentiment: null,
      theme: null,
      characters: null,
      keyObjects: null,
      startSeconds: null,
      raw: entry,
    };
  }

  const startValue =
    entry.start_timestamp ??
    entry.start ??
    entry.start_time ??
    entry.Start_Timestamp ??
    entry.Start ??
    null;
  const endValue =
    entry.end_timestamp ??
    entry.end ??
    entry.end_time ??
    entry.End_Timestamp ??
    entry.End ??
    null;
  const startSeconds = extractNumericSeconds(startValue);
  const endSeconds = extractNumericSeconds(endValue);

  return {
    id: entry.id ?? entry.segment_id ?? entry.Start_Timestamp ?? `action-${index}`,
    summary:
      entry.summary ??
      entry.text ??
      entry.description ??
      entry.overview ??
      entry.Summary ??
      null,
    actions: entry.actions ?? entry.key_actions ?? entry.Actions ?? null,
    sentiment: entry.sentiment ?? entry.Sentiment ?? null,
    theme: entry.scene_theme ?? entry.theme ?? entry.Scene_Theme ?? null,
    characters: entry.characters ?? entry.Characters ?? null,
    keyObjects: entry.key_objects ?? entry.Key_Objects ?? null,
    start: startValue,
    end: endValue,
    startSeconds,
    endSeconds,
    startLabel:
      startValue ?? (startSeconds != null ? formatSecondsLabel(startSeconds) : null),
    endLabel: endValue ?? (endSeconds != null ? formatSecondsLabel(endSeconds) : null),
    raw: entry,
  };
}

function normalizeActionSummaryEntries(analysis) {
  const entries = extractArrayFromAnalysis(analysis, [
    "entries",
    "results",
    "segments",
    "summary",
    "scenes",
    "items",
  ]);

  return entries.map((entry, index) => normalizeActionSummaryEntry(entry, index));
}

function generateActionSummaryRunId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeActionSummaryRunState(run) {
  if (!run || typeof run !== "object") {
    return null;
  }

  const id =
    typeof run.id === "string" && run.id.trim().length
      ? run.id.trim()
      : generateActionSummaryRunId();

  const name =
    typeof run.name === "string" && run.name.trim().length
      ? run.name.trim()
      : typeof run.label === "string" && run.label.trim().length
        ? run.label.trim()
        : null;

  const analysisTemplate = run.analysisTemplate ?? run.analysis_template ?? null;
  const analysisOutputPath =
    run.analysisOutputPath ?? run.analysis_output_path ?? null;
  const storageArtifacts =
    run.storageArtifacts ?? run.storage_artifacts ?? null;
  const searchUploads = Array.isArray(run.searchUploads)
    ? run.searchUploads
    : Array.isArray(run.search_uploads)
      ? run.search_uploads
      : [];
  const filters = run.filters ?? null;
  const manifestPath = run.manifestPath ?? run.manifest_path ?? null;
  const manifestUrl = run.manifestUrl ?? run.manifest_url ?? manifestPath ?? null;

  const createdAt =
    run.createdAt ?? run.requestedAt ?? run.lastRunAt ?? run.completedAt ?? null;
  const completedAt = run.completedAt ?? run.lastRunAt ?? createdAt ?? null;

  const normalized = {
    id,
    name,
    analysis: run.analysis ?? null,
    analysisTemplate,
    analysisOutputPath,
    storageArtifacts,
    searchUploads,
    filters,
    manifestPath,
    manifestUrl,
    createdAt,
    requestedAt: run.requestedAt ?? run.createdAt ?? null,
    completedAt,
    config: run.config ?? null,
  };

  Object.entries(run).forEach(([key, value]) => {
    if (
      key in normalized ||
      [
        "analysis_output_path",
        "storage_artifacts",
        "search_uploads",
        "manifest_path",
        "manifest_url",
        "label",
      ].includes(key)
    ) {
      return;
    }
    normalized[key] = value;
  });

  return normalized;
}

function hasLegacyActionSummaryData(meta) {
  if (!meta || typeof meta !== "object") {
    return false;
  }

  if (meta.analysis != null || meta.analysis_output_path != null || meta.analysisOutputPath != null) {
    return true;
  }
  if (meta.storageArtifacts != null || meta.storage_artifacts != null) {
    return true;
  }
  if (
    (Array.isArray(meta.searchUploads) && meta.searchUploads.length) ||
    (Array.isArray(meta.search_uploads) && meta.search_uploads.length)
  ) {
    return true;
  }
  return false;
}

function normalizeActionSummaryMetaState(meta) {
  const normalized = {
    config: meta?.config ?? null,
    analysisTemplate: meta?.analysisTemplate ?? meta?.analysis_template ?? null,
    runs: [],
    activeRunId:
      typeof meta?.activeRunId === "string" && meta.activeRunId.trim().length
        ? meta.activeRunId.trim()
        : null,
    lastRunAt: meta?.lastRunAt ?? meta?.last_run_at ?? null,
    manifestPath: meta?.manifestPath ?? meta?.manifest_path ?? null,
    manifestUrl: meta?.manifestUrl ?? meta?.manifest_url ?? null,
    filters: meta?.filters ?? null,
    status: meta?.status ?? null,
    error: meta?.error ?? null,
  };

  if (Array.isArray(meta?.runs)) {
    meta.runs.forEach((run) => {
      const normalizedRun = normalizeActionSummaryRunState(run);
      if (!normalizedRun) {
        return;
      }
      if (!normalized.runs.some((existing) => existing.id === normalizedRun.id)) {
        normalized.runs.push(normalizedRun);
      }
    });
  }

  if (!normalized.runs.length && hasLegacyActionSummaryData(meta)) {
    const legacyRun = normalizeActionSummaryRunState(meta);
    if (legacyRun) {
      normalized.runs.push(legacyRun);
    }
  }

  if (normalized.runs.length) {
    if (!normalized.activeRunId || !normalized.runs.some((run) => run.id === normalized.activeRunId)) {
      normalized.activeRunId = normalized.runs[normalized.runs.length - 1].id;
    }

    const activeRun =
      normalized.runs.find((run) => run.id === normalized.activeRunId) ??
      normalized.runs[normalized.runs.length - 1];

    normalized.lastRunAt =
      normalized.lastRunAt ?? activeRun?.completedAt ?? activeRun?.createdAt ?? null;
    normalized.manifestPath =
      normalized.manifestPath ?? activeRun?.manifestPath ?? null;
    normalized.manifestUrl =
      normalized.manifestUrl ?? activeRun?.manifestUrl ?? normalized.manifestPath ?? null;
    if (!normalized.analysisTemplate && activeRun?.analysisTemplate) {
      normalized.analysisTemplate = activeRun.analysisTemplate;
    }
    if (!normalized.filters && activeRun?.filters) {
      normalized.filters = activeRun.filters;
    }
  } else {
    normalized.activeRunId = null;
    normalized.lastRunAt = null;
  }

  return normalized;
}

function selectActionSummaryRun(meta, runId) {
  if (!meta || !Array.isArray(meta.runs) || !meta.runs.length) {
    return null;
  }

  if (runId) {
    const match = meta.runs.find((run) => run.id === runId);
    if (match) {
      return match;
    }
  }

  if (meta.activeRunId) {
    const active = meta.runs.find((run) => run.id === meta.activeRunId);
    if (active) {
      return active;
    }
  }

  return meta.runs[meta.runs.length - 1];
}

function formatActionSummaryRunLabel(run, index) {
  if (!run) {
    return `Run ${index + 1}`;
  }

  if (run.name) {
    return run.name;
  }

  const timestamp = run.completedAt ?? run.createdAt ?? null;
  if (timestamp) {
    return `Run ${index + 1} (${formatDateTime(timestamp)})`;
  }

  return `Run ${index + 1}`;
}

function normalizeChapterAnalysisEntry(entry, index) {
  if (!entry || typeof entry !== "object") {
    const textValue = typeof entry === "string" ? entry : JSON.stringify(entry, null, 2);
    return {
      id: `chapter-${index}`,
      title: `Chapter ${index + 1}`,
      summary: textValue,
      start: null,
      end: null,
      startSeconds: null,
      raw: entry,
    };
  }

  const startValue =
    entry.start ??
    entry.start_time ??
    entry.start_timestamp ??
    entry.Start ??
    entry.Start_Timestamp ??
    null;
  const endValue =
    entry.end ??
    entry.end_time ??
    entry.end_timestamp ??
    entry.End ??
    entry.End_Timestamp ??
    null;

  return {
    id: entry.id ?? entry.chapter_id ?? entry.title ?? `chapter-${index}`,
    title:
      entry.title ??
      entry.chapter_title ??
      entry.chapter ??
      entry.name ??
      entry.heading ??
      `Chapter ${index + 1}`,
    summary: entry.summary ?? entry.description ?? entry.overview ?? null,
    start: startValue,
    end: endValue,
    startSeconds: extractNumericSeconds(startValue),
    raw: entry,
  };
}

function normalizeChapterAnalysisEntries(analysis) {
  const entries = extractArrayFromAnalysis(analysis, [
    "chapters",
    "entries",
    "results",
    "segments",
    "items",
  ]);

  return entries.map((entry, index) => normalizeChapterAnalysisEntry(entry, index));
}

function formatDateTime(value) {
  if (!value) {
    return "Not run yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function buildFilterLabel(filters, organizationLookup, collectionLookup, contentLookup) {
  if (!filters) {
    return "—";
  }

  const parts = [];
  const organizationId = filters.organizationId ?? null;
  const collectionId = filters.collectionId ?? null;
  const contentId = filters.contentId ?? null;

  if (organizationId) {
    parts.push(organizationLookup.get(organizationId) ?? organizationId);
  }

  if (collectionId) {
    const collectionInfo = collectionLookup.get(collectionId);
    if (collectionInfo) {
      parts.push(collectionInfo.name);
    } else {
      parts.push(collectionId);
    }
  }

  if (contentId) {
    const contentInfo = contentLookup.get(contentId);
    if (contentInfo) {
      if (!collectionId && contentInfo.collectionName) {
        parts.push(contentInfo.collectionName);
      }
      if (!organizationId && contentInfo.organizationName) {
        parts.push(contentInfo.organizationName);
      }
      parts.push(contentInfo.title ?? contentId);
    } else {
      parts.push(contentId);
    }
  }

  return parts.length ? Array.from(new Set(parts)).join(" • ") : "—";
}

function summarizeArtifacts(artifacts) {
  if (!artifacts) {
    return null;
  }

  if (Array.isArray(artifacts)) {
    if (artifacts.length === 0) {
      return null;
    }
    return `${artifacts.length} artifact${artifacts.length === 1 ? "" : "s"}`;
  }

  if (typeof artifacts === "object") {
    const keys = Object.keys(artifacts);
    if (keys.length === 0) {
      return null;
    }
    return `${keys.length} artifact${keys.length === 1 ? "" : "s"}`;
  }

  return String(artifacts);
}

export default function DashboardView({
  collections,
  selectedContent,
  managementOrganizations,
  canManageCollections,
  canCreateCollections,
  canDeleteContent = false,
}) {
  const router = useRouter();
  const playerRef = useRef(null);
  const videoPlaybackUrl = selectedContent?.videoPlaybackUrl ?? null;
  const videoSource = videoPlaybackUrl ?? selectedContent?.videoUrl ?? null;
  const [currentTimestamp, setCurrentTimestamp] = useState(0);
  const [activeCollectionId, setActiveCollectionId] = useState(
    selectedContent?.collection?.id ?? collections[0]?.id ?? null,
  );
  const [activeOrganizationId, setActiveOrganizationId] = useState(
    selectedContent?.organization?.id ?? collections[0]?.organization?.id ?? null,
  );
  const [activeContentFilterId, setActiveContentFilterId] = useState(
    selectedContent?.id ?? "",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [openSearchResultId, setOpenSearchResultId] = useState(null);
  const [searchError, setSearchError] = useState("");
  const [isRunningActionSummary, setIsRunningActionSummary] = useState(false);
  const [isRunningChapterAnalysis, setIsRunningChapterAnalysis] = useState(false);
  const [actionSummaryMessage, setActionSummaryMessage] = useState("");
  const [actionSummaryError, setActionSummaryError] = useState("");
  const [chapterAnalysisMessage, setChapterAnalysisMessage] = useState("");
  const [chapterAnalysisError, setChapterAnalysisError] = useState("");
  const [isDeleteContentDialogOpen, setIsDeleteContentDialogOpen] = useState(false);
  const [isDeletingContent, setIsDeletingContent] = useState(false);
  const [deleteContentError, setDeleteContentError] = useState("");
  const [actionSummaryMeta, setActionSummaryMeta] = useState(() =>
    normalizeActionSummaryMetaState(
      selectedContent?.processingMetadata?.cobra?.actionSummary ?? null,
    ),
  );
  const [selectedActionSummaryId, setSelectedActionSummaryId] = useState(
    () => actionSummaryMeta?.activeRunId ?? null,
  );
  const [actionSummaryConfig, setActionSummaryConfig] = useState(() =>
    buildInitialActionSummaryConfigState(
      actionSummaryMeta?.config ?? null,
      selectedContent?.processingMetadata?.cobra?.uploadMetadata ?? null,
    ),
  );
  const [draftActionSummaryConfig, setDraftActionSummaryConfig] = useState(() =>
    buildInitialActionSummaryConfigState(
      actionSummaryMeta?.config ?? null,
      selectedContent?.processingMetadata?.cobra?.uploadMetadata ?? null,
    ),
  );
  const [actionSummaryFields, setActionSummaryFields] = useState(() =>
    mapTemplateToFields(actionSummaryMeta?.analysisTemplate ?? null),
  );
  const [chapterAnalysisData, setChapterAnalysisData] = useState(
    selectedContent?.processingMetadata?.cobra?.chapterAnalysis ?? null,
  );
  const [isFieldBuilderOpen, setIsFieldBuilderOpen] = useState(false);
  const [isActionSummarySettingsOpen, setIsActionSummarySettingsOpen] =
    useState(false);
  const [transcriptData, setTranscriptData] = useState(null);
  const [isTranscriptLoading, setIsTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState("");

  const organizationLookup = useMemo(() => {
    const map = new Map();
    collections.forEach((collection) => {
      map.set(collection.organization.id, collection.organization.name);
    });
    return map;
  }, [collections]);

  const collectionLookup = useMemo(() => {
    const map = new Map();
    collections.forEach((collection) => {
      map.set(collection.id, {
        name: collection.name,
        organizationId: collection.organization.id,
        organizationName: collection.organization.name,
      });
    });
    return map;
  }, [collections]);

  useEffect(() => {
    if (!videoSource) {
      playerRef.current = null;
    }
  }, [videoSource]);

  const contentLookup = useMemo(() => {
    const map = new Map();
    collections.forEach((collection) => {
      collection.contents.forEach((content) => {
        map.set(content.id, {
          title: content.title,
          collectionId: collection.id,
          collectionName: collection.name,
          organizationId: collection.organization.id,
          organizationName: collection.organization.name,
        });
      });
    });
    return map;
  }, [collections]);

  const actionSummaryRuns = useMemo(
    () => (Array.isArray(actionSummaryMeta?.runs) ? actionSummaryMeta.runs : []),
    [actionSummaryMeta?.runs],
  );
  const hasActionSummaryRuns = actionSummaryRuns.length > 0;
  const currentActionSummaryRun = useMemo(
    () => selectActionSummaryRun(actionSummaryMeta, selectedActionSummaryId),
    [actionSummaryMeta, selectedActionSummaryId],
  );
  const currentActionSummaryIndex = currentActionSummaryRun
    ? actionSummaryRuns.findIndex((run) => run.id === currentActionSummaryRun.id)
    : -1;
  const actionSummaryAnalysis = useMemo(
    () => safeParseJson(currentActionSummaryRun?.analysis),
    [currentActionSummaryRun],
  );
  const chapterAnalysisAnalysis = useMemo(
    () => safeParseJson(chapterAnalysisData?.analysis),
    [chapterAnalysisData],
  );
  const actionSummarySettingsSummary = useMemo(
    () => summarizeActionSummaryConfig(actionSummaryConfig),
    [actionSummaryConfig],
  );

  useEffect(() => {
    const templateSource =
      actionSummaryMeta?.analysisTemplate ??
      currentActionSummaryRun?.analysisTemplate ??
      null;
    setActionSummaryFields(mapTemplateToFields(templateSource));
  }, [actionSummaryMeta?.analysisTemplate, currentActionSummaryRun?.analysisTemplate]);

  useEffect(() => {
    if (!actionSummaryRuns.length) {
      if (selectedActionSummaryId !== null) {
        setSelectedActionSummaryId(null);
      }
      return;
    }

    if (
      selectedActionSummaryId &&
      actionSummaryRuns.some((run) => run.id === selectedActionSummaryId)
    ) {
      return;
    }

    let fallbackId = actionSummaryMeta?.activeRunId ?? null;
    if (!fallbackId || !actionSummaryRuns.some((run) => run.id === fallbackId)) {
      fallbackId = actionSummaryRuns[actionSummaryRuns.length - 1].id;
    }

    if (fallbackId !== selectedActionSummaryId) {
      setSelectedActionSummaryId(fallbackId);
    }
  }, [
    actionSummaryRuns,
    actionSummaryMeta?.activeRunId,
    selectedActionSummaryId,
  ]);

  const actionSummaryEntries = useMemo(
    () => normalizeActionSummaryEntries(actionSummaryAnalysis),
    [actionSummaryAnalysis],
  );
  const chapterAnalysisEntries = useMemo(
    () => normalizeChapterAnalysisEntries(chapterAnalysisAnalysis),
    [chapterAnalysisAnalysis],
  );
  const currentActionSummaryEntry = useMemo(() => {
    if (!actionSummaryEntries.length) {
      return null;
    }

    const now =
      typeof currentTimestamp === "number" && Number.isFinite(currentTimestamp)
        ? currentTimestamp
        : 0;

    let fallback = actionSummaryEntries[actionSummaryEntries.length - 1] ?? null;

    for (let index = 0; index < actionSummaryEntries.length; index += 1) {
      const entry = actionSummaryEntries[index];
      const startSeconds =
        typeof entry.startSeconds === "number" && Number.isFinite(entry.startSeconds)
          ? entry.startSeconds
          : index === 0
          ? 0
          : null;
      const endSeconds =
        typeof entry.endSeconds === "number" && Number.isFinite(entry.endSeconds)
          ? entry.endSeconds
          : typeof actionSummaryEntries[index + 1]?.startSeconds === "number"
          ? actionSummaryEntries[index + 1].startSeconds
          : null;

      if (startSeconds != null && now < startSeconds) {
        break;
      }

      if (
        (startSeconds == null || now >= startSeconds) &&
        (endSeconds == null || now < endSeconds)
      ) {
        return entry;
      }

      if (startSeconds != null && now >= startSeconds) {
        fallback = entry;
      }
    }

    return fallback;
  }, [actionSummaryEntries, currentTimestamp]);
  const currentTimestampLabel = useMemo(
    () => formatSecondsLabel(currentTimestamp),
    [currentTimestamp],
  );
  const actionSummaryChatContext = useMemo(
    () =>
      actionSummaryEntries
        .map((entry) => {
          const payload = {
            id: entry.id,
            summary: entry.summary ?? null,
            startTime: entry.startLabel ?? null,
            endTime: entry.endLabel ?? null,
            startSeconds:
              typeof entry.startSeconds === "number" && Number.isFinite(entry.startSeconds)
                ? entry.startSeconds
                : null,
            endSeconds:
              typeof entry.endSeconds === "number" && Number.isFinite(entry.endSeconds)
                ? entry.endSeconds
                : null,
            actions: entry.actions ?? null,
            characters: entry.characters ?? null,
            keyObjects: entry.keyObjects ?? null,
            sentiment: entry.sentiment ?? null,
            theme: entry.theme ?? null,
          };

          return Object.fromEntries(
            Object.entries(payload).filter(([_, value]) => {
              if (value == null) {
                return false;
              }
              if (typeof value === "string") {
                return value.trim().length > 0;
              }
              return true;
            }),
          );
        })
        .filter((entry) => Object.keys(entry).length > 1),
    [actionSummaryEntries],
  );
  const chapterAnalysisChatContext = useMemo(
    () =>
      chapterAnalysisEntries
        .map((entry) => {
          const payload = {
            id: entry.id,
            title: entry.title ?? null,
            summary: entry.summary ?? null,
            startTime: entry.start ?? null,
            endTime: entry.end ?? null,
            startSeconds:
              typeof entry.startSeconds === "number" && Number.isFinite(entry.startSeconds)
                ? entry.startSeconds
                : null,
          };

          return Object.fromEntries(
            Object.entries(payload).filter(([_, value]) => {
              if (value == null) {
                return false;
              }
              if (typeof value === "string") {
                return value.trim().length > 0;
              }
              return true;
            }),
          );
        })
        .filter((entry) => Object.keys(entry).length > 1),
    [chapterAnalysisEntries],
  );

  const activeCollection = useMemo(
    () => collections.find((collection) => collection.id === activeCollectionId) ?? null,
    [collections, activeCollectionId],
  );

  const handleDeleteContent = async () => {
    if (!selectedContent?.id) {
      return;
    }

    setDeleteContentError("");
    setIsDeletingContent(true);

    try {
      const response = await fetch(`/api/content/${selectedContent.id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to delete this video.");
      }

      setIsDeleteContentDialogOpen(false);

      const fallbackContentId =
        activeCollection?.contents?.find((item) => item.id !== selectedContent.id)?.id ??
        collections
          .flatMap((collection) => collection.contents)
          .find((item) => item.id !== selectedContent.id)?.id ??
        null;

      if (fallbackContentId) {
        router.replace(`/dashboard?contentId=${fallbackContentId}`);
      } else {
        router.replace("/dashboard");
      }

      router.refresh();
    } catch (error) {
      setDeleteContentError(
        error instanceof Error ? error.message : "Failed to delete this video.",
      );
    } finally {
      setIsDeletingContent(false);
    }
  };

  const collectionOverviewHref = selectedContent?.collection?.id
    ? `/dashboard/collections/${selectedContent.collection.id}`
    : null;

  const transcriptUrl = useMemo(() => {
    const direct = selectedContent?.processingMetadata?.cobra?.transcriptUrl;
    if (typeof direct === "string" && direct.trim().length > 0) {
      return direct.trim();
    }

    const sources = [
      currentActionSummaryRun?.storageArtifacts,
      ...actionSummaryRuns.map((run) => run?.storageArtifacts),
      selectedContent?.processingMetadata?.cobra?.actionSummary?.storageArtifacts,
      chapterAnalysisData?.storageArtifacts,
      selectedContent?.processingMetadata?.cobra?.chapterAnalysis?.storageArtifacts,
    ].filter(Boolean);

    for (const artifacts of sources) {
      const candidate = extractTranscriptUrl(artifacts);
      if (candidate) {
        return candidate;
      }
    }

    return null;
  }, [
    currentActionSummaryRun?.storageArtifacts,
    actionSummaryRuns,
    chapterAnalysisData?.storageArtifacts,
    selectedContent?.processingMetadata?.cobra?.actionSummary?.storageArtifacts,
    selectedContent?.processingMetadata?.cobra?.chapterAnalysis?.storageArtifacts,
    selectedContent?.processingMetadata?.cobra?.transcriptUrl,
  ]);

  const transcriptSegments = transcriptData?.segments ?? [];
  const transcriptText = transcriptData?.text ?? "";
  const transcriptDurationLabel = transcriptData?.durationLabel ?? null;
  const transcriptSegmentCount = transcriptSegments.length;
  const transcriptHeaderDescription = useMemo(() => {
    if (!transcriptUrl) {
      return "Run an analysis to generate an audio transcript for this video.";
    }

    if (isTranscriptLoading && !transcriptData) {
      return "Fetching the audio transcript…";
    }

    if (transcriptError) {
      return "We couldn't load the transcript automatically.";
    }

    if (transcriptSegmentCount > 0) {
      const segmentsLabel = `${transcriptSegmentCount} segment${
        transcriptSegmentCount === 1 ? "" : "s"
      }`;
      if (transcriptDurationLabel) {
        return `${segmentsLabel} • Duration ${transcriptDurationLabel}. Click a line to jump to that moment.`;
      }
      return `${segmentsLabel}. Click a line to jump to that moment.`;
    }

    if (transcriptText) {
      return "Full transcript shown below.";
    }

    return "Download the transcript file to review the audio.";
  }, [
    transcriptUrl,
    isTranscriptLoading,
    transcriptData,
    transcriptError,
    transcriptSegmentCount,
    transcriptDurationLabel,
    transcriptText,
  ]);

  useEffect(() => {
    setActionSummaryMessage("");
    setActionSummaryError("");
    setChapterAnalysisMessage("");
    setChapterAnalysisError("");
    setIsRunningActionSummary(false);
    setIsRunningChapterAnalysis(false);

    const nextMeta = normalizeActionSummaryMetaState(
      selectedContent?.processingMetadata?.cobra?.actionSummary ?? null,
    );
    setActionSummaryMeta(nextMeta);
    setSelectedActionSummaryId(
      nextMeta.activeRunId ??
        (nextMeta.runs.length
          ? nextMeta.runs[nextMeta.runs.length - 1].id
          : null),
    );
    setChapterAnalysisData(
      selectedContent?.processingMetadata?.cobra?.chapterAnalysis ?? null,
    );
    setActiveContentFilterId(selectedContent?.id ?? "");
    setSearchQuery("");
    setSearchError("");
    setSearchResults([]);
    setTranscriptData(null);
    setTranscriptError("");
    setIsTranscriptLoading(false);

    const uploadMetadata =
      selectedContent?.processingMetadata?.cobra?.uploadMetadata ?? null;
    const savedConfig = nextMeta?.config ?? null;
    const nextConfigState = buildInitialActionSummaryConfigState(
      savedConfig,
      uploadMetadata,
    );
    setActionSummaryConfig(nextConfigState);
    if (!isActionSummarySettingsOpen) {
      setDraftActionSummaryConfig(nextConfigState);
    }

    if (selectedContent?.collection?.id && selectedContent.collection.id !== activeCollectionId) {
      setActiveCollectionId(selectedContent.collection.id);
    }

    if (selectedContent?.organization?.id && selectedContent.organization.id !== activeOrganizationId) {
      setActiveOrganizationId(selectedContent.organization.id);
    }
  }, [
    selectedContent?.id,
    selectedContent?.updatedAt,
    selectedContent?.collection?.id,
    selectedContent?.organization?.id,
    selectedContent?.processingMetadata?.cobra?.actionSummary,
    selectedContent?.processingMetadata?.cobra?.chapterAnalysis,
    selectedContent?.processingMetadata?.cobra?.uploadMetadata,
    activeCollectionId,
    activeOrganizationId,
    isActionSummarySettingsOpen,
  ]);

  useEffect(() => {
    if (!isActionSummarySettingsOpen) {
      setDraftActionSummaryConfig(actionSummaryConfig);
    }
  }, [actionSummaryConfig, isActionSummarySettingsOpen]);

  useEffect(() => {
    if (activeCollectionId) {
      const collection = collections.find((item) => item.id === activeCollectionId);
      if (collection?.organization?.id && collection.organization.id !== activeOrganizationId) {
        setActiveOrganizationId(collection.organization.id);
      }
    }
  }, [activeCollectionId, activeOrganizationId, collections]);

  useEffect(() => {
    if (!transcriptUrl) {
      setTranscriptData(null);
      setTranscriptError("");
      setIsTranscriptLoading(false);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();

    const loadTranscript = async () => {
      setIsTranscriptLoading(true);
      setTranscriptError("");

      try {
        const response = await fetch(transcriptUrl, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Failed to fetch transcript (${response.status})`);
        }

        const data = await response.json();
        if (!isMounted) {
          return;
        }

        setTranscriptData(normalizeTranscriptData(data));
      } catch (error) {
        if (!isMounted || error.name === "AbortError") {
          return;
        }

        console.error("Failed to load transcript", error);
        setTranscriptError(error.message ?? "Failed to load transcript.");
        setTranscriptData(null);
      } finally {
        if (isMounted) {
          setIsTranscriptLoading(false);
        }
      }
    };

    loadTranscript();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [
    transcriptUrl,
    actionSummaryMeta?.lastRunAt,
    chapterAnalysisData?.lastRunAt,
    selectedContent?.id,
  ]);

  useEffect(() => {
    setCurrentTimestamp(0);
  }, [selectedContent?.id]);

  useEffect(() => {
    if (!activeCollectionId || activeContentFilterId === "") {
      return;
    }

    const collection = collections.find((item) => item.id === activeCollectionId);
    if (!collection) {
      return;
    }

    const hasVideo = collection.contents.some((content) => content.id === activeContentFilterId);
    if (!hasVideo) {
      setActiveContentFilterId("");
    }
  }, [activeCollectionId, activeContentFilterId, collections]);

  const organizationOptions = useMemo(
    () =>
      Array.from(organizationLookup.entries()).map(([id, name]) => ({
        id,
        name,
      })),
    [organizationLookup],
  );

  const collectionOptions = useMemo(() => {
    const relevantCollections = activeOrganizationId
      ? collections.filter((collection) => collection.organization.id === activeOrganizationId)
      : collections;

    return relevantCollections.map((collection) => ({
      id: collection.id,
      name: collection.name,
    }));
  }, [collections, activeOrganizationId]);

  const videoOptions = useMemo(() => {
    if (activeCollectionId) {
      const collection = collections.find((item) => item.id === activeCollectionId);
      if (!collection) {
        return [];
      }

      return collection.contents.map((content) => ({
        id: content.id,
        label: content.title,
      }));
    }

    if (activeOrganizationId) {
      return collections
        .filter((collection) => collection.organization.id === activeOrganizationId)
        .flatMap((collection) =>
          collection.contents.map((content) => ({
            id: content.id,
            label: `${collection.name} • ${content.title}`,
          })),
        );
    }

    return collections.flatMap((collection) =>
      collection.contents.map((content) => ({
        id: content.id,
        label: `${collection.organization.name} • ${collection.name} • ${content.title}`,
      })),
    );
  }, [collections, activeCollectionId, activeOrganizationId]);

  const searchFilterLabel = useMemo(
    () =>
      buildFilterLabel(
        {
          organizationId: activeOrganizationId,
          collectionId: activeCollectionId,
          contentId: activeContentFilterId || null,
        },
        organizationLookup,
        collectionLookup,
        contentLookup,
      ),
    [
      activeOrganizationId,
      activeCollectionId,
      activeContentFilterId,
      organizationLookup,
      collectionLookup,
      contentLookup,
    ],
  );

  const actionSummaryFiltersLabel = useMemo(
    () =>
      buildFilterLabel(
        currentActionSummaryRun?.filters ?? actionSummaryMeta?.filters ?? null,
        organizationLookup,
        collectionLookup,
        contentLookup,
      ),
    [
      currentActionSummaryRun?.filters,
      actionSummaryMeta?.filters,
      organizationLookup,
      collectionLookup,
      contentLookup,
    ],
  );

  const chapterAnalysisFiltersLabel = useMemo(
    () =>
      buildFilterLabel(
        chapterAnalysisData?.filters ?? null,
        organizationLookup,
        collectionLookup,
        contentLookup,
      ),
    [chapterAnalysisData?.filters, organizationLookup, collectionLookup, contentLookup],
  );

  const executeSearch = async ({ query, organizationId, collectionId, contentId }) => {
    const trimmedQuery = (query ?? "").toString().trim();

    if (!trimmedQuery) {
      setSearchError("Enter a question to search.");
      return;
    }

    setIsSearching(true);
    setSearchError("");
    setSearchQuery(trimmedQuery);

    try {
      const response = await fetch("/api/cog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: trimmedQuery,
          organizationId: organizationId || null,
          collectionId: collectionId || null,
          contentId: contentId || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Search request failed");
      }

      const data = await response.json();
      setSearchResults(Array.isArray(data?.message) ? data.message : []);
      setOpenSearchResultId(null);
    } catch (error) {
      setSearchError("We couldn't complete the search. Try adjusting your filters and trying again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = async (event) => {
    event.preventDefault();
    await executeSearch({
      query: searchQuery,
      organizationId: activeOrganizationId || null,
      collectionId: activeCollectionId || null,
      contentId: activeContentFilterId || null,
    });
  };

  const handleSeekToTimestamp = (timestamp) => {
    if (playerRef.current && typeof timestamp === "number" && !Number.isNaN(timestamp)) {
      playerRef.current.seekTo(timestamp, "seconds");
      setCurrentTimestamp(timestamp);
    }
  };

  const handlePlayerProgress = (state) => {
    const playedSeconds = state?.playedSeconds;
    if (typeof playedSeconds === "number" && Number.isFinite(playedSeconds)) {
      setCurrentTimestamp(playedSeconds);
    }
  };

  const handlePlayerSeek = (seconds) => {
    if (typeof seconds === "number" && Number.isFinite(seconds)) {
      setCurrentTimestamp(seconds);
    }
  };

  const handleOrganizationChange = (event) => {
    const orgId = event.target.value || null;
    setActiveOrganizationId(orgId);

    if (orgId) {
      const collection = collections.find((item) => item.organization.id === orgId) ?? null;
      const firstContent = collection?.contents?.[0] ?? null;

      setActiveCollectionId(collection?.id ?? null);
      setActiveContentFilterId("");

      if (firstContent && firstContent.id !== selectedContent?.id) {
        router.push(`/dashboard?contentId=${firstContent.id}`);
      }
    } else {
      setActiveCollectionId(null);
      setActiveContentFilterId("");
    }
  };

  const handleCollectionChange = (event) => {
    const collectionId = event.target.value || null;
    setActiveCollectionId(collectionId);
    setActiveContentFilterId("");

    if (collectionId) {
      const collection = collections.find((item) => item.id === collectionId);
      const firstContent = collection?.contents?.[0] ?? null;

      if (firstContent && firstContent.id !== selectedContent?.id) {
        router.push(`/dashboard?contentId=${firstContent.id}`);
      }
    } else {
      setActiveContentFilterId("");
    }
  };

  const handleVideoSelect = (contentId) => {
    if (!contentId) return;
    router.push(`/dashboard?contentId=${contentId}`);
  };

  const handleAddActionSummaryField = () => {
    setActionSummaryFields((current) => [...current, { name: "", description: "" }]);
  };

  const handleRemoveActionSummaryField = (index) => {
    setActionSummaryFields((current) => current.filter((_, fieldIndex) => fieldIndex !== index));
  };

  const handleUpdateActionSummaryField = (index, key, value) => {
    setActionSummaryFields((current) =>
      current.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, [key]: value } : field,
      ),
    );
  };

  const handleResetActionSummaryFields = () => {
    setActionSummaryFields(DEFAULT_ACTION_SUMMARY_FIELDS.map((field) => ({ ...field })));
  };

  const handleFieldBuilderOpenChange = (nextOpen) => {
    setIsFieldBuilderOpen(nextOpen);
    if (!nextOpen) {
      setActionSummaryFields((current) => sanitizeActionSummaryFields(current));
    }
  };

  const handleSaveActionSummaryFields = () => {
    handleFieldBuilderOpenChange(false);
  };

  const handleSettingsOpenChange = (nextOpen) => {
    setIsActionSummarySettingsOpen(nextOpen);
    if (nextOpen) {
      setDraftActionSummaryConfig(actionSummaryConfig);
    } else {
      setDraftActionSummaryConfig(actionSummaryConfig);
    }
  };

  const handleResetActionSummarySettings = () => {
    setDraftActionSummaryConfig(buildDefaultActionSummaryConfigState());
  };
  const handleDeleteActionSummaryRun = async () => {
    if (!selectedContent?.id || !currentActionSummaryRun?.id) {
      return;
    }

    setActionSummaryError("");
    setActionSummaryMessage("");

    try {
      const response = await fetch(
        `/api/content/${selectedContent.id}/action-summary?runId=${encodeURIComponent(currentActionSummaryRun.id)}`,
        { method: "DELETE" },
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to delete action summary.");
      }

      const nextMeta =
        data?.actionSummary != null
          ? normalizeActionSummaryMetaState(data.actionSummary)
          : normalizeActionSummaryMetaState({
              ...actionSummaryMeta,
              runs: actionSummaryRuns.filter((run) => run.id !== currentActionSummaryRun.id),
            });

      setActionSummaryMeta(nextMeta);
      setSelectedActionSummaryId(
        nextMeta.activeRunId ??
          (nextMeta.runs.length
            ? nextMeta.runs[nextMeta.runs.length - 1].id
            : null),
      );
      setActionSummaryMessage("Action summary deleted.");
      router.refresh();
    } catch (error) {
      setActionSummaryError(
        error instanceof Error
          ? error.message || "Failed to delete action summary."
          : "Failed to delete action summary.",
      );
    }
  };

  const handleSaveActionSummarySettings = async () => {
    const sanitized = sanitizeActionSummaryConfigState(draftActionSummaryConfig);
    const previousConfig = actionSummaryConfig;

    setActionSummaryError("");
    setActionSummaryMessage("");
    setActionSummaryConfig(sanitized);
    setDraftActionSummaryConfig(sanitized);

    if (!selectedContent?.id) {
      setIsActionSummarySettingsOpen(false);
      return;
    }

    const configPayload = buildActionSummaryConfigPayload(sanitized);

    try {
      const response = await fetch(
        `/api/content/${selectedContent.id}/action-summary`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config: configPayload }),
        },
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to save action summary settings.");
      }

      const nextMeta =
        data?.actionSummary != null
          ? normalizeActionSummaryMetaState(data.actionSummary)
          : {
              ...actionSummaryMeta,
              config: data?.config ?? configPayload ?? actionSummaryMeta?.config ?? null,
            };
      const responseConfig = buildInitialActionSummaryConfigState(
        nextMeta?.config ?? configPayload ?? null,
        null,
      );
      setActionSummaryConfig(responseConfig);
      setDraftActionSummaryConfig(responseConfig);
      setActionSummaryMeta(nextMeta);
      setSelectedActionSummaryId(
        nextMeta.activeRunId ??
          (nextMeta.runs.length
            ? nextMeta.runs[nextMeta.runs.length - 1].id
            : selectedActionSummaryId ?? null),
      );
      setActionSummaryMessage("Action summary processing settings saved.");
      router.refresh();
      setIsActionSummarySettingsOpen(false);
    } catch (error) {
      setActionSummaryConfig(previousConfig);
      setDraftActionSummaryConfig(previousConfig);
      setActionSummaryError(
        error instanceof Error
          ? error.message || "Failed to save action summary settings."
          : "Failed to save action summary settings.",
      );
    }

  };

  const handleRunActionSummary = async () => {
    if (!selectedContent?.id) {
      return;
    }

    setActionSummaryError("");
    setActionSummaryMessage("");
    setIsRunningActionSummary(true);

    try {
      const sanitizedFields = sanitizeActionSummaryFields(actionSummaryFields);
      setActionSummaryFields(sanitizedFields);
      const template = buildTemplateFromFields(sanitizedFields);
      if (template.length === 0) {
        throw new Error("Add at least one field before running the action summary.");
      }

      const sanitizedConfigState = sanitizeActionSummaryConfigState(
        actionSummaryConfig,
      );
      setActionSummaryConfig(sanitizedConfigState);
      if (!isActionSummarySettingsOpen) {
        setDraftActionSummaryConfig(sanitizedConfigState);
      }
      const configPayload = buildActionSummaryConfigPayload(sanitizedConfigState);

      const response = await fetch(`/api/content/${selectedContent.id}/action-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisTemplate: template, config: configPayload }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? "Action summary failed");
      }

      const nextMeta =
        data?.actionSummary != null
          ? normalizeActionSummaryMetaState(data.actionSummary)
          : normalizeActionSummaryMetaState({
              ...actionSummaryMeta,
              analysisTemplate:
                data?.analysisTemplate ?? template ?? actionSummaryMeta?.analysisTemplate ?? null,
              config: data?.config ?? configPayload ?? actionSummaryMeta?.config ?? null,
              runs: [
                ...(actionSummaryMeta?.runs ?? []),
                {
                  id: data?.run?.id ?? generateActionSummaryRunId(),
                  analysis: data?.analysis ?? null,
                  analysisTemplate: data?.analysisTemplate ?? template ?? null,
                  analysisOutputPath: data?.analysisOutputPath ?? null,
                  storageArtifacts: data?.storageArtifacts ?? null,
                  searchUploads: data?.searchUploads ?? [],
                  config: data?.config ?? configPayload ?? actionSummaryMeta?.config ?? null,
                  filters:
                    data?.filters ??
                    actionSummaryMeta?.filters ?? {
                      organizationId: selectedContent.organization?.id ?? null,
                      collectionId: selectedContent.collection?.id ?? null,
                      contentId: selectedContent.id,
                    },
                  completedAt: new Date().toISOString(),
                },
              ],
            });

      const responseConfig = buildInitialActionSummaryConfigState(
        nextMeta?.config ?? configPayload ?? null,
        null,
      );
      setActionSummaryConfig(responseConfig);
      if (!isActionSummarySettingsOpen) {
        setDraftActionSummaryConfig(responseConfig);
      }

      setActionSummaryMeta(nextMeta);
      setSelectedActionSummaryId(
        nextMeta.activeRunId ??
          data?.run?.id ??
          (nextMeta.runs.length
            ? nextMeta.runs[nextMeta.runs.length - 1].id
            : selectedActionSummaryId ?? null),
      );

      setActionSummaryMessage("Action summary completed and search index updated.");
      setActionSummaryFields(
        mapTemplateToFields(nextMeta?.analysisTemplate ?? template),
      );
      router.refresh();
    } catch (error) {
      setActionSummaryError(error.message ?? "Action summary failed");
    } finally {
      setIsRunningActionSummary(false);
    }
  };

  const handleRunChapterAnalysis = async () => {
    if (!selectedContent?.id) {
      return;
    }

    setChapterAnalysisError("");
    setChapterAnalysisMessage("");
    setIsRunningChapterAnalysis(true);

    try {
      const response = await fetch(`/api/content/${selectedContent.id}/chapter-analysis`, {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? "Chapter analysis failed");
      }

      setChapterAnalysisMessage("Chapter analysis completed successfully.");
      setChapterAnalysisData((previous) => ({
        ...(previous ?? {}),
        lastRunAt: new Date().toISOString(),
        analysis: data?.analysis ?? previous?.analysis ?? null,
        analysisOutputPath: data?.analysisOutputPath ?? previous?.analysisOutputPath ?? null,
        storageArtifacts: data?.storageArtifacts ?? previous?.storageArtifacts ?? null,
        filters:
          data?.filters ??
          previous?.filters ?? {
            organizationId: selectedContent.organization?.id ?? null,
            collectionId: selectedContent.collection?.id ?? null,
            contentId: selectedContent.id,
          },
      }));
      router.refresh();
    } catch (error) {
      setChapterAnalysisError(error.message ?? "Chapter analysis failed");
    } finally {
      setIsRunningChapterAnalysis(false);
    }
  };

  if (!selectedContent) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-12">
        <Card>
          <CardHeader>
            <CardTitle>No videos yet</CardTitle>
            <CardDescription>
              Upload your first video to start generating insights for your organization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VideoUploadPanel collections={collections} defaultCollectionId={activeCollectionId} />
          </CardContent>
        </Card>
      </div>
    );
  }

  const actionSummaryArtifactsLabel = summarizeArtifacts(
    currentActionSummaryRun?.storageArtifacts,
  );
  const chapterAnalysisArtifactsLabel = summarizeArtifacts(chapterAnalysisData?.storageArtifacts);

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-6 py-8">
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader>
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    {selectedContent.organization?.name} • {selectedContent.collection?.name}
                  </p>
                  <CardTitle className="text-2xl font-semibold text-slate-900">
                    {selectedContent.title}
                  </CardTitle>
                  {selectedContent.description ? (
                    <CardDescription>{selectedContent.description}</CardDescription>
                  ) : null}
                </div>
                <div className="flex flex-col items-start gap-2 lg:items-end">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${formatStatus(selectedContent.actionSummaryStatus)}`}
                    >
                      Action summary: {(selectedContent.actionSummaryStatus ?? "UNKNOWN").toLowerCase()}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${formatStatus(selectedContent.chapterAnalysisStatus)}`}
                    >
                      Chapter analysis: {(selectedContent.chapterAnalysisStatus ?? "UNKNOWN").toLowerCase()}
                    </span>
                  </div>
                  {collectionOverviewHref || (canDeleteContent && selectedContent?.id) ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {collectionOverviewHref ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href={collectionOverviewHref}>Open collection overview</Link>
                        </Button>
                      ) : null}
                      {canDeleteContent && selectedContent?.id ? (
                        <Dialog
                          onOpenChange={(open) => {
                            setIsDeleteContentDialogOpen(open);
                            if (!open) {
                              setDeleteContentError("");
                            }
                          }}
                          open={isDeleteContentDialogOpen}
                        >
                          <DialogTrigger asChild>
                            <Button size="sm" variant="destructive">
                              Delete video
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Delete this video?</DialogTitle>
                              <DialogDescription>
                                This will permanently remove this video and delete its related analyses and search
                                documents. This action cannot be undone.
                              </DialogDescription>
                            </DialogHeader>
                            {deleteContentError ? (
                              <p className="text-sm text-red-600">{deleteContentError}</p>
                            ) : null}
                            <DialogFooter>
                              <DialogClose asChild>
                                <Button type="button" variant="outline" disabled={isDeletingContent}>
                                  Cancel
                                </Button>
                              </DialogClose>
                              <Button
                                disabled={isDeletingContent}
                                onClick={handleDeleteContent}
                                type="button"
                                variant="destructive"
                              >
                                {isDeletingContent ? "Deleting…" : "Delete video"}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="aspect-video overflow-hidden rounded-xl bg-black/80">
                {videoSource ? (
                  <ReactPlayer
                    controls
                    height="100%"
                    ref={(player) => {
                      playerRef.current = player ?? null;
                    }}
                    onProgress={handlePlayerProgress}
                    onSeek={handlePlayerSeek}
                    url={videoSource}
                    width="100%"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-200/80">
                    Video preview unavailable.
                  </div>
                )}
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-900/95 text-slate-100 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-wide">
                  <span>Live scene summary</span>
                  {currentTimestampLabel ? (
                    <span className="text-slate-300">{currentTimestampLabel}</span>
                  ) : null}
                </div>
                {currentActionSummaryEntry ? (
                  <div className="space-y-3 px-4 py-3">
                    <p className="text-sm font-medium leading-relaxed text-slate-100">
                      {currentActionSummaryEntry.summary ?? "No summary is available for this moment."}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
                      {currentActionSummaryEntry.startLabel ? (
                        <span>Start {currentActionSummaryEntry.startLabel}</span>
                      ) : null}
                      {currentActionSummaryEntry.endLabel ? (
                        <span>End {currentActionSummaryEntry.endLabel}</span>
                      ) : null}
                      {currentActionSummaryEntry.actions ? (
                        <span>Actions: {currentActionSummaryEntry.actions}</span>
                      ) : null}
                      {currentActionSummaryEntry.characters ? (
                        <span>People: {currentActionSummaryEntry.characters}</span>
                      ) : null}
                      {currentActionSummaryEntry.theme ? (
                        <span>Theme: {currentActionSummaryEntry.theme}</span>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-3 text-sm text-slate-300">
                    Run an action summary to generate an AI teleprompter that follows along with the video.
                  </div>
                )}
              </div>
              <div className="space-y-4 rounded-lg border border-slate-200 bg-white/60 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-700">AI search</p>
                  <p className="text-xs text-slate-500">
                    Search the indexed analyses, review the matches, and jump straight to the relevant timestamp.
                  </p>
                  <p className="text-xs text-slate-400">{searchFilterLabel}</p>
                </div>
                <form className="space-y-3" onSubmit={handleSearch}>
                  <Input
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="e.g. Show me when the team boards the aircraft"
                    value={searchQuery}
                  />
                  <div className="grid gap-3 lg:grid-cols-3">
                    <label className="text-xs font-semibold text-slate-600">
                      Organization
                      <select
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        onChange={handleOrganizationChange}
                        value={activeOrganizationId ?? ""}
                      >
                        <option value="">All organizations</option>
                        {organizationOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-slate-600">
                      Collection
                      <select
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        onChange={handleCollectionChange}
                        value={activeCollectionId ?? ""}
                      >
                        <option value="">All collections</option>
                        {collectionOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-slate-600">
                      Video
                      <select
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        onChange={(event) => setActiveContentFilterId(event.target.value)}
                        value={activeContentFilterId}
                      >
                        <option value="">All videos in selection</option>
                        {videoOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
                      <p className="font-medium text-slate-600">Scope</p>
                      <p className="mt-1 leading-relaxed">{searchFilterLabel}</p>
                    </div>
                    <Button disabled={isSearching || !searchQuery.trim()} type="submit">
                      {isSearching ? "Searching…" : "Search"}
                    </Button>
                  </div>
                </form>
                {searchError ? <p className="text-sm text-red-600">{searchError}</p> : null}
                <ScrollArea className="max-h-64 rounded-lg border border-slate-200 bg-white/70">
                  <div className="divide-y divide-slate-200">
                    {searchResults.length === 0 ? (
                      <p className="p-4 text-sm text-slate-500">Enter a query to view results.</p>
                    ) : (
                      searchResults.map((result, index) => {
                        const resultKey = String(result.id ?? result.segmentIndex ?? index);
                        const rawContent = getValueFromSource(result, "content");
                        let parsedContent = null;

                        if (rawContent && typeof rawContent === "string") {
                          const parsed = safeParseJson(rawContent);
                          if (parsed && typeof parsed === "object") {
                            parsedContent = parsed;
                          }
                        } else if (rawContent && typeof rawContent === "object") {
                          parsedContent = rawContent;
                        }

                        const getFieldValue = (fieldNames) => {
                          for (const fieldName of fieldNames) {
                            if (!fieldName) {
                              continue;
                            }

                            const direct = getValueFromSource(result, fieldName);
                            if (hasMeaningfulValue(direct)) {
                              return direct;
                            }

                            if (parsedContent) {
                              const nested = getValueFromSource(parsedContent, fieldName);
                              if (hasMeaningfulValue(nested)) {
                                return nested;
                              }
                            }
                          }

                          return null;
                        };

                        const summaryRaw = getFieldValue(["summary", "text"]);
                        let summaryText = "Relevant moment";
                        if (typeof summaryRaw === "string" && summaryRaw.trim()) {
                          summaryText = summaryRaw.trim();
                        } else if (summaryRaw != null) {
                          const normalizedSummary = normalizeDetailValue(summaryRaw);
                          if (normalizedSummary?.text) {
                            summaryText = normalizedSummary.text;
                          }
                        }

                        const summaryPreview = createWordPreview(summaryText) || summaryText;

                        const startValue = getFieldValue([
                          "startSeconds",
                          "startTimestamp",
                          "start_timestamp",
                          "startTime",
                          "start",
                          "startFrame",
                          "start_frame",
                        ]);
                        const endValue = getFieldValue([
                          "endSeconds",
                          "endTimestamp",
                          "end_timestamp",
                          "endTime",
                          "end",
                          "endFrame",
                          "end_frame",
                        ]);
                        const startSeconds = extractNumericSeconds(startValue);
                        const endSeconds = extractNumericSeconds(endValue);
                        const startLabel =
                          startSeconds != null
                            ? formatSecondsLabel(startSeconds)
                            : typeof startValue === "string"
                              ? startValue
                              : null;
                        const endLabel =
                          endSeconds != null
                            ? formatSecondsLabel(endSeconds)
                            : typeof endValue === "string"
                              ? endValue
                              : null;
                        const intervalLabel =
                          startLabel && endLabel
                            ? `${startLabel} – ${endLabel}`
                            : startLabel
                              ? `Starts at ${startLabel}`
                              : endLabel
                                ? `Ends at ${endLabel}`
                                : null;
                        const durationSeconds =
                          startSeconds != null && endSeconds != null
                            ? Math.max(endSeconds - startSeconds, 0)
                            : null;
                        const durationLabel =
                          durationSeconds != null ? formatSecondsLabel(durationSeconds) : null;
                        const timestamp = startSeconds ?? null;

                        const detailItems = [];
                        const addDetail = (label, value) => {
                          if (!label) {
                            return;
                          }

                          const normalized = normalizeDetailValue(value);
                          if (!normalized) {
                            return;
                          }

                          detailItems.push({
                            label,
                            text: normalized.text,
                            multiline: normalized.multiline,
                          });
                        };

                        if (intervalLabel) {
                          addDetail("Time interval", intervalLabel);
                        }

                        if (durationLabel) {
                          addDetail("Duration", durationLabel);
                        }

                        if (hasMeaningfulValue(summaryRaw)) {
                          addDetail("Summary", summaryRaw);
                        } else if (summaryText && summaryText !== "Relevant moment") {
                          addDetail("Summary", summaryText);
                        }

                        const actionsValue = getFieldValue(["actions"]);
                        if (hasMeaningfulValue(actionsValue)) {
                          addDetail("Actions", actionsValue);
                        }

                        const charactersValue = getFieldValue(["characters", "people"]);
                        if (hasMeaningfulValue(charactersValue)) {
                          addDetail("People", charactersValue);
                        }

                        const sceneThemeValue = getFieldValue(["sceneTheme", "scene_theme", "theme"]);
                        if (hasMeaningfulValue(sceneThemeValue)) {
                          addDetail("Scene theme", sceneThemeValue);
                        }

                        const sentimentValue = getFieldValue(["sentiment"]);
                        if (hasMeaningfulValue(sentimentValue)) {
                          addDetail("Sentiment", sentimentValue);
                        }

                        const keyObjectsValue = getFieldValue(["keyObjects", "key_objects"]);
                        if (hasMeaningfulValue(keyObjectsValue)) {
                          addDetail("Key objects", keyObjectsValue);
                        }

                        const customFieldsRaw = getFieldValue(["customFields"]);
                        if (customFieldsRaw) {
                          let normalizedCustomFields = customFieldsRaw;
                          if (typeof normalizedCustomFields === "string") {
                            const parsed = safeParseJson(normalizedCustomFields);
                            if (parsed && typeof parsed === "object") {
                              normalizedCustomFields = parsed;
                            }
                          }

                          if (Array.isArray(normalizedCustomFields)) {
                            normalizedCustomFields.forEach((entry) => {
                              if (!entry || typeof entry !== "object") {
                                return;
                              }

                              Object.entries(entry).forEach(([key, value]) => {
                                addDetail(formatFieldLabel(key) || key, value);
                              });
                            });
                          } else if (
                            normalizedCustomFields &&
                            typeof normalizedCustomFields === "object"
                          ) {
                            Object.entries(normalizedCustomFields).forEach(([key, value]) => {
                              addDetail(formatFieldLabel(key) || key, value);
                            });
                          }
                        }

                        return (
                          <div className="p-4" key={resultKey}>
                            <Collapsible
                              open={openSearchResultId === resultKey}
                              onOpenChange={(isOpen) =>
                                setOpenSearchResultId(isOpen ? resultKey : null)
                              }
                            >
                              <div className="flex items-start justify-between gap-3">
                                <CollapsibleTrigger className="group flex flex-1 items-start justify-between gap-3 rounded-md px-0 py-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white">
                                  <div className="space-y-1">
                                    <p className="text-sm font-medium text-slate-800">{summaryPreview}</p>
                                    {intervalLabel ? (
                                      <p className="text-xs text-slate-500">{intervalLabel}</p>
                                    ) : null}
                                  </div>
                                  <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                </CollapsibleTrigger>
                                {timestamp != null ? (
                                  <Button
                                    onClick={() => handleSeekToTimestamp(timestamp)}
                                    size="sm"
                                    type="button"
                                    variant="outline"
                                  >
                                    Jump
                                  </Button>
                                ) : null}
                              </div>
                              <CollapsibleContent className="space-y-3 pt-3">
                                {detailItems.length ? (
                                  <ScrollArea className="max-h-48 pr-2">
                                    <dl className="space-y-3 text-sm text-slate-600">
                                      {detailItems.map((item, detailIndex) => (
                                        <div className="space-y-1" key={`${resultKey}-detail-${detailIndex}`}>
                                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                            {item.label}
                                          </dt>
                                          <dd
                                            className={`text-sm text-slate-600${
                                              item.multiline ? " whitespace-pre-wrap" : ""
                                            }`}
                                          >
                                            {item.text}
                                          </dd>
                                        </div>
                                      ))}
                                    </dl>
                                  </ScrollArea>
                                ) : (
                                  <p className="text-sm text-slate-500">
                                    No additional details available for this result.
                                  </p>
                                )}
                              </CollapsibleContent>
                            </Collapsible>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>
              <div className="space-y-3 rounded-lg border border-slate-200 bg-white/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Transcription</p>
                    <p className="text-xs text-slate-500">{transcriptHeaderDescription}</p>
                  </div>
                  {transcriptUrl ? (
                    <Button asChild size="sm" variant="outline">
                      <a href={transcriptUrl} rel="noreferrer" target="_blank">
                        Download JSON
                      </a>
                    </Button>
                  ) : null}
                </div>
                {transcriptUrl ? (
                  isTranscriptLoading && !transcriptData ? (
                    <p className="text-sm text-slate-500">Loading transcription…</p>
                  ) : transcriptError ? (
                    <p className="text-sm text-red-600">
                      {transcriptError}
                      {" "}
                      <a className="underline" href={transcriptUrl} rel="noreferrer" target="_blank">
                        Open transcript
                      </a>
                      .
                    </p>
                  ) : transcriptSegmentCount > 0 ? (
                    <ScrollArea className="max-h-64 rounded-md border border-slate-200 bg-white/50">
                      <div className="divide-y divide-slate-200">
                        {transcriptSegments.map((segment, index) => (
                          <button
                            className="flex w-full items-start gap-3 p-3 text-left transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={segment.startSeconds == null}
                            key={segment.id ?? `segment-${index}`}
                            onClick={() =>
                              segment.startSeconds != null &&
                              handleSeekToTimestamp(segment.startSeconds)
                            }
                            type="button"
                          >
                            <div className="w-20 shrink-0 text-xs font-semibold text-slate-500">
                              {segment.startLabel ?? "—"}
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm text-slate-700">{segment.text}</p>
                              {segment.endLabel ? (
                                <p className="text-xs text-slate-400">Ends at {segment.endLabel}</p>
                              ) : null}
                            </div>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : transcriptText ? (
                    <p className="whitespace-pre-line rounded-md bg-slate-100/70 p-3 text-sm text-slate-700">
                      {transcriptText}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-500">
                      The transcript file is available to download above.
                    </p>
                  )
                ) : (
                  <p className="text-sm text-slate-500">
                    Run an action summary or chapter analysis to generate the audio transcript for this video.
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <p className="font-medium text-slate-700">Uploaded by</p>
                <p>{selectedContent.uploadedBy?.name ?? selectedContent.uploadedBy?.email ?? "Unknown"}</p>
                <p className="text-xs text-slate-400">
                  Created {new Date(selectedContent.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="space-y-4 rounded-lg border border-slate-200 p-4">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Run analyses</p>
                  <p className="text-xs text-slate-500">
                    Generate fresh insights on demand. Action summaries also populate the AI search index.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-700">Action summary</p>
                      <p className="text-xs text-slate-500">
                        Creates scene-level recaps and uploads them to AI search for semantic discovery.
                      </p>
                      <Dialog
                        onOpenChange={handleFieldBuilderOpenChange}
                        open={isFieldBuilderOpen}
                      >
                        <div className="space-y-2 rounded-md border border-slate-200 bg-white/60 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-600">Fields to capture</p>
                            <DialogTrigger asChild>
                              <Button size="sm" type="button" variant="outline">
                                Configure fields
                              </Button>
                            </DialogTrigger>
                          </div>
                          {actionSummaryFields.length ? (
                            <ul className="space-y-1 text-xs leading-snug text-slate-500">
                              {actionSummaryFields.map((field, index) => (
                                <li key={field.name || `field-${index}`}>
                                  <span className="font-medium text-slate-700">
                                    {field.name || `Field ${index + 1}`}
                                  </span>
                                  {field.description ? (
                                    <span className="block text-slate-500">{field.description}</span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-slate-500">No fields configured.</p>
                          )}
                        </div>
                        <DialogContent className="max-w-2xl max-h-[calc(100vh-2rem)] overflow-hidden p-0 sm:max-h-[85vh]">
                          <div className="flex max-h-[calc(100vh-2rem)] flex-col gap-4 overflow-hidden p-6 sm:max-h-[85vh]">
                            <DialogHeader className="shrink-0">
                              <DialogTitle>Configure action summary fields</DialogTitle>
                              <DialogDescription>
                                Define the JSON fields the analysis should populate for each scene. Field names become the keys
                                in the output.
                              </DialogDescription>
                            </DialogHeader>
                            <ScrollArea className="max-h-[55vh] pr-4">
                              <div className="space-y-3 pb-2">
                                {actionSummaryFields.map((field, index) => (
                                  <div
                                    className="space-y-3 rounded-md border border-slate-200 bg-white p-3"
                                    key={`${field.name || "field"}-${index}`}
                                  >
                                    <div className="flex items-start gap-3">
                                      <div className="flex-1 space-y-2">
                                        <label className="text-xs font-medium text-slate-600">
                                          Field name
                                          <Input
                                            className="mt-1"
                                            onChange={(event) =>
                                              handleUpdateActionSummaryField(index, "name", event.target.value)
                                            }
                                            placeholder="e.g. summary"
                                            value={field.name}
                                          />
                                        </label>
                                      </div>
                                      <Button
                                        className="mt-6"
                                        onClick={() => handleRemoveActionSummaryField(index)}
                                        size="icon"
                                        type="button"
                                        variant="ghost"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                        <span className="sr-only">Remove field</span>
                                      </Button>
                                    </div>
                                    <div className="space-y-2">
                                      <label className="text-xs font-medium text-slate-600">
                                        Field description
                                        <Textarea
                                          className="mt-1"
                                          onChange={(event) =>
                                            handleUpdateActionSummaryField(index, "description", event.target.value)
                                          }
                                          placeholder="Explain what the model should capture in this field."
                                          rows={3}
                                          value={field.description}
                                        />
                                      </label>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <Button
                                onClick={handleResetActionSummaryFields}
                                type="button"
                                variant="ghost"
                              >
                                Reset to default
                              </Button>
                              <Button
                                onClick={handleAddActionSummaryField}
                                type="button"
                                variant="secondary"
                              >
                                <Plus className="mr-2 h-4 w-4" /> Add field
                              </Button>
                            </div>
                            <DialogFooter className="shrink-0">
                              <Button onClick={handleSaveActionSummaryFields} type="button">
                                Save fields
                              </Button>
                            </DialogFooter>
                          </div>
                        </DialogContent>
                      </Dialog>
                      <Dialog
                        onOpenChange={handleSettingsOpenChange}
                        open={isActionSummarySettingsOpen}
                      >
                        <div className="space-y-2 rounded-md border border-slate-200 bg-white/60 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-600">Processing settings</p>
                            <DialogTrigger asChild>
                              <Button size="sm" type="button" variant="outline">
                                Configure settings
                              </Button>
                            </DialogTrigger>
                          </div>
                          {actionSummarySettingsSummary.length ? (
                            <ul className="space-y-1 text-xs leading-snug text-slate-500">
                              {actionSummarySettingsSummary.map((line) => (
                                <li key={line}>{line}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-slate-500">Using default settings.</p>
                          )}
                        </div>
                        <DialogContent className="max-w-2xl max-h-[calc(100vh-2rem)] overflow-hidden p-0 sm:max-h-[85vh]">
                          <div className="flex max-h-[calc(100vh-2rem)] flex-col gap-4 overflow-hidden p-6 sm:max-h-[85vh]">
                            <DialogHeader className="shrink-0">
                              <DialogTitle>Configure processing settings</DialogTitle>
                              <DialogDescription>
                                Control preprocessing, segmentation, and upload behavior before generating the action summary.
                              </DialogDescription>
                            </DialogHeader>
                            <ScrollArea className="max-h-[55vh] pr-4">
                              <div className="space-y-4 pb-2">
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <label className="text-xs font-medium text-slate-600">
                                    Segment length (seconds)
                                    <Input
                                      className="mt-1"
                                      min="1"
                                      onChange={(event) =>
                                        setDraftActionSummaryConfig((current) => ({
                                          ...current,
                                          segment_length: event.target.value,
                                        }))
                                      }
                                      type="number"
                                      value={draftActionSummaryConfig.segment_length}
                                    />
                                  </label>
                                  <label className="text-xs font-medium text-slate-600">
                                    Frames per second
                                    <Input
                                      className="mt-1"
                                      min="0"
                                      onChange={(event) =>
                                        setDraftActionSummaryConfig((current) => ({
                                          ...current,
                                          fps: event.target.value,
                                        }))
                                      }
                                      step="any"
                                      type="number"
                                      value={draftActionSummaryConfig.fps}
                                    />
                                  </label>
                                  <label className="text-xs font-medium text-slate-600">
                                    Max workers
                                    <Input
                                      className="mt-1"
                                      min="1"
                                      onChange={(event) =>
                                        setDraftActionSummaryConfig((current) => ({
                                          ...current,
                                          max_workers: event.target.value,
                                        }))
                                      }
                                      placeholder="Auto"
                                      type="number"
                                      value={draftActionSummaryConfig.max_workers}
                                    />
                                  </label>
                                  <label className="text-xs font-medium text-slate-600">
                                    Output directory
                                    <Input
                                      className="mt-1"
                                      onChange={(event) =>
                                        setDraftActionSummaryConfig((current) => ({
                                          ...current,
                                          output_directory: event.target.value,
                                        }))
                                      }
                                      placeholder="Auto"
                                      type="text"
                                      value={draftActionSummaryConfig.output_directory}
                                    />
                                  </label>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-medium text-slate-600">
                                    Analysis lens
                                    <Textarea
                                      className="mt-1"
                                      onChange={(event) =>
                                        setDraftActionSummaryConfig((current) => ({
                                          ...current,
                                          lens_prompt: event.target.value,
                                        }))
                                      }
                                      placeholder="Optional context or perspective to guide the analysis"
                                      rows={4}
                                      value={draftActionSummaryConfig.lens_prompt}
                                    />
                                  </label>
                                  <p className="text-xs text-slate-500">
                                    Leave blank to use the default lens. Provide custom instructions to
                                    tailor how the model describes each scene.
                                  </p>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {ACTION_SUMMARY_TOGGLE_FIELDS.map(({ key, label }) => (
                                    <label
                                      className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white p-3 text-xs font-medium text-slate-600"
                                      key={key}
                                    >
                                      <span>{label}</span>
                                      <input
                                        checked={Boolean(draftActionSummaryConfig[key])}
                                        className="h-4 w-4 rounded border-slate-300 text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-400"
                                        onChange={(event) =>
                                          setDraftActionSummaryConfig((current) => ({
                                            ...current,
                                            [key]: event.target.checked,
                                          }))
                                        }
                                        type="checkbox"
                                      />
                                    </label>
                                  ))}
                                </div>
                              </div>
                            </ScrollArea>
                            <DialogFooter className="shrink-0">
                              <Button
                                onClick={handleResetActionSummarySettings}
                                type="button"
                                variant="ghost"
                              >
                                Reset to defaults
                              </Button>
                              <Button onClick={handleSaveActionSummarySettings} type="button">
                                Save settings
                              </Button>
                            </DialogFooter>
                          </div>
                        </DialogContent>
                      </Dialog>
                      {actionSummaryMessage ? (
                        <p className="text-xs text-emerald-600">{actionSummaryMessage}</p>
                      ) : null}
                      {actionSummaryError ? (
                        <p className="text-xs text-red-600">{actionSummaryError}</p>
                      ) : null}
                    </div>
                    <Button disabled={isRunningActionSummary} onClick={handleRunActionSummary}>
                      {isRunningActionSummary ? "Running…" : "Run action summary"}
                    </Button>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-700">Chapter analysis</p>
                      <p className="text-xs text-slate-500">
                        Breaks the video into chapters so teams can quickly navigate long sessions.
                      </p>
                      {chapterAnalysisMessage ? (
                        <p className="text-xs text-emerald-600">{chapterAnalysisMessage}</p>
                      ) : null}
                      {chapterAnalysisError ? (
                        <p className="text-xs text-red-600">{chapterAnalysisError}</p>
                      ) : null}
                    </div>
                    <Button
                      disabled={isRunningChapterAnalysis}
                      onClick={handleRunChapterAnalysis}
                      variant="outline"
                    >
                      {isRunningChapterAnalysis ? "Running…" : "Run chapter analysis"}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <CardTitle>Action summary results</CardTitle>
                  <CardDescription>
                    Review the scene-level recaps generated for this video.
                  </CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  {hasActionSummaryRuns ? (
                    <label className="text-xs font-medium text-slate-600">
                      Select run
                      <select
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 sm:w-auto"
                        onChange={(event) =>
                          setSelectedActionSummaryId(
                            event.target.value ? event.target.value : null,
                          )
                        }
                        value={selectedActionSummaryId ?? ""}
                      >
                        {actionSummaryRuns.map((run, index) => (
                          <option key={run.id} value={run.id}>
                            {formatActionSummaryRunLabel(run, index)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {currentActionSummaryRun ? (
                    <Button
                      onClick={handleDeleteActionSummaryRun}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </Button>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-2">
                <div>
                  <p className="font-medium text-slate-700">Last run</p>
                  <p>
                    {formatDateTime(
                      currentActionSummaryRun?.completedAt ??
                        currentActionSummaryRun?.createdAt ??
                        actionSummaryMeta?.lastRunAt,
                    )}
                  </p>
                </div>
                {currentActionSummaryRun ? (
                  <div>
                    <p className="font-medium text-slate-700">Selected run</p>
                    <p>
                      {formatActionSummaryRunLabel(
                        currentActionSummaryRun,
                        currentActionSummaryIndex >= 0 ? currentActionSummaryIndex : 0,
                      )}
                    </p>
                  </div>
                ) : null}
                <div>
                  <p className="font-medium text-slate-700">Filters</p>
                  <p>{actionSummaryFiltersLabel}</p>
                </div>
                {currentActionSummaryRun?.analysisOutputPath ? (
                  <div className="sm:col-span-2">
                    <p className="font-medium text-slate-700">Analysis output</p>
                    <p className="break-words text-slate-600">
                      {currentActionSummaryRun.analysisOutputPath}
                    </p>
                  </div>
                ) : null}
                {currentActionSummaryRun?.searchUploads?.length ? (
                  <div>
                    <p className="font-medium text-slate-700">Search uploads</p>
                    <p>
                      {currentActionSummaryRun.searchUploads.length} document
                      {currentActionSummaryRun.searchUploads.length === 1 ? "" : "s"} indexed
                    </p>
                  </div>
                ) : null}
                {actionSummaryArtifactsLabel ? (
                  <div>
                    <p className="font-medium text-slate-700">Storage artifacts</p>
                    <p>{actionSummaryArtifactsLabel}</p>
                  </div>
                ) : null}
              </div>
              {actionSummaryEntries.length ? (
                <ScrollArea className="max-h-80 rounded-lg border border-slate-200">
                  <div className="divide-y divide-slate-200">
                    {actionSummaryEntries.map((entry, index) => (
                      <div className="space-y-2 p-4" key={entry.id ?? `action-${index}`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-slate-800">
                              {entry.summary ?? "Summary unavailable"}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                              {entry.start ? <span>Start: {entry.start}</span> : null}
                              {entry.end ? <span>End: {entry.end}</span> : null}
                              {entry.sentiment ? <span>Sentiment: {entry.sentiment}</span> : null}
                              {entry.theme ? <span>Theme: {entry.theme}</span> : null}
                            </div>
                            {entry.actions ? (
                              <p className="text-xs text-slate-500">
                                <span className="font-medium text-slate-600">Actions:</span> {entry.actions}
                              </p>
                            ) : null}
                            {entry.characters ? (
                              <p className="text-xs text-slate-500">
                                <span className="font-medium text-slate-600">Characters:</span> {entry.characters}
                              </p>
                            ) : null}
                            {entry.keyObjects ? (
                              <p className="text-xs text-slate-500">
                                <span className="font-medium text-slate-600">Key objects:</span> {entry.keyObjects}
                              </p>
                            ) : null}
                          </div>
                          {entry.startSeconds != null ? (
                            <Button
                              onClick={() => handleSeekToTimestamp(entry.startSeconds)}
                              size="sm"
                              variant="outline"
                            >
                              Jump
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : actionSummaryAnalysis ? (
                <pre className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  {JSON.stringify(actionSummaryAnalysis, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-slate-500">
                  Run the action summary to generate scene recaps for this video.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Chapter analysis results</CardTitle>
              <CardDescription>
                Explore the automatically generated chapters to navigate the video.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-2">
                <div>
                  <p className="font-medium text-slate-700">Last run</p>
                  <p>{formatDateTime(chapterAnalysisData?.lastRunAt)}</p>
                </div>
                <div>
                  <p className="font-medium text-slate-700">Filters</p>
                  <p>{chapterAnalysisFiltersLabel}</p>
                </div>
                {chapterAnalysisData?.analysisOutputPath ? (
                  <div className="sm:col-span-2">
                    <p className="font-medium text-slate-700">Analysis output</p>
                    <p className="break-words text-slate-600">{chapterAnalysisData.analysisOutputPath}</p>
                  </div>
                ) : null}
                {chapterAnalysisArtifactsLabel ? (
                  <div>
                    <p className="font-medium text-slate-700">Storage artifacts</p>
                    <p>{chapterAnalysisArtifactsLabel}</p>
                  </div>
                ) : null}
              </div>
              {chapterAnalysisEntries.length ? (
                <ScrollArea className="max-h-80 rounded-lg border border-slate-200">
                  <div className="divide-y divide-slate-200">
                    {chapterAnalysisEntries.map((entry, index) => (
                      <div className="space-y-2 p-4" key={entry.id ?? `chapter-${index}`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-slate-800">{entry.title}</p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                              {entry.start ? <span>Start: {entry.start}</span> : null}
                              {entry.end ? <span>End: {entry.end}</span> : null}
                            </div>
                            {entry.summary ? (
                              <p className="text-xs text-slate-500">{entry.summary}</p>
                            ) : null}
                          </div>
                          {entry.startSeconds != null ? (
                            <Button
                              onClick={() => handleSeekToTimestamp(entry.startSeconds)}
                              size="sm"
                              variant="outline"
                            >
                              Jump
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : chapterAnalysisAnalysis ? (
                <pre className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  {JSON.stringify(chapterAnalysisAnalysis, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-slate-500">
                  Run the chapter analysis to generate navigation points for this video.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <VideoUploadPanel
            canCreateCollections={canCreateCollections}
            canManageCollections={canManageCollections}
            collections={collections}
            defaultCollectionId={activeCollectionId}
            managementOrganizations={managementOrganizations}
          />
          <Card>
            <CardHeader>
              <CardTitle>Collection videos</CardTitle>
              <CardDescription>
                Browse the videos that you have access to in this collection.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {activeCollection?.contents?.length ? (
                  activeCollection.contents.map((content) => (
                    <button
                      className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition hover:border-slate-400 ${
                        content.id === selectedContent.id
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200"
                      }`}
                      key={content.id}
                      onClick={() => handleVideoSelect(content.id)}
                      type="button"
                    >
                      <span>{content.title}</span>
                      <span className="text-xs opacity-70">
                        {new Date(content.createdAt).toLocaleDateString()}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No videos uploaded for this collection yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        </div>
      </div>
      <ChatWidget
        actionSummaryContext={actionSummaryChatContext}
        chapterAnalysisContext={chapterAnalysisChatContext}
        selectedContent={selectedContent}
      />
    </>
  );
}
