import {
  AzureDeveloperCliCredential,
  ChainedTokenCredential,
  ManagedIdentityCredential,
} from "@azure/identity";

export function getAzureCredential() {
  return new ChainedTokenCredential(
    new AzureDeveloperCliCredential(),
    new ManagedIdentityCredential(),
  );
}
