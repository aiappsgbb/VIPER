import { OpenAIStream, StreamingTextResponse } from "ai";
import { OpenAIClient, AzureKeyCredential as OpenAIKeyCredential } from "@azure/openai";
import { SearchClient, AzureKeyCredential as SearchKeyCredential } from "@azure/search-documents";

function streamChatCompletions(client, deploymentId, messages, options) {
  const events = client.listChatCompletions(deploymentId, messages, options);
  const stream = new ReadableStream({
    async start(controller) {
      for await (const event of events) {
        controller.enqueue(event);
      }
      controller.close();
    },
  });

  return stream;
}

function buildFilter({ organizationId, collectionId, contentId }) {
  const clauses = [];
  if (organizationId) {
    clauses.push(`organizationId eq '${organizationId}'`);
  }
  if (collectionId) {
    clauses.push(`collectionId eq '${collectionId}'`);
  }
  if (contentId) {
    clauses.push(`contentId eq '${contentId}'`);
  }
  if (!clauses.length) {
    return undefined;
  }
  return clauses.join(" and ");
}

function extractNumericValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const match = value.match(/\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }
  const numeric = Number.parseFloat(match[0]);
  return Number.isFinite(numeric) ? numeric : null;
}

function sanitizeRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const fields = {
    id: record.id ?? record.contentId ?? record.content_id ?? null,
    documentType: record.documentType ?? record.type ?? record.kind ?? null,
    videoTitle: record.contentTitle ?? record.content_title ?? record.title ?? null,
    collection: record.collectionName ?? record.collection ?? null,
    organization: record.organizationName ?? record.organization ?? null,
    chapterTitle: record.chapter_title ?? record.chapterTitle ?? null,
    summary: record.summary ?? record.text ?? record.description ?? null,
    chapterSummary: record.chapter_summary ?? record.chapterSummary ?? null,
    actions: record.actions ?? record.key_actions ?? null,
    characters: record.characters ?? record.people ?? null,
    keyObjects: record.key_objects ?? record.objects ?? null,
    sentiment: record.sentiment ?? null,
    theme: record.scene_theme ?? record.theme ?? null,
    startTime:
      record.start_timestamp ??
      record.start ??
      record.start_time ??
      record.Start_Timestamp ??
      null,
    endTime:
      record.end_timestamp ??
      record.end ??
      record.end_time ??
      record.End_Timestamp ??
      null,
  };

  const startSeconds = extractNumericValue(fields.startTime);
  const endSeconds = extractNumericValue(fields.endTime);

  const sanitized = {
    ...fields,
    startSeconds,
    endSeconds,
  };

  const filtered = Object.fromEntries(
    Object.entries(sanitized).filter(([key, value]) => {
      if (value == null) {
        return false;
      }
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed || key.startsWith("@search")) {
          return false;
        }
        return true;
      }
      return true;
    }),
  );

  return Object.keys(filtered).length > 1 ? filtered : null;
}

function sanitizeTimeline(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .slice(0, 25)
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const payload = {
        id: entry.id ?? entry.segment_id ?? null,
        summary: entry.summary ?? entry.description ?? entry.text ?? null,
        actions: entry.actions ?? entry.key_actions ?? null,
        characters: entry.characters ?? null,
        keyObjects: entry.keyObjects ?? entry.key_objects ?? null,
        sentiment: entry.sentiment ?? null,
        theme: entry.theme ?? entry.scene_theme ?? null,
        startTime: entry.startTime ?? entry.start ?? entry.start_timestamp ?? null,
        endTime: entry.endTime ?? entry.end ?? entry.end_timestamp ?? null,
        startSeconds:
          extractNumericValue(entry.startSeconds ?? entry.start_time ?? entry.start_timestamp),
        endSeconds: extractNumericValue(entry.endSeconds ?? entry.end_time ?? entry.end_timestamp),
      };

      const filtered = Object.fromEntries(
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

      return Object.keys(filtered).length > 1 ? filtered : null;
    })
    .filter(Boolean);
}

