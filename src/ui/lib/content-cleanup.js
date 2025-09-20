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
      const identifier = upload?.id ?? upload?.documentId ?? upload?.document_id;
      const status = upload?.uploadStatus ?? upload?.status;
      if (typeof identifier !== "string") {
        return;
      }
      const trimmedIdentifier = identifier.trim();
      if (
        trimmedIdentifier.length &&
        (status == null || String(status).toLowerCase() !== "failed")
      ) {
        ids.add(trimmedIdentifier);
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

function sanitizeSearchFilterValue(value) {
  if (value == null) {
    return null;
  }

  const stringValue = typeof value === "string" ? value : String(value);
  const trimmed = stringValue.trim();
  if (!trimmed.length) {
    return null;
  }

  return trimmed.replace(/'/g, "''");
}

async function collectDocumentIdsByField(client, fieldName, rawValue) {
  const sanitized = sanitizeSearchFilterValue(rawValue);
  if (!sanitized) {
    return [];
  }

  try {
    const searchResults = await client.search("*", {
      filter: `${fieldName} eq '${sanitized}'`,
      select: ["id"],
      top: 1000,
    });

    const ids = [];
    for await (const result of searchResults.results) {
      const identifier = result?.document?.id;
      if (typeof identifier !== "string") {
        continue;
      }
      const trimmed = identifier.trim();
      if (trimmed.length) {
        ids.push(trimmed);
      }
    }

    return ids;
  } catch (error) {
    console.warn("[content] Failed to query search documents", {
      field: fieldName,
      value: rawValue,
      error,
    });
    return [];
  }
}

export async function deleteSearchDocuments(documentIds = [], options = {}) {
  const client = getSearchClient();
  if (!client) {
    return;
  }

  const identifiers = new Set();

  const providedIds = Array.isArray(documentIds)
    ? documentIds
    : typeof documentIds === "string"
      ? [documentIds]
      : [];

  providedIds.forEach((id) => {
    if (typeof id !== "string") {
      return;
    }
    const trimmed = id.trim();
    if (trimmed.length) {
      identifiers.add(trimmed);
    }
  });

  const contentIds = new Set();
  if (typeof options.contentId === "string") {
    const trimmed = options.contentId.trim();
    if (trimmed.length) {
      contentIds.add(trimmed);
    }
  }

  if (Array.isArray(options.contentIds)) {
    options.contentIds.forEach((value) => {
      if (typeof value !== "string") {
        return;
      }
      const trimmed = value.trim();
      if (trimmed.length) {
        contentIds.add(trimmed);
      }
    });
  }

  for (const contentId of contentIds) {
    const discoveredIds = await collectDocumentIdsByField(client, "contentId", contentId);
    discoveredIds.forEach((identifier) => identifiers.add(identifier));
  }

  if (!identifiers.size) {
    return;
  }

  try {
    await client.deleteDocuments(Array.from(identifiers).map((id) => ({ id })));
  } catch (error) {
    console.warn("[content] Failed to delete search documents", {
      ids: Array.from(identifiers),
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
