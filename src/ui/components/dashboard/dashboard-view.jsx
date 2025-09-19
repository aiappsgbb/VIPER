"use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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

export default function DashboardView({ collections, selectedContent }) {
  const router = useRouter();
  const playerRef = useRef(null);
  const [activeCollectionId, setActiveCollectionId] = useState(
    selectedContent?.collection?.id ?? collections[0]?.id ?? null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState("");

  const activeCollection = useMemo(
    () => collections.find((collection) => collection.id === activeCollectionId) ?? null,
    [collections, activeCollectionId],
  );

  const activeOrganizationId = activeCollection?.organization?.id ?? selectedContent?.organization?.id ?? null;

  const organizationOptions = useMemo(() => {
    const map = new Map();
    collections.forEach((collection) => {
      map.set(collection.organization.id, collection.organization.name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [collections]);

  const collectionOptions = useMemo(() => {
    if (!activeOrganizationId) {
      return collections.map((collection) => ({
        id: collection.id,
        name: collection.name,
      }));
    }

    return collections
      .filter((collection) => collection.organization.id === activeOrganizationId)
      .map((collection) => ({ id: collection.id, name: collection.name }));
  }, [collections, activeOrganizationId]);

  const handleSearch = async (event) => {
    event.preventDefault();
    if (!searchQuery) {
      return;
    }

    setIsSearching(true);
    setSearchError("");

    try {
      const response = await fetch("/api/cog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery,
          organizationId: activeOrganizationId,
          collectionId: activeCollectionId,
          contentId: selectedContent?.id ?? null,
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

  const handleSeekToTimestamp = (timestamp) => {
    if (playerRef.current && typeof timestamp === "number" && !Number.isNaN(timestamp)) {
      playerRef.current.seekTo(timestamp, "seconds");
    }
  };

  const handleCollectionChange = (event) => {
    const collectionId = event.target.value || null;
    setActiveCollectionId(collectionId);

    if (collectionId) {
      const collection = collections.find((item) => item.id === collectionId);
      const firstContent = collection?.contents?.[0];

      if (firstContent && firstContent.id !== selectedContent?.id) {
        router.push(`/dashboard?contentId=${firstContent.id}`);
      }
    }
  };

  const handleVideoSelect = (contentId) => {
    if (!contentId) return;
    router.push(`/dashboard?contentId=${contentId}`);
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
            <VideoUploadPanel
              collections={collections}
              defaultCollectionId={activeCollectionId}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

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
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${formatStatus(selectedContent.actionSummaryStatus)}`}>
                    Action summary: {(selectedContent.actionSummaryStatus ?? "UNKNOWN").toLowerCase()}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${formatStatus(selectedContent.chapterAnalysisStatus)}`}>
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
                <div className="grid gap-3 lg:grid-cols-2">
                  <label className="text-sm font-medium text-slate-600">
                    Organization
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      onChange={(event) => {
                        const orgId = event.target.value || null;
                        if (orgId && orgId !== activeOrganizationId) {
                          const collectionForOrg = collections.find(
                            (collection) => collection.organization.id === orgId,
                          );
                          setActiveCollectionId(collectionForOrg?.id ?? null);
                        }
                      }}
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
                <div className="flex items-center justify-end gap-3">
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
                      const timestamp = parseFloat((result.start_timestamp ?? result.start_frame)?.toString().replace("s", ""));
                      return (
                        <div className="flex items-center justify-between gap-3 p-4" key={`${result.id ?? index}`}>
                          <div className="space-y-1 text-sm">
                            <p className="font-medium text-slate-800">{result.summary ?? result.text ?? "Relevant moment"}</p>
                            {result.start_timestamp ? (
                              <p className="text-xs text-slate-500">Starts at {result.start_timestamp}</p>
                            ) : null}
                          </div>
                          <Button onClick={() => handleSeekToTimestamp(timestamp)} size="sm" variant="outline">
                            Jump
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <VideoUploadPanel
            collections={collections}
            defaultCollectionId={activeCollectionId}
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
                      className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition hover:border-slate-400 ${content.id === selectedContent.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200"}`}
                      key={content.id}
                      onClick={() => handleVideoSelect(content.id)}
                      type="button"
                    >
                      <span>{content.title}</span>
                      <span className="text-xs opacity-70">{new Date(content.createdAt).toLocaleDateString()}</span>
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
