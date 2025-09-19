import { NextResponse } from "next/server";
import { SearchClient, AzureKeyCredential } from "@azure/search-documents";

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

export async function POST(request) {
  const body = await request.json();
  const query = body?.query ?? body?.messages;

  if (!query) {
    return NextResponse.json({ error: "Query text is required" }, { status: 400 });
  }

  const client = new SearchClient(
    process.env.SEARCH_ENDPOINT,
    process.env.INDEX_NAME,
    new AzureKeyCredential(process.env.SEARCH_API_KEY ?? ""),
  );

  const filter = buildFilter({
    organizationId: body?.organizationId,
    collectionId: body?.collectionId,
    contentId: body?.contentId,
  });

  try {
    const searchResults = await client.search(query, {
      queryType: "semantic",
      queryLanguage: "en-us",
      top: 5,
      semanticConfiguration: "sem",
      filter,
    });

    const documents = [];
    for await (const result of searchResults.results) {
      documents.push(result.document);
    }

    return NextResponse.json({ message: documents }, { status: 200 });
  } catch (error) {
    try {
      const parsed = JSON.parse(error.message);
      if (parsed?.value) {
        return NextResponse.json({ message: parsed.value }, { status: 200 });
      }
    } catch (parseError) {
      // ignore parsing errors
    }

    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
