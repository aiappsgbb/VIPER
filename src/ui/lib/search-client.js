import { AzureKeyCredential } from "@azure/search-documents";
import { getAzureCredential } from "@/lib/azure-credentials";

export function getSearchCredential() {
  const searchApiKey = process.env.SEARCH_API_KEY;
  if (searchApiKey && searchApiKey.trim().length > 0) {
    return new AzureKeyCredential(searchApiKey);
  }

  return getAzureCredential();
}
