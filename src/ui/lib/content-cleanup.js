import { SearchClient, AzureKeyCredential } from "@azure/search-documents";

import { deleteBlobByUrl, isBlobUrl } from "@/lib/azure-storage";

export function collectBlobUrls(value, accumulator = new Set()) {
  if (!value) {
    return accumulator;
  }

  if (typeof value === "string") {
    if (isBlobUrl(value)) {
      accumulator.add(value.trim());
    }
    return accumulator;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectBlobUrls(item, accumulator));
    return accumulator;
  }

  if (typeof value === "object") {
    Object.values(value).forEach((entry) => collectBlobUrls(entry, accumulator));
  }

  return accumulator;
}

export function collectSearchDocumentIds(metadata) {
  const ids = new Set();
  const uploads = metadata?.actionSummary?.searchUploads;
  if (Array.isArray(uploads)) {
    uploads.forEach((upload) => {
      const identifier = upload?.id ?? upload?.documentId;
      const status = upload?.uploadStatus ?? upload?.status;
      if (
        typeof identifier === "string" &&
        identifier.trim().length &&
        (status == null || String(status).toLowerCase() !== "failed")
      ) {
        ids.add(identifier.trim());
      }
    });
  }
  return Array.from(ids);
}

function getSearchClient() {
  const endpoint = process.env.SEARCH_ENDPOINT;
  const indexName = process.env.INDEX_NAME;
  const apiKey = process.env.SEARCH_API_KEY;

  if (!endpoint || !indexName) {
    return null;
  }

  if (!apiKey || !apiKey.trim().length) {
    return null;
  }

  return new SearchClient(endpoint, indexName, new AzureKeyCredential(apiKey.trim()));
}

export async function deleteSearchDocuments(documentIds) {
  if (!documentIds.length) {
    return;
  }

  const client = getSearchClient();
  if (!client) {
    return;
  }

  try {
    await client.deleteDocuments(documentIds.map((id) => ({ id })));
  } catch (error) {
    console.warn("[content] Failed to delete search documents", {
      ids: documentIds,
      error,
    });
  }
}

export async function deleteBlobUrls(urls) {
  if (!urls.length) {
    return;
  }

  await Promise.allSettled(urls.map((url) => deleteBlobByUrl(url)));
}
