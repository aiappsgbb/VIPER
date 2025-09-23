"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import ChatWidget from "@/components/chat/chat-widget";

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

function formatDateTime(value) {
  if (!value) {
    return "Unknown";
  }

  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString();
  } catch (error) {
    return value;
  }
}

function formatTimestamp(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
    return null;
  }

  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const parts = [];
  if (hours > 0) {
    parts.push(hours.toString());
    parts.push(minutes.toString().padStart(2, "0"));
  } else {
    parts.push(minutes.toString());
  }
  parts.push(secs.toString().padStart(2, "0"));
  return parts.join(":");
}

function parseSearchResult(result, index) {
  const key = String(result?.id ?? result?.segmentIndex ?? index);
  let summary = "";
  let details = "";
  let contentId = result?.contentId ?? result?.content_id ?? null;
  let startSeconds = null;
  const score = typeof result?.score === "number" ? result.score : result?.["@search.score"] ?? null;

  let rawContent = result?.content ?? null;
  if (typeof rawContent === "string") {
    try {
      const parsed = JSON.parse(rawContent);
      if (parsed && typeof parsed === "object") {
        rawContent = parsed;
      }
    } catch (error) {
      details = rawContent;
      rawContent = null;
    }
  }

  if (typeof result?.summary === "string" && result.summary.trim()) {
    summary = result.summary.trim();
  } else if (typeof result?.text === "string" && result.text.trim()) {
    summary = result.text.trim();
  }

  if (!summary && rawContent && typeof rawContent === "object") {
    const candidate = rawContent.summary ?? rawContent.text ?? rawContent.title;
    if (typeof candidate === "string" && candidate.trim()) {
      summary = candidate.trim();
    }
  }

  if (!summary) {
    summary = "Relevant moment";
  }

  if (!details) {
    if (typeof result?.details === "string" && result.details.trim()) {
      details = result.details.trim();
    } else if (rawContent && typeof rawContent === "object") {
      const candidate = rawContent.description ?? rawContent.details;
      if (typeof candidate === "string" && candidate.trim()) {
        details = candidate.trim();
      }
    }
  }

  if (!contentId && rawContent && typeof rawContent === "object") {
    contentId =
      rawContent.contentId ??
      rawContent.content_id ??
      rawContent.content?.id ??
      rawContent.id ??
      null;
  }

  const numericStart =
    result?.startSeconds ??
    result?.start ??
    (rawContent && typeof rawContent === "object"
      ? rawContent.startSeconds ?? rawContent.start ?? null
      : null);

  if (numericStart != null) {
    const parsed = Number(numericStart);
    if (!Number.isNaN(parsed)) {
      startSeconds = parsed;
    }
  }

  return {
    id: key,
    summary,
    details,
    contentId,
    startSeconds,
    score: typeof score === "number" ? score : null,
  };
}

