# Configuration reference

Configuration is supplied through `.env` locally and through azd environment values for deployment. Start from `sample.env`.

```powershell
Copy-Item sample.env .env
azd env set --file .env
```

To quickly fill local `.env` from the selected azd environment after provisioning or deployment:

```powershell
python scripts\export_azd_env.py
```

The helper preserves `sample.env` comments/defaults, updates matching entries from `azd env get-values`, and appends azd-generated outputs that are not in the template. This overwrites `.env`, which is ignored by git.

## Deployment metadata

| Variable | Required | Description |
| --- | --- | --- |
| `RESOURCE_GROUP_TAGS` | No | JSON object of additional tags applied only to the Azure resource group, for example `{"CostCenter":"Demo"}`. Child resources keep only the default deployment tags. |

## COBRA backend

| Variable | Required | Description |
| --- | --- | --- |
| `AZURE_OPENAI_GPT_VISION_ENDPOINT` | Yes for analysis | Azure OpenAI or Azure AI Services endpoint |
| `AZURE_OPENAI_GPT_VISION_API_VERSION` | Yes for analysis | API version used by the OpenAI SDK |
| `AZURE_OPENAI_GPT_VISION_DEPLOYMENT` | Yes for analysis | Deployment name used for chat/vision analysis |
| `AZURE_OPENAI_GPT_VISION_API_KEY` | No | Optional API key; leave blank for Entra ID |
| `AZURE_OPENAI_GPT_VISION_RESOURCE_ID` | No | Optional resource ID used by Bicep to assign backend RBAC during `azd provision` |
| `AZURE_SPEECH_REGION` | Yes for transcripts | Speech region |
| `AZURE_SPEECH_ENDPOINT` | No | Optional Speech endpoint override |
| `AZURE_SPEECH_USE_MANAGED_IDENTITY` | Yes for keyless Speech | Use `true` for Entra ID auth |
| `AZURE_SPEECH_RESOURCE_ID` | Yes for keyless Speech | Required by Speech SDK for `aad#resourceId#token` auth |
| `AZURE_SPEECH_API_KEY` | No | Optional Speech key when managed identity is disabled |
| `AZURE_SPEECH_LANGUAGE` | No | Speech recognition language; defaults to `en-US` |
| `AZURE_STORAGE_ACCOUNT_URL` | Azure upload/deployment | Blob account URL; infra can generate it when blank |
| `AZURE_STORAGE_VIDEO_CONTAINER` | Azure upload/deployment | Source video container name |
| `AZURE_STORAGE_OUTPUT_CONTAINER` | Azure upload/deployment | Analysis output container name |
| `AZURE_SEARCH_ENDPOINT` | Search uploads | Search endpoint; infra can generate it when blank |
| `AZURE_SEARCH_INDEX_NAME` | Search uploads | Search index name |

## VIPER UI

| Variable | Required | Description |
| --- | --- | --- |
| `ENABLE_FRONTEND` | Deployment | Set `false` for backend-only deployment |
| `VIPER_AUTH_MODE` | UI only | `easyauth` for Azure Container Apps EasyAuth; `anonymous` only for non-production local smoke testing |
| `VIPER_ADMIN_EMAILS` | UI only | Comma-separated Entra user emails that should receive VIPER `ADMIN` role on sign-in |
| `FRONTEND_EASYAUTH_ENABLED` | Azure UI | Enable Container Apps EasyAuth for the frontend |
| `FRONTEND_EASYAUTH_CLIENT_ID` | Azure UI EasyAuth | Entra app registration client ID |
| `FRONTEND_EASYAUTH_CLIENT_SECRET` | Azure UI EasyAuth | Entra app registration client secret |
| `FRONTEND_EASYAUTH_OPENID_ISSUER` | No | Optional issuer override; leave blank to use the deployment tenant |
| `DATABASE_URL` | UI only | Bring-your-own PostgreSQL connection string when `CREATE_POSTGRES` is `false` |
| `CREATE_POSTGRES` | Azure UI | Set `true` to provision Azure Database for PostgreSQL Flexible Server for the UI |
| `POSTGRES_SERVER_NAME` | No | Optional PostgreSQL server name override |
| `POSTGRES_ADMINISTRATOR_LOGIN` | PostgreSQL provisioning | PostgreSQL administrator login |
| `POSTGRES_ADMINISTRATOR_PASSWORD` | PostgreSQL provisioning | PostgreSQL administrator password |
| `POSTGRES_DATABASE_NAME` | PostgreSQL provisioning | UI database name |
| `VIPER_BASE_URL` | Optional | Backend URL for browser/server calls; defaults to local backend in development and backend internal URL in Azure |
| `VIPER_BACKEND_INTERNAL_URL` | Optional | Internal backend URL override |
| `COBRAPY_UPLOAD_ENDPOINT` | Optional | Direct upload endpoint override; defaults to the backend `/videos/upload` route |
| `COBRAPY_UPLOAD_FALLBACK_HOSTS` | Optional | Comma-separated upload fallback hosts for local networking edge cases |
| `AZ_OPENAI_KEY`, `AZ_OPENAI_BASE`, `AZ_OPENAI_VERSION`, `GPT4` | UI features | Legacy UI OpenAI variables used by UI-specific features |
| `VIPER_CHAT_MAX_COMPLETION_TOKENS` | No | Token cap for VIPER chat responses; defaults to `2000` and maps to `max_completion_tokens` for newer model families |
| `SEARCH_ENDPOINT`, `SEARCH_API_KEY`, `INDEX_NAME` | UI features | UI search variables |