function sanitizeChapters(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .slice(0, 25)
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const payload = {
        id: entry.id ?? null,
        title: entry.title ?? entry.chapterTitle ?? null,
        summary: entry.summary ?? entry.description ?? null,
        startTime: entry.start ?? entry.startTime ?? null,
        endTime: entry.end ?? entry.endTime ?? null,
        startSeconds: extractNumericValue(entry.startSeconds ?? entry.start),
        endSeconds: extractNumericValue(entry.endSeconds ?? entry.end),
      };

      const filtered = Object.fromEntries(
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

      return Object.keys(filtered).length > 1 ? filtered : null;
    })
    .filter(Boolean);
}

async function retrieveSearchContext(client, query, options) {
  if (!query) {
    return [];
  }

  try {
    const searchResults = await client.search(query, options);
    const documents = [];
    for await (const result of searchResults.results) {
      const sanitized = sanitizeRecord(result.document);
      if (sanitized) {
        documents.push(sanitized);
      }
      if (documents.length >= (options?.top ?? 5)) {
        break;
      }
    }
    return documents;
  } catch (error) {
    try {
      const parsed = JSON.parse(error.message ?? "{}");
      const values = Array.isArray(parsed?.value) ? parsed.value : [];
      const documents = [];
      for (const item of values) {
        const candidate = item?.document ?? item;
        const sanitized = sanitizeRecord(candidate);
        if (sanitized) {
          documents.push(sanitized);
        }
        if (documents.length >= (options?.top ?? 5)) {
          break;
        }
      }
      return documents;
    } catch (parseError) {
      return [];
    }
  }
}

export async function POST(request) {
  const body = await request.json();
  const messages = Array.isArray(body?.messages) ? [...body.messages] : [];
  const userMessage = [...messages].reverse().find((message) => message?.role === "user");

  if (messages.length === 0 || !userMessage?.content) {
    return new Response(
      JSON.stringify({ error: "Messages are required." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const openAiClient = new OpenAIClient(
    process.env.AZ_OPENAI_BASE,
    new OpenAIKeyCredential(process.env.AZ_OPENAI_KEY ?? ""),
  );
  const searchClient = new SearchClient(
    process.env.SEARCH_ENDPOINT ?? "",
    process.env.INDEX_NAME ?? "",
    new SearchKeyCredential(process.env.SEARCH_API_KEY ?? ""),
  );

  const filter = buildFilter({
    organizationId: body?.organizationId,
    collectionId: body?.collectionId,
    contentId: body?.contentId,
  });

  const searchDocuments = await retrieveSearchContext(searchClient, userMessage.content, {
    queryType: "semantic",
    queryLanguage: "en-us",
    top: 5,
    semanticConfiguration: "sem",
    filter,
  });

  const actionSummary = sanitizeTimeline(body?.actionSummary ?? []);
  const chapterAnalysis = sanitizeChapters(body?.chapterAnalysis ?? []);

  const contextSections = [];
  if (body?.contentTitle) {
    contextSections.push(`Video title: ${body.contentTitle}`);
  }
  if (searchDocuments.length) {
    contextSections.push(`Search highlights:\n${JSON.stringify(searchDocuments, null, 2)}`);
  }
  if (actionSummary.length) {
    contextSections.push(`Action summary timeline:\n${JSON.stringify(actionSummary, null, 2)}`);
  }
  if (chapterAnalysis.length) {
    contextSections.push(`Chapter analysis overview:\n${JSON.stringify(chapterAnalysis, null, 2)}`);
  }

  const supplementalGuidance =
    "Use the supplied context as your only memory. Never fabricate details and prefer precise timestamps when available.";

  if (messages.length === 0 || messages[0]?.role !== "system") {
    messages.unshift({
      role: "system",
      content: supplementalGuidance,
    });
  }

  if (messages[0]) {
    const contextText = contextSections.length
      ? `Context from the video intelligence platform:\n${contextSections.join("\n\n")}`
      : "";
    let systemContent = messages[0].content ?? "";
    if (!systemContent.includes(supplementalGuidance)) {
      systemContent = [systemContent, supplementalGuidance].filter(Boolean).join("\n\n");
    }
    const combinedContent = [systemContent, contextText].filter(Boolean).join("\n\n").trim();
    messages[0] = {
      ...messages[0],
      content: combinedContent,
    };
  }

  const stream = await streamChatCompletions(openAiClient, process.env.GPT4, messages);
  const responseStream = OpenAIStream(stream);
  return new StreamingTextResponse(responseStream);
}
