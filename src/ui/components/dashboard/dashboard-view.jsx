"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
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
import { Plus, Trash2 } from "lucide-react";
import VideoUploadPanel from "@/components/dashboard/video-upload-panel";

const ReactPlayer = dynamic(() => import("react-player"), { ssr: false });

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

  if (!value) {
    return null;
  }

  const match = value.toString().match(/\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const numericValue = Number.parseFloat(match[0]);
  return Number.isNaN(numericValue) ? null : numericValue;
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
    startSeconds: extractNumericSeconds(startValue),
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
}) {
  const router = useRouter();
  const playerRef = useRef(null);
  const [activeCollectionId, setActiveCollectionId] = useState(
    selectedContent?.collection?.id ?? collections[0]?.id ?? null,
  );
  const [activeOrganizationId, setActiveOrganizationId] = useState(
    selectedContent?.organization?.id ?? collections[0]?.organization?.id ?? null,
  );
  const [activeContentFilterId, setActiveContentFilterId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [collectionSearchQuery, setCollectionSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState("");
  const [isRunningActionSummary, setIsRunningActionSummary] = useState(false);
  const [isRunningChapterAnalysis, setIsRunningChapterAnalysis] = useState(false);
  const [actionSummaryMessage, setActionSummaryMessage] = useState("");
  const [actionSummaryError, setActionSummaryError] = useState("");
  const [chapterAnalysisMessage, setChapterAnalysisMessage] = useState("");
  const [chapterAnalysisError, setChapterAnalysisError] = useState("");
  const [actionSummaryData, setActionSummaryData] = useState(
    selectedContent?.processingMetadata?.cobra?.actionSummary ?? null,
  );
  const [actionSummaryFields, setActionSummaryFields] = useState(() =>
    mapTemplateToFields(
      selectedContent?.processingMetadata?.cobra?.actionSummary?.analysisTemplate ??
        null,
    ),
  );
  const [chapterAnalysisData, setChapterAnalysisData] = useState(
    selectedContent?.processingMetadata?.cobra?.chapterAnalysis ?? null,
  );
  const [isFieldBuilderOpen, setIsFieldBuilderOpen] = useState(false);

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

  const actionSummaryAnalysis = useMemo(
    () => safeParseJson(actionSummaryData?.analysis),
    [actionSummaryData],
  );
  const chapterAnalysisAnalysis = useMemo(
    () => safeParseJson(chapterAnalysisData?.analysis),
    [chapterAnalysisData],
  );

  useEffect(() => {
    setActionSummaryFields(
      mapTemplateToFields(actionSummaryData?.analysisTemplate ?? null),
    );
  }, [actionSummaryData?.analysisTemplate]);

  const actionSummaryEntries = useMemo(
    () => normalizeActionSummaryEntries(actionSummaryAnalysis),
    [actionSummaryAnalysis],
  );
  const chapterAnalysisEntries = useMemo(
    () => normalizeChapterAnalysisEntries(chapterAnalysisAnalysis),
    [chapterAnalysisAnalysis],
  );

  const activeCollection = useMemo(
    () => collections.find((collection) => collection.id === activeCollectionId) ?? null,
    [collections, activeCollectionId],
  );

  useEffect(() => {
    setActionSummaryMessage("");
    setActionSummaryError("");
    setChapterAnalysisMessage("");
    setChapterAnalysisError("");
    setIsRunningActionSummary(false);
    setIsRunningChapterAnalysis(false);
    setActionSummaryData(selectedContent?.processingMetadata?.cobra?.actionSummary ?? null);
    setChapterAnalysisData(selectedContent?.processingMetadata?.cobra?.chapterAnalysis ?? null);
    setActiveContentFilterId("");

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
    activeCollectionId,
    activeOrganizationId,
  ]);

  useEffect(() => {
    if (activeCollectionId) {
      const collection = collections.find((item) => item.id === activeCollectionId);
      if (collection?.organization?.id && collection.organization.id !== activeOrganizationId) {
        setActiveOrganizationId(collection.organization.id);
      }
    }
  }, [activeCollectionId, activeOrganizationId, collections]);

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
        actionSummaryData?.filters ?? null,
        organizationLookup,
        collectionLookup,
        contentLookup,
      ),
    [actionSummaryData?.filters, organizationLookup, collectionLookup, contentLookup],
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
    setCollectionSearchQuery(trimmedQuery);

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

  const handleQuickCollectionSearch = async (event) => {
    event.preventDefault();

    if (!activeCollectionId) {
      setSearchError("Select a collection before searching.");
      return;
    }

    setActiveContentFilterId("");

    await executeSearch({
      query: collectionSearchQuery,
      organizationId: activeOrganizationId || null,
      collectionId: activeCollectionId,
      contentId: null,
    });
  };

  const handleSeekToTimestamp = (timestamp) => {
    if (playerRef.current && typeof timestamp === "number" && !Number.isNaN(timestamp)) {
      playerRef.current.seekTo(timestamp, "seconds");
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

      const response = await fetch(`/api/content/${selectedContent.id}/action-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisTemplate: template }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? "Action summary failed");
      }

      setActionSummaryMessage("Action summary completed and search index updated.");
      setActionSummaryData((previous) => ({
        ...(previous ?? {}),
        lastRunAt: new Date().toISOString(),
        analysis: data?.analysis ?? previous?.analysis ?? null,
        analysisOutputPath: data?.analysisOutputPath ?? previous?.analysisOutputPath ?? null,
        storageArtifacts: data?.storageArtifacts ?? previous?.storageArtifacts ?? null,
        searchUploads: data?.searchUploads ?? previous?.searchUploads ?? [],
        analysisTemplate:
          data?.analysisTemplate ?? template ?? previous?.analysisTemplate ?? null,
        filters:
          data?.filters ??
          previous?.filters ?? {
            organizationId: selectedContent.organization?.id ?? null,
            collectionId: selectedContent.collection?.id ?? null,
            contentId: selectedContent.id,
          },
      }));
      setActionSummaryFields(mapTemplateToFields(data?.analysisTemplate ?? template));
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

  const actionSummaryArtifactsLabel = summarizeArtifacts(actionSummaryData?.storageArtifacts);
  const chapterAnalysisArtifactsLabel = summarizeArtifacts(chapterAnalysisData?.storageArtifacts);

  return (
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
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="aspect-video overflow-hidden rounded-xl bg-black/80">
                <ReactPlayer
                  controls
                  height="100%"
                  ref={(player) => {
                    playerRef.current = player;
                  }}
                  url={selectedContent.videoUrl}
                  width="100%"
                />
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
                        <DialogContent className="max-w-2xl space-y-4">
                          <DialogHeader>
                            <DialogTitle>Configure action summary fields</DialogTitle>
                            <DialogDescription>
                              Define the JSON fields the analysis should populate for each scene. Field names become the keys in
                              the output.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-3">
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
                          <DialogFooter>
                            <Button onClick={handleSaveActionSummaryFields} type="button">
                              Save fields
                            </Button>
                          </DialogFooter>
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
              <CardTitle>AI search</CardTitle>
              <CardDescription>
                Ask questions about this collection and jump to the most relevant moments.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form className="space-y-3" onSubmit={handleSearch}>
                <div className="grid gap-3 lg:grid-cols-3">
                  <label className="text-sm font-medium text-slate-600">
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
                  <label className="text-sm font-medium text-slate-600">
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
                  <label className="text-sm font-medium text-slate-600">
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
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600" htmlFor="search-query">
                    Search query
                  </label>
                  <Input
                    id="search-query"
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="e.g. Show moments with onboarding walkthroughs"
                    value={searchQuery}
                  />
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    <p className="font-medium text-slate-600">Filters applied</p>
                    <p className="mt-1 leading-relaxed">{searchFilterLabel}</p>
                  </div>
                  <Button disabled={isSearching || !searchQuery} type="submit">
                    {isSearching ? "Searching…" : "Search"}
                  </Button>
                </div>
              </form>
              {searchError ? <p className="text-sm text-red-600">{searchError}</p> : null}
              <ScrollArea className="max-h-72 rounded-lg border border-slate-200">
                <div className="divide-y divide-slate-200">
                  {searchResults.length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">Enter a query to view results.</p>
                  ) : (
                    searchResults.map((result, index) => {
                      const timestamp = extractNumericSeconds(
                        result.start_timestamp ?? result.start_frame ?? result.start,
                      );
                      return (
                        <div className="flex items-center justify-between gap-3 p-4" key={`${result.id ?? index}`}>
                          <div className="space-y-1 text-sm">
                            <p className="font-medium text-slate-800">
                              {result.summary ?? result.text ?? "Relevant moment"}
                            </p>
                            {result.start_timestamp || result.start ? (
                              <p className="text-xs text-slate-500">
                                Starts at {result.start_timestamp ?? result.start}
                              </p>
                            ) : null}
                          </div>
                          {timestamp != null ? (
                            <Button onClick={() => handleSeekToTimestamp(timestamp)} size="sm" variant="outline">
                              Jump
                            </Button>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Action summary results</CardTitle>
              <CardDescription>
                Review the scene-level recaps generated for this video.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-2">
                <div>
                  <p className="font-medium text-slate-700">Last run</p>
                  <p>{formatDateTime(actionSummaryData?.lastRunAt)}</p>
                </div>
                <div>
                  <p className="font-medium text-slate-700">Filters</p>
                  <p>{actionSummaryFiltersLabel}</p>
                </div>
                {actionSummaryData?.analysisOutputPath ? (
                  <div className="sm:col-span-2">
                    <p className="font-medium text-slate-700">Analysis output</p>
                    <p className="break-words text-slate-600">{actionSummaryData.analysisOutputPath}</p>
                  </div>
                ) : null}
                {actionSummaryData?.searchUploads?.length ? (
                  <div>
                    <p className="font-medium text-slate-700">Search uploads</p>
                    <p>
                      {actionSummaryData.searchUploads.length} document
                      {actionSummaryData.searchUploads.length === 1 ? "" : "s"} indexed
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
          <Card>
            <CardHeader>
              <CardTitle>Search this collection</CardTitle>
              <CardDescription>
                Ask a question to search every video in the selected collection. Results appear in the AI search panel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleQuickCollectionSearch}>
                <Input
                  onChange={(event) => setCollectionSearchQuery(event.target.value)}
                  placeholder="Ask about this collection"
                  value={collectionSearchQuery}
                />
                <Button
                  className="sm:self-start"
                  disabled={
                    isSearching ||
                    !collectionSearchQuery.trim() ||
                    !activeCollectionId
                  }
                  type="submit"
                >
                  {isSearching ? "Searching…" : "Search collection"}
                </Button>
              </form>
              {!activeCollectionId ? (
                <p className="text-xs text-slate-500">
                  Select a collection from the sidebar to search across its videos.
                </p>
              ) : null}
            </CardContent>
          </Card>
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
  );
}
