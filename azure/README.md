# Azure deployment environment


This directory contains infrastructure-as-code assets for deploying the Viper backend and Viper UI frontend to [Azure Container Apps](https://learn.microsoft.com/azure/container-apps/).


## Bicep template

- **`containerapps.bicep`** provisions:
  - A Log Analytics workspace for collecting container logs.
  - An Azure Container Apps managed environment integrated with a private virtual network.
  - Two container apps (backend and frontend) that pull images from an Azure Container Registry (ACR).
  - Private ingress for the backend and HTTPS-only public ingress for the frontend. The template automatically injects secure defaults for the UI so it communicates with the backend over the Container Apps internal domain via TLS.
- A virtual network with dedicated subnets for Container Apps infrastructure, dedicated workload profiles, and private endpoints.
- Configures a dedicated Container Apps workload profile bound to the non-delegated workload subnet so dedicated SKUs can be used without subnet delegation conflicts.
- Reserved address ranges for the Container Apps platform infrastructure and Docker bridge network with overridable defaults
  so deployments succeed even when the environment is isolated in a virtual network.
- A Storage account, Azure AI Search service, and Azure Cosmos DB account (unless existing resources are supplied) with public network access disabled and private endpoints wired into the virtual network.
  - System-assigned managed identities for both container apps. The identities are granted `AcrPull`, `Storage Blob Data Contributor`, `Search Index Data Contributor`, and `Cosmos DB Built-in Data Contributor` so the workloads can manage data without access keys.

Both container apps accept additional environment variables through the `backendEnvVars` and `frontendEnvVars` parameters. These are typically populated by the deployment script from the repository `.env` file. The deployment additionally injects a `VIPER_BACKEND_INTERNAL_URL` variable so workloads that need the Container Apps-only endpoint can access it explicitly. For database access, the script resolves the cloud `DATABASE_URL` from `config/database_urls.json` (or the `-CloudDatabaseUrl` parameter) so publishing to Azure consistently targets the production Viper database regardless of local overrides.


### Azure environment configuration

- **`sample.azure.env`** lists optional Azure resource bindings used during deployment. Copy it to `azure/.env` and populate the resource names that should receive managed identity assignments.

Leaving entries blank skips the associated role assignment. When a resource group is omitted the deployment assumes the resource lives in the same resource group as the Container Apps environment. The template expects the referenced resources to reside in the same subscription as the deployment.

## Deployment workflow


1. Deploy to Azure by executing `scripts/Deploy-ViperToAzure.ps1`. At a minimum provide your Azure subscription, target resource group, and region:

   ```powershell
   ./scripts/Deploy-ViperToAzure.ps1 \
       -SubscriptionId "00000000-0000-0000-0000-000000000000" \
       -ResourceGroupName "viper-prod" \

       -Location "eastus"
   ```

   The script will:

   - Create (or update) the specified resource group.
   - Build the backend and frontend Docker images, push them to a managed ACR, and deploy them into Azure Container Apps.
   - Provision (or update) all infrastructure defined in `azure/containerapps.bicep`, including the virtual network, private endpoints, Storage, Search, and Cosmos DB resources, with managed identities configured for data-plane access.
   - Bootstrap the Azure AI Search index schema, create a query API key, and inject the required environment variables into the deployed containers.
   - Print the public FQDN for the frontend application when deployment completes.

   By default the script ensures you are authenticated against the `16b3c013-d300-468d-ac64-7eda0820b6d3` Azure AD tenant before continuing. Use the optional `-TenantId` parameter if you need to override this behaviour.

### Customisation options


The deployment script accepts optional parameters for the ACR name, Container Apps environment name, container app names, image tags, virtual network name, the Azure AD tenant, and the Azure resource names that will be created. These default to deterministic names derived from the resource group when omitted. Use `-SkipEnvFile` if you do not want to send `.env` values to Azure, and `-SkipAzureEnvFile` if you prefer to control the managed identity parameters manually or bind to existing resources.

To override the URL that the frontend uses to reach the backend in Azure, set `VIPER_BASE_URL` in your `.env` before running the deployment script. Otherwise the template will generate the secure internal URL based on the Container Apps environment domain.

## Container image hardening

The published Dockerfiles run the backend and frontend processes as non-root service accounts and strip development dependencies after builds. These hardened images are what get published to Azure Container Registry by the deployment script.

