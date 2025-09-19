"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function VideoUploadPanel({ collections, defaultCollectionId }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [collectionId, setCollectionId] = useState(defaultCollectionId ?? "");
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    setCollectionId(defaultCollectionId ?? "");
  }, [defaultCollectionId]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setFile(null);
    setSuccess("");
    setError("");
    setCollectionId(defaultCollectionId ?? "");
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

      setSuccess("Upload complete. Analyses will start automatically.");
      resetForm();
      router.refresh();
    } catch (uploadError) {
      setError(uploadError.message ?? "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Upload a video</CardTitle>
        <CardDescription>
          Files are securely stored and queued for AI-driven chapter analysis and action summaries.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-600" htmlFor="collection">
              Collection
            </label>
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
          </div>
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
        </CardContent>
        <CardFooter className="flex items-center justify-end">
          <Button disabled={isUploading} type="submit">
            {isUploading ? "Uploading…" : "Upload video"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
