"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

function formatFileSize(bytes) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return "";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const formatted = unitIndex === 0 ? Math.round(value) : value.toFixed(value >= 10 ? 0 : 1);
  return `${formatted} ${units[unitIndex]}`;
}

function isBrowserFile(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.name === "string" &&
    typeof value.size === "number" &&
    typeof value.arrayBuffer === "function"
  );
}

export default function VideoUploadPanel({
  collections,
  defaultCollectionId,
  managementOrganizations = [],
  canCreateCollections = false,
  canManageCollections = false,
  asDialog = false,
  dialogTrigger = null,
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [collectionId, setCollectionId] = useState(defaultCollectionId ?? "");
  const [files, setFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionDescription, setNewCollectionDescription] = useState("");
  const [newCollectionOrgId, setNewCollectionOrgId] = useState("");
  const [newCollectionVisibility, setNewCollectionVisibility] = useState("PRIVATE");
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [collectionMessage, setCollectionMessage] = useState("");
  const [collectionMessageTone, setCollectionMessageTone] = useState("info");
  const [collectionError, setCollectionError] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    setCollectionId(defaultCollectionId ?? "");
  }, [defaultCollectionId]);

  useEffect(() => {
    if (managementOrganizations.length > 0) {
      setNewCollectionOrgId((current) => current || managementOrganizations[0].id);
    } else {
      setNewCollectionOrgId("");
    }
  }, [managementOrganizations]);

  const collectionSummaries = useMemo(() => {
    const seen = new Map();
    collections.forEach((collection) => {
      if (!seen.has(collection.id)) {
        const videoCount =
          collection.contents?.length ?? collection._count?.contents ?? 0;

        seen.set(collection.id, {
          id: collection.id,
          name: collection.name,
          organizationName: collection.organization?.name ?? "Unknown organization",
          description: collection.description ?? "",
          videoCount,
          updatedAt: collection.updatedAt,
        });
      }
    });

    return Array.from(seen.values()).sort((a, b) => {
      const organizationComparison = a.organizationName.localeCompare(b.organizationName);
      if (organizationComparison !== 0) {
        return organizationComparison;
      }
      return a.name.localeCompare(b.name);
    });
  }, [collections]);

  const organizationOptions = useMemo(
    () =>
      managementOrganizations.map((organization) => ({
        id: organization.id,
        name: organization.name,
      })),
    [managementOrganizations],
  );

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setFiles([]);
    setSuccess("");
    setError("");
    setCollectionId(defaultCollectionId ?? "");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const resetCollectionForm = () => {
    setNewCollectionName("");
    setNewCollectionDescription("");
    setNewCollectionVisibility("PRIVATE");
    setCollectionError("");
  };

  const handleUploadDialogChange = (open) => {
    if (!open && isUploading) {
      return;
    }

    setIsUploadDialogOpen(open);

    if (open) {
      setError("");
      setSuccess("");
      setCollectionMessage("");
      setCollectionMessageTone("info");
      setCollectionError("");
    } else {
      resetForm();
      resetCollectionForm();
      setCollectionMessage("");
      setCollectionMessageTone("info");
      setIsCreateDialogOpen(false);
      setIsCreatingCollection(false);
      setCollectionError("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!collectionId) {
      setError("Select a collection for the upload.");
      return;
    }

    const filesToUpload = Array.isArray(files)
      ? files.filter((item) => isBrowserFile(item))
      : [];

    if (!filesToUpload.length) {
      setError("Attach at least one video file to upload.");
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      const trimmedTitle = (title || "").trim();
      const trimmedDescription = (description || "").trim();

      formData.append("collectionId", collectionId);
      formData.append("title", trimmedTitle);
      formData.append("description", trimmedDescription);
      const metadataEntries = filesToUpload.map((currentFile, index) => {
        const baseTitle = trimmedTitle.length
          ? trimmedTitle
          : currentFile.name || `Upload ${index + 1}`;

        const resolvedTitle =
          filesToUpload.length === 1 || !trimmedTitle.length
            ? baseTitle
            : `${trimmedTitle} (${index + 1})`;

        return {
          title: resolvedTitle,
          description: trimmedDescription,
        };
      });

      filesToUpload.forEach((currentFile) => {
        formData.append("files", currentFile);
      });

      if (metadataEntries.length) {
        formData.append("metadata", JSON.stringify(metadataEntries));
      }

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? "Upload failed");
      }

      const normalizedResults = Array.isArray(data.results) ? data.results : [];

      if (!normalizedResults.length && Array.isArray(data.contents)) {
        data.contents.forEach((content, index) => {
          normalizedResults.push({
            index,
            status: "succeeded",
            fileName:
              (filesToUpload[index] && filesToUpload[index].name) ||
              content?.title ||
              `Upload ${index + 1}`,
            content,
            error: null,
            errorDetails: null,
          });
        });
      }

      if (!normalizedResults.length && data.content) {
        normalizedResults.push({
          index: 0,
          status: "succeeded",
          fileName:
            (filesToUpload[0] && filesToUpload[0].name) || data.content?.title || "Upload 1",
          content: data.content,
          error: null,
          errorDetails: null,
        });
      }

      if (!normalizedResults.length && Array.isArray(data.errors)) {
        data.errors.forEach((errorEntry) => {
          normalizedResults.push({
            index: errorEntry?.index ?? 0,
            status: "failed",
            fileName: errorEntry?.fileName ?? null,
            content: null,
            error: errorEntry?.error ?? data?.error ?? "Upload failed",
            errorDetails: errorEntry?.errorDetails ?? null,
            httpStatus: errorEntry?.httpStatus ?? response.status ?? 500,
          });
        });
      }

      if (!normalizedResults.length) {
        resetForm();
        setSuccess(
          filesToUpload.length === 1
            ? "Upload complete. Use the analysis controls to start processing when you're ready."
            : "Uploaded all videos. Use the analysis controls to start processing when you're ready.",
        );
        router.refresh();
        return;
      }

      const successes = normalizedResults.filter((result) => result?.status === "succeeded");
      const failures = normalizedResults.filter((result) => result?.status === "failed");

      const totalUploads = filesToUpload.length;
      const successCount = successes.length;
      const failureCount = failures.length;

      if (successCount) {
        if (successCount === totalUploads) {
          resetForm();
          setSuccess(
            successCount === 1
              ? "Upload complete. Use the analysis controls to start processing when you're ready."
              : "Uploaded all videos. Use the analysis controls to start processing when you're ready.",
          );
        } else {
          setSuccess(
            `Uploaded ${successCount} of ${totalUploads} videos successfully. You can retry the remaining files after resolving the issues below.`,
          );
        }

        router.refresh();
      }

      if (failureCount) {
        const failedIndexes = new Set();
        const failureMessages = failures.map((failure) => {
          const failureIndex =
            typeof failure?.index === "number" && failure.index >= 0
              ? failure.index
              : null;

          if (failureIndex !== null) {
            failedIndexes.add(failureIndex);
          }

          const fallbackName =
            failure?.fileName ||
            (failureIndex !== null && filesToUpload[failureIndex]
              ? filesToUpload[failureIndex].name
              : null) ||
            "Video";
          const reason = failure?.error || data?.error || "Upload failed";
          return `${fallbackName}: ${reason}`;
        });

        setError(
          `Failed to upload ${failureCount === 1 ? "1 video" : `${failureCount} videos`}. ${
            failureMessages.join(" ")
          }`.trim(),
        );

        if (failedIndexes.size) {
          setFiles(filesToUpload.filter((_, index) => failedIndexes.has(index)));
        } else {
          setFiles([]);
        }

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } else {
        setError("");
      }
    } catch (uploadError) {
      setError(uploadError.message ?? "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (event) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    const normalizedFiles = selectedFiles.filter((item) => isBrowserFile(item));

    setFiles(normalizedFiles);
    setError("");
    setSuccess("");

    const target = event.target;
    if (target && typeof target.value === "string") {
      target.value = "";
    }
  };

  const handleRemoveFile = (indexToRemove) => {
    setFiles((current) => current.filter((_, index) => index !== indexToRemove));
    setError("");
    setSuccess("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCreateCollection = async (event) => {
    event.preventDefault();
    setCollectionError("");
    setCollectionMessage("");

    if (!newCollectionOrgId) {
      setCollectionError("Choose an organization for the new collection.");
      return;
    }

    if (!newCollectionName.trim()) {
      setCollectionError("Enter a collection name.");
      return;
    }

    setIsCreatingCollection(true);

    try {
      const response = await fetch("/api/admin/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCollectionName.trim(),
          description: newCollectionDescription.trim() || null,
          organizationId: newCollectionOrgId,
          visibility: newCollectionVisibility,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to create collection");
      }

      const createdCollectionId = data?.collection?.id ?? "";
      setCollectionMessage("Collection created. It may take a moment to appear in the list.");
      setCollectionMessageTone("success");
      resetCollectionForm();
      setIsCreateDialogOpen(false);

      if (createdCollectionId) {
        setCollectionId(createdCollectionId);
      }

      router.refresh();
    } catch (createError) {
      setCollectionError(createError.message ?? "Unable to create collection");
    } finally {
      setIsCreatingCollection(false);
    }
  };

  const renderCollectionSupport = canCreateCollections && !organizationOptions.length;

  const uploadContent = (
    <Card className={asDialog ? "border-none shadow-none" : undefined}>
      <CardHeader>
        <CardTitle className="text-lg">Upload videos</CardTitle>
        <CardDescription>
          Upload one or many videos at a time. Files are securely stored for your organization. Use the buttons on each video to
          run action summaries and chapter analysis when you're ready.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-slate-600" htmlFor="collection">
                Collection
              </label>
              {canCreateCollections && organizationOptions.length ? (
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" type="button" variant="outline">
                      New collection
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create a collection</DialogTitle>
                      <DialogDescription>
                        Organize related videos within an organization. Collections are available to collaborators you invite.
                      </DialogDescription>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={handleCreateCollection}>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600" htmlFor="new-collection-organization">
                          Organization
                        </label>
                        <select
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                          id="new-collection-organization"
                          onChange={(event) => setNewCollectionOrgId(event.target.value)}
                          value={newCollectionOrgId}
                        >
                          <option value="">Select an organization</option>
                          {organizationOptions.map((organization) => (
                            <option key={organization.id} value={organization.id}>
                              {organization.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600" htmlFor="new-collection-name">
                          Collection name
                        </label>
                        <Input
                          id="new-collection-name"
                          onChange={(event) => setNewCollectionName(event.target.value)}
                          placeholder="Product launch briefings"
                          value={newCollectionName}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600" htmlFor="new-collection-visibility">
                          Visibility
                        </label>
                        <select
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                          id="new-collection-visibility"
                          onChange={(event) => setNewCollectionVisibility(event.target.value)}
                          value={newCollectionVisibility}
                        >
                          <option value="PRIVATE">Private (only invited members)</option>
                          <option value="PUBLIC">Public (anyone in the organization)</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600" htmlFor="new-collection-description">
                          Description (optional)
                        </label>
                        <Textarea
                          id="new-collection-description"
                          onChange={(event) => setNewCollectionDescription(event.target.value)}
                          placeholder="Provide context so collaborators know when to use this collection."
                          value={newCollectionDescription}
                        />
                      </div>
                      {collectionError ? <p className="text-sm text-red-600">{collectionError}</p> : null}
                      <DialogFooter className="flex items-center justify-end gap-2">
                        <Button onClick={resetCollectionForm} type="button" variant="ghost">
                          Clear
                        </Button>
                        <Button disabled={isCreatingCollection} type="submit">
                          {isCreatingCollection ? "Creating…" : "Create collection"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              ) : null}
            </div>
            <select
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
              id="collection"
              onChange={(event) => setCollectionId(event.target.value)}
              value={collectionId}
            >
              <option value="">Select a collection</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.organization.name} • {collection.name} (
                  {collection.visibility === "PUBLIC" ? "Public" : "Private"})
                </option>
              ))}
            </select>
            {renderCollectionSupport ? (
              <p className="text-xs text-slate-500">
                You do not manage any organizations yet. Create one from the admin area to start adding collections.
              </p>
            ) : null}
          </div>
          {collectionMessage ? (
            <div
              className={`rounded-md border px-3 py-2 text-xs ${
                collectionMessageTone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              {collectionMessage}
            </div>
          ) : null}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-600" htmlFor="title">
              Title
            </label>
            <Input
              id="title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Board meeting recording"
              value={title}
            />
            {files.length > 1 ? (
              <p className="text-xs text-slate-500">
                The title is applied to each video with a numeric suffix. Leave it blank to use each file name.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-600" htmlFor="description">
              Description
            </label>
            <Textarea
              id="description"
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Add context so collaborators know what to expect."
              value={description}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-600" htmlFor="files">
              Video files
            </label>
            <Input
              accept="video/mp4,video/mpeg,video/quicktime"
              id="files"
              multiple
              onChange={handleFileChange}
              ref={fileInputRef}
              type="file"
            />
            {files.length ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-medium text-slate-600">Selected files</p>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">
                  {files.map((selectedFile, index) => {
                    const key = `${selectedFile.name}-${selectedFile.lastModified ?? "unknown"}-${index}`;
                    const sizeLabel = formatFileSize(selectedFile.size);

                    return (
                      <li className="flex items-center justify-between gap-2" key={key}>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-700">{selectedFile.name}</p>
                          <p className="text-xs text-slate-500">{sizeLabel || "Unknown size"}</p>
                        </div>
                        <Button
                          disabled={isUploading}
                          onClick={() => handleRemoveFile(index)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Remove
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
          {canManageCollections && collectionSummaries.length ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-600">Your collections</p>
              <ScrollArea className="max-h-40 rounded-md border border-slate-200">
                <ul className="divide-y divide-slate-200">
                  {collectionSummaries.map((summary) => (
                    <li className="px-3 py-2 text-sm" key={summary.id}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-800">{summary.name}</p>
                          <p className="text-xs text-slate-500">{summary.organizationName}</p>
                          {summary.description ? (
                            <p className="mt-1 text-xs text-slate-500">{summary.description}</p>
                          ) : null}
                        </div>
                        <span className="whitespace-nowrap text-xs text-slate-400">
                          {summary.videoCount} video{summary.videoCount === 1 ? "" : "s"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          ) : null}
        </CardContent>
        <CardFooter className="flex items-center justify-end">
          <Button disabled={isUploading} type="submit">
            {isUploading ? "Uploading…" : "Upload videos"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );

  if (asDialog) {
    const triggerNode =
      dialogTrigger ?? (
        <Button size="sm" type="button">
          Upload videos
        </Button>
      );

    return (
      <Dialog onOpenChange={handleUploadDialogChange} open={isUploadDialogOpen}>
        <DialogTrigger asChild>{triggerNode}</DialogTrigger>
        <DialogContent className="max-w-3xl p-0">
          {uploadContent}
        </DialogContent>
      </Dialog>
    );
  }

  return uploadContent;
}
