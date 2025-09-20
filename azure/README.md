# Azure deployment environment


This directory contains infrastructure-as-code assets for deploying the Viper backend and Viper UI frontend to [Azure Container Apps](https://learn.microsoft.com/azure/container-apps/).


## Bicep template

- **`containerapps.bicep`** provisions:
  - A Log Analytics workspace for collecting container logs.
  - An Azure Container Apps managed environment bound to that workspace.
  - Two container apps (backend and frontend) that pull images from an Azure Container Registry (ACR).

  - Private ingress for the backend and HTTPS-only public ingress for the frontend. The template automatically injects secure defaults for the UI so it communicates with the backend over the Container Apps internal domain via TLS.
  - System-assigned managed identities for both container apps. The identities are used for image pulls (via `AcrPull`) and, when Storage, Search, and Speech resources are supplied, are granted `Storage Blob Data Contributor`, `Search Index Data Contributor`, and `Cognitive Services Speech Contributor` respectively.

Both container apps accept additional environment variables through the `backendEnvVars` and `frontendEnvVars` parameters. These are typically populated by the deployment script from the repository `.env` file. The deployment additionally injects a `VIPER_BACKEND_INTERNAL_URL` variable so workloads that need the Container Apps-only endpoint can access it explicitly.


### Azure environment configuration

- **`sample.azure.env`** lists optional Azure resource bindings used during deployment. Copy it to `azure/.env` and populate the resource names that should receive managed identity assignments.

Leaving entries blank skips the associated role assignment. When a resource group is omitted the deployment assumes the resource lives in the same resource group as the Container Apps environment. The template expects the referenced resources to reside in the same subscription as the deployment.

## Deployment workflow


1. Run `scripts/Setup-ViperContainers.ps1` to install cobrapy locally, build the Docker images, and verify the services communicate through Docker.
2. Deploy to Azure by executing `scripts/Deploy-ViperToAzure.ps1`. At a minimum provide your Azure subscription, target resource group, and region:

   ```powershell
   ./scripts/Deploy-ViperToAzure.ps1 \
       -SubscriptionId "00000000-0000-0000-0000-000000000000" \ 
       -ResourceGroupName "viper-prod" \

       -Location "eastus"
   ```

   The script will:

   - Create (or update) the specified resource group.

   - Provision an ACR (with a unique name if one is not supplied) and push the freshly built backend and frontend images. The registry is created with the admin account disabled; Container Apps pull images using their managed identities.
   - Deploy `azure/containerapps.bicep`, passing environment variables from `.env` when present and Azure resource bindings from `azure/.env` when available.

   - Print the public FQDN for the frontend application when deployment completes.

### Customisation options


The deployment script accepts optional parameters for the ACR name, Container Apps environment name, container app names, and image tags. These default to deterministic names derived from the resource group when omitted. Use `-SkipEnvFile` if you do not want to send `.env` values to Azure, and `-SkipAzureEnvFile` if you prefer to control the managed identity parameters manually.

To override the URL that the frontend uses to reach the backend in Azure, set `VIPER_BASE_URL` in your `.env` before running the deployment script. Otherwise the template will generate the secure internal URL based on the Container Apps environment domain.

## Container image hardening

The published Dockerfiles run the backend and frontend processes as non-root service accounts and strip development dependencies after builds. These hardened images are what get published to Azure Container Registry by the deployment script.

