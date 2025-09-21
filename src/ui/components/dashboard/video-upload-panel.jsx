"use client";

import { useState, useEffect, useMemo } from "react";
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
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionDescription, setNewCollectionDescription] = useState("");
  const [newCollectionOrgId, setNewCollectionOrgId] = useState("");
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [collectionMessage, setCollectionMessage] = useState("");
  const [collectionMessageTone, setCollectionMessageTone] = useState("info");
  const [collectionError, setCollectionError] = useState("");

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
    setFile(null);
    setSuccess("");
    setError("");
    setCollectionId(defaultCollectionId ?? "");
  };

  const resetCollectionForm = () => {
    setNewCollectionName("");
    setNewCollectionDescription("");
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

    if (!file) {
      setError("Attach a video file to upload.");
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("collectionId", collectionId);
      formData.append("title", title || file.name);
      formData.append("description", description);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? "Upload failed");
      }

      resetForm();
      setSuccess("Upload complete. Use the analysis controls to start processing when you're ready.");
      router.refresh();
    } catch (uploadError) {
      setError(uploadError.message ?? "Upload failed");
    } finally {
      setIsUploading(false);
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
        <CardTitle className="text-lg">Upload a video</CardTitle>
        <CardDescription>
          Files are securely stored for your organization. Use the buttons on each video to run action summaries and chapter
          analysis when you're ready.
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
                  {collection.organization.name} • {collection.name}
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
            <label className="text-sm font-medium text-slate-600" htmlFor="file">
              Video file
            </label>
            <Input
              accept="video/mp4,video/mpeg,video/quicktime"
              id="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              type="file"
            />
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
            {isUploading ? "Uploading…" : "Upload video"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );

  if (asDialog) {
    const triggerNode =
      dialogTrigger ?? (
        <Button size="sm" type="button">
          Upload video
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