The UI no longer uses database-backed username/password authentication. Entra ID identities are mapped to Prisma `User` records at sign-in so the existing organization, collection, content, and role model still has a persistent store.

For local smoke testing only, set `VIPER_AUTH_MODE=anonymous`. This creates or reuses a real local test user, organization, and collection in the configured PostgreSQL database; it does not mock analysis, Speech, or OpenAI calls.

## Backend analysis tuning

| Variable | Default | Description |
| --- | --- | --- |
| `COBRA_MAX_CONCURRENT_ANALYSES` | `2` | Maximum concurrently running analysis jobs |
| `COBRA_MAX_PENDING_ANALYSIS_JOBS` | `50` | Maximum queued analysis jobs before requests are rejected |
| `COBRA_MAX_PREPROCESS_WORKERS` | `4` | Upper bound for preprocessing workers |
| `COBRA_DEFAULT_PREPROCESS_WORKERS` | `2` | Default preprocessing workers per request |
| `COBRA_TOKENS_PER_MINUTE_LIMIT` | `1000000` | Token bucket capacity for throttling analysis calls |
| `COBRA_BASE_TOKENS_PER_REQUEST` | `9000` | Base token estimate per request |
| `COBRA_TOKENS_PER_SEGMENT` | `450` | Token estimate added for each segment |
| `COBRA_LENS_CHARS_PER_TOKEN` | `4` | Lens text token estimate ratio |
| `COBRA_MAX_LENS_TOKEN_BONUS` | `2000` | Maximum extra token estimate from lens text |

## Deployment smoke tests

| Variable | Required | Description |
| --- | --- | --- |
| `VIPER_SMOKE_BASE_URL` | UI smoke | Frontend URL for Playwright smoke tests; defaults to Playwright base URL when set |
| `VIPER_SMOKE_UPLOAD` | No | Set `true` to include the real upload journey |
| `VIPER_SMOKE_VIDEO_URL` | No | Public MP4 URL downloaded at runtime for upload smoke |
| `VIPER_SMOKE_VIDEO_PATH` | No | Local MP4 path for upload smoke |

## Keyless authentication

The Python backend prefers Entra ID when service keys are blank. It uses the shared credential helper in `src\cobrapy\azure_credentials.py`:

1. Azure Developer CLI credential
2. Azure CLI credential
3. Managed identity credential

Azure Speech has one extra requirement: when using Entra ID, set `AZURE_SPEECH_RESOURCE_ID` so the SDK can receive tokens in the required `aad#<resourceId>#<token>` format.

## Deployment RBAC

When these resource IDs are set, Bicep assigns roles to the backend managed identity during `azd provision`:

| Variable | Role |
| --- | --- |
| `AZURE_OPENAI_GPT_VISION_RESOURCE_ID` | `Cognitive Services OpenAI User` |
| `AZURE_SPEECH_RESOURCE_ID` | `Cognitive Services User` |

Leave them blank if RBAC is managed outside this deployment. After changing either value, run `azd provision` so the role assignments are reconciled. Existing hook-created assignments for the same backend identity, role, and AI scope are reported and migrated by the preprovision hook before Bicep applies RBAC.