export default function CollectionOverview({ collection, canDeleteCollection = false }) {
  const router = useRouter();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);

  const videoCount = collection?.contents?.length ?? 0;
  const firstContentId = collection?.contents?.[0]?.id ?? null;

  const normalizedResults = useMemo(
    () => searchResults.map((result, index) => parseSearchResult(result, index)),
    [searchResults],
  );

  const chatSelectedContent = useMemo(
    () => ({
      id: null,
      title: `${collection.name} collection`,
      organization: {
        id: collection.organization?.id ?? null,
        name: collection.organization?.name ?? null,
      },
      collection: {
        id: collection.id,
        name: collection.name,
      },
    }),
    [collection.id, collection.name, collection.organization?.id, collection.organization?.name],
  );

  const handleDeleteCollection = async () => {
    setDeleteError("");
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/collections/${collection.id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to delete this collection.");
      }

      setIsDeleteDialogOpen(false);
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Failed to delete this collection.",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSearch = async (event) => {
    event.preventDefault();

    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      setSearchError("Enter a question to search this collection.");
      return;
    }

    setIsSearching(true);
    setSearchError("");
    setHasSearched(true);

    try {
      const response = await fetch("/api/cog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: trimmedQuery,
          organizationId: collection.organization?.id ?? null,
          collectionId: collection.id,
          contentId: null,
        }),
      });

      if (!response.ok) {
        throw new Error("Search request failed");
      }

      const data = await response.json();
      setSearchResults(Array.isArray(data?.message) ? data.message : []);
    } catch (error) {
      setSearchError(
        "We couldn't complete the search. Try adjusting your question and trying again.",
      );
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {collection.organization?.name ?? "Unassigned organization"}
                </p>
                <CardTitle className="text-3xl font-semibold text-slate-900">
                  {collection.name}
                </CardTitle>
                {collection.description ? (
                  <CardDescription>{collection.description}</CardDescription>
                ) : null}
                <div className="text-sm text-slate-500">
                  <p>Created {formatDateTime(collection.createdAt)}</p>
                  <p>Last updated {formatDateTime(collection.updatedAt)}</p>
                </div>
              </div>
              <div className="flex flex-col items-start gap-3 lg:items-end">
                <div className="rounded-full bg-slate-100 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {videoCount} video{videoCount === 1 ? "" : "s"}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {firstContentId ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/dashboard?contentId=${firstContentId}`}>
                        Open latest video
                      </Link>
                    </Button>
                  ) : null}
                  {canDeleteCollection ? (
                    <Dialog
                      onOpenChange={(open) => {
                        setIsDeleteDialogOpen(open);
                        if (!open) {
                          setDeleteError("");
                        }
                      }}
                      open={isDeleteDialogOpen}
                    >
                      <DialogTrigger asChild>
                        <Button size="sm" variant="destructive">
                          Delete collection
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Delete this collection?</DialogTitle>
                          <DialogDescription>
                            This will permanently remove the collection, its videos, and all associated search
                            documents. This action cannot be undone.
                          </DialogDescription>
                        </DialogHeader>
                        {deleteError ? (
                          <p className="text-sm text-red-600">{deleteError}</p>
                        ) : null}
                        <DialogFooter>
                          <DialogClose asChild>
                            <Button type="button" variant="outline" disabled={isDeleting}>
                              Cancel
                            </Button>
                          </DialogClose>
                          <Button
                            disabled={isDeleting}
                            onClick={handleDeleteCollection}
                            type="button"
                            variant="destructive"
                          >
                            {isDeleting ? "Deleting…" : "Delete collection"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  ) : null}
                </div>
              </div>
            </CardHeader>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <Card>
              <CardHeader>
                <CardTitle>Search this collection</CardTitle>
                <CardDescription>
                  Ask a question to look across every video in the collection. Results provide quick links back to the
                  source footage.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSearch}>
                  <Input
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="e.g. When does the briefing begin?"
                    value={searchQuery}
                  />
                  <Button className="sm:self-start" disabled={isSearching} type="submit">
                    {isSearching ? "Searching…" : "Search"}
                  </Button>
                </form>
                {searchError ? <p className="text-sm text-red-600">{searchError}</p> : null}
                <ScrollArea className="max-h-[60vh] rounded-lg border border-slate-200">
                  <div className="divide-y divide-slate-200">
                    {!hasSearched ? (
                      <p className="p-4 text-sm text-slate-500">
                        Enter a question to explore the analyses from this collection.
                      </p>
                    ) : normalizedResults.length === 0 ? (
                      <p className="p-4 text-sm text-slate-500">No matches found yet. Try another question.</p>
                    ) : (
                      normalizedResults.map((result) => {
                        const startParam =
                          typeof result.startSeconds === "number" &&
                          Number.isFinite(result.startSeconds)
                            ? (Math.round(Math.max(0, result.startSeconds) * 1000) / 1000).toString()
                            : null;
                        const query = new URLSearchParams();
                        if (result.contentId) {
                          query.set("contentId", result.contentId);
                        }
                        if (startParam) {
                          query.set("start", startParam);
                        }
                        const href = query.toString() ? `/dashboard?${query.toString()}` : "/dashboard";
                        const buttonLabel = startParam ? "Open & jump" : "Open video";

                        return (
                          <div className="space-y-3 p-4" key={result.id}>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="space-y-2">
                                <p className="font-medium text-slate-800">{result.summary}</p>
                                {result.details ? (
                                  <p className="text-sm text-slate-600">{result.details}</p>
                                ) : null}
                                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                  {result.startSeconds != null ? (
                                    <span>Starts at {formatTimestamp(result.startSeconds)}</span>
                                  ) : null}
                                  {typeof result.score === "number" ? (
                                    <span>Score: {result.score.toFixed(2)}</span>
                                  ) : null}
                                </div>
                              </div>
                              {result.contentId ? (
                                <Button asChild size="sm" variant="outline">
                                  <Link href={href}>{buttonLabel}</Link>
                                </Button>
                              ) : null}
                            </div>
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
                <CardTitle>Collection details</CardTitle>
                <CardDescription>
                  High-level information about the videos and ownership of this collection.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600">
                <div>
                  <p className="font-medium text-slate-700">Organization</p>
                  <p>{collection.organization?.name ?? "Unassigned"}</p>
                </div>
                <div>
                  <p className="font-medium text-slate-700">Visibility</p>
                  <p>
                    {collection.visibility === "PUBLIC"
                      ? "Public to everyone in the organization"
                      : "Private to invited collaborators"}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-slate-700">Videos</p>
                  <p>{videoCount ? `${videoCount} available` : "No videos uploaded yet"}</p>
                </div>
                <div>
                  <p className="font-medium text-slate-700">Latest update</p>
                  <p>{formatDateTime(collection.updatedAt)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">Videos in this collection</h2>
              <p className="text-sm text-slate-500">Select a video to jump back into the full dashboard view.</p>
            </div>
            {videoCount === 0 ? (
              <Card>
                <CardContent className="p-6 text-sm text-slate-600">
                  No videos have been uploaded for this collection yet.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {collection.contents.map((content) => (
                  <Card className="flex h-full flex-col" key={content.id}>
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-lg font-semibold text-slate-900">
                        {content.title}
                      </CardTitle>
                      <CardDescription>
                        Uploaded {formatDateTime(content.createdAt)}
                        {content.uploadedBy?.name || content.uploadedBy?.email
                          ? ` • by ${content.uploadedBy?.name ?? content.uploadedBy?.email}`
                          : ""}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-4">
                      {content.description ? (
                        <p className="text-sm text-slate-600">{content.description}</p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={`rounded-full px-3 py-1 font-medium ${formatStatus(content.actionSummaryStatus)}`}
                        >
                          Action summary: {(content.actionSummaryStatus ?? "UNKNOWN").toLowerCase()}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 font-medium ${formatStatus(content.chapterAnalysisStatus)}`}
                        >
                          Chapter analysis: {(content.chapterAnalysisStatus ?? "UNKNOWN").toLowerCase()}
                        </span>
                      </div>
                      <div className="mt-auto">
                        <Button asChild variant="outline">
                          <Link href={`/dashboard?contentId=${content.id}`}>Open in dashboard</Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <ChatWidget
        actionSummaryContext={[]}
        chapterAnalysisContext={[]}
        defaultScope="collection"
        selectedContent={chatSelectedContent}
      />
    </>
  );
}
