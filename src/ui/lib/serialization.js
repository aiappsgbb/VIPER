import { getVideoPlaybackUrl } from "@/lib/azure";

export async function serializeContent(content) {
  let playbackUrl = null;
  try {
    playbackUrl = await getVideoPlaybackUrl(content.videoUrl);
  } catch (error) {
    console.warn(
      "[serialization] Failed to generate playback URL for content",
      content.id,
      error,
    );
  }

  return {
    ...content,
    createdAt: content.createdAt.toISOString(),
    updatedAt: content.updatedAt.toISOString(),
    analysisRequestedAt: content.analysisRequestedAt
      ? content.analysisRequestedAt.toISOString()
      : null,
    uploadedBy: content.uploadedBy
      ? {
          ...content.uploadedBy,
          createdAt: content.uploadedBy.createdAt.toISOString(),
          updatedAt: content.uploadedBy.updatedAt.toISOString(),
        }
      : null,
    videoPlaybackUrl: playbackUrl ?? null,
  };
}

export async function serializeCollection(collection) {
  return {
    ...collection,
    description: collection.description ?? null,
    createdAt: collection.createdAt.toISOString(),
    updatedAt: collection.updatedAt.toISOString(),
    organization: collection.organization,
    contents: await Promise.all(
      (collection.contents ?? []).map((content) => serializeContent(content)),
    ),
  };
}

export async function serializeCollections(collections) {
  return Promise.all(collections.map((collection) => serializeCollection(collection)));
}
