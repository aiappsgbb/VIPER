# Azure Developer CLI (azd) Compliance Report

**Repository**: aiappsgbb/VIPER  
**Date**: 2026-02-06  
**Reviewer**: Azure Developer CLI Compliance Tool  
**Status**: ⚠️ **MOSTLY COMPLIANT with WARNINGS**

---

## Executive Summary

The VIPER repository demonstrates **strong overall compliance** with Azure Developer CLI (azd) requirements. The project has a well-structured configuration with proper infrastructure templates, GitHub Actions workflows, and comprehensive documentation. However, there are **important security concerns** regarding API key usage that conflict with the repository's own Azure Best Practices guidelines.

**Overall Score**: 7.5/10

---

## Detailed Findings

### 🔴 CRITICAL ISSUES (Must Fix)

#### 1. Security: API Key Usage Conflicts with Best Practices

**Category**: Configuration | Security  
**Status**: ⚠️ **WARNING - CRITICAL SECURITY CONCERN**

**Description**:  
The infrastructure template (`infra/main.bicep`) accepts and passes API keys as parameters, which **directly conflicts** with the repository's own Azure Best Practices document (`.github/azure-bestpractices.md`).

**Evidence**:
- `main.bicep` lines 59-86 define secure parameters for API keys:
  - `azureOpenaiGptVisionApiKey` (line 61)
  - `azOpenaiKey` (line 85)  
  - `searchApiKey` (line 101)
  - `databaseUrl` (line 105)
  
- These are passed to container apps as environment variables (lines 169, 188-194)

**From Azure Best Practices document**:
```
## 🔐 Authentication & Security
### Core Principle: Zero Trust Authentication
**NEVER use API keys or connection strings for Azure service authentication.**
```

**Impact**:
- Violates zero-trust security principles
- Container apps use System Assigned Managed Identity but still accept API keys
- Creates confusion about authentication method
- Potential security vulnerability if keys are exposed

**Recommendation**:

1. **IMMEDIATE**: Remove API key parameters from `main.bicep`:
   ```bicep
   // REMOVE these parameters:
   // param azureOpenaiGptVisionApiKey string = ''
   // param azOpenaiKey string = ''
   // param searchApiKey string = ''
   ```

2. **IMMEDIATE**: Remove API key environment variables from container app configuration (lines 169, 193)

3. **IMMEDIATE**: Update container apps to use User Assigned Managed Identity instead of System Assigned:
   ```bicep
   // Current (System Assigned)
   identity: {
     type: 'SystemAssigned'
   }
   
   // Should be (User Assigned)
   identity: {
     type: 'UserAssigned'
     userAssignedIdentities: {
       '${userAssignedIdentity.id}': {}
     }
   }
   ```

4. **REQUIRED**: Add AZURE_CLIENT_ID environment variable to both container apps:
   ```bicep
   env: [
     {
       name: 'AZURE_CLIENT_ID'
       value: userAssignedIdentity.outputs.clientId
     }
     // ... other variables
   ]
   ```

5. **UPDATE**: Application code to use ChainedTokenCredential pattern as documented in azure-bestpractices.md

6. **UPDATE**: README.md to remove any references to API keys in environment variables

---

### ⚠️ WARNINGS (Should Fix)

#### 2. Missing User Assigned Managed Identity Module

**Category**: Infrastructure | Security  
**Status**: ⚠️ **WARNING**

**Description**:  
The infrastructure uses System Assigned Managed Identity for container apps, but best practices (documented in `.github/bicep-deployment-bestpractices.md`) recommend User Assigned Managed Identity for better control and reusability.

**Impact**:
- Less flexible identity management
- Cannot pre-configure RBAC before deployment
- Harder to share identity across multiple resources

**Recommendation**:
1. Create `infra/modules/user-assigned-identity.bicep` module
2. Update `infra/main.bicep` to create User Assigned Managed Identity
3. Reference this identity in container apps configuration
4. Add AZURE_CLIENT_ID to container app environment variables

---

#### 3. Environment Variable Alignment Gap

**Category**: Configuration  
**Status**: ⚠️ **WARNING**

**Description**:  
The infrastructure accepts many environment variables (22 parameters in main.parameters.json), but it's unclear if application code is configured to use Managed Identity authentication for all Azure services.

**Files to Check**:
- `src/cobrapy/` - Backend application configuration
- `src/ui/` - Frontend application configuration

**Recommendation**:
1. **AUDIT**: Review application code to verify all Azure service clients use ChainedTokenCredential
2. **VERIFY**: No API keys are used in application code for Azure service authentication
3. **ENSURE**: Applications read AZURE_CLIENT_ID from environment and use it for authentication

---

#### 4. DATABASE_URL as Secure Parameter

**Category**: Configuration | Security  
**Status**: ⚠️ **WARNING**

**Description**:  
`DATABASE_URL` is marked as secure parameter and passed to containers. If this is for PostgreSQL or another Azure database, it should use Managed Identity authentication instead of connection strings with passwords.

**Current Configuration**:
```bicep
@secure()
@description('Database connection URL')
param databaseUrl string = ''
```

**Recommendation**:
1. If DATABASE_URL is for Azure PostgreSQL, configure password-less authentication using Managed Identity
2. If DATABASE_URL must contain credentials (e.g., external database), store in Azure Key Vault and reference via Key Vault reference in Container Apps
3. Update README.md with clear guidance on DATABASE_URL configuration

---

### 🟢 COMPLIANT AREAS

#### 1. azure.yaml Configuration ✅

**Category**: azure.yaml  
**Status**: ✅ **COMPLIANT**

**Findings**:
- ✅ Valid schema reference (`yaml-language-server: $schema=...`)
- ✅ Project name defined (`name: viper`)
- ✅ Metadata present with template version
- ✅ Infrastructure configuration correct:
  - Provider: bicep
  - Path: infra
  - Module: main
- ✅ Two services defined with correct structure:
  - `backend`: Python, containerapp host
  - `frontend`: JavaScript, containerapp host
- ✅ Docker configuration present for both services
- ✅ Project paths exist and are valid:
  - Backend: `.` (root directory) ✓
  - Frontend: `src/ui` ✓
- ✅ Pre-provision and pre-deploy hooks configured for environment variable loading
- ✅ Both POSIX and Windows hooks provided

**Notes**:
- Hooks load `.env` file - this is acceptable for local development only
- In production (GitHub Actions), environment variables should come from Azure resources directly

---

#### 2. Infrastructure as Code (Bicep) ✅

**Category**: Infrastructure  
**Status**: ✅ **COMPLIANT**

**Findings**:
- ✅ `infra/` directory present with proper structure
- ✅ `main.bicep` exists at `infra/main.bicep`
- ✅ Target scope correctly set to `subscription` (line 1)
- ✅ Required parameters present:
  - `environmentName` (required) ✓
  - `location` (required) ✓
- ✅ Parameter mapping in `main.parameters.json`:
  - All 22 parameters properly mapped ✓
  - Uses azd variable substitution syntax (`${AZURE_ENV_NAME}`, `${AZURE_LOCATION}`) ✓
- ✅ Resource naming uses `uniqueString()` for globally unique resources:
  - Container Registry
  - Storage Account
  - Search Service
  - Cosmos DB
- ✅ Modular structure:
  - `infra/modules/acr.bicep` for Container Registry
  - `azure/containerapps.bicep` for Container Apps infrastructure
  - Role assignment modules for Storage, Search, Cosmos DB
- ✅ Proper resource group creation at subscription scope
- ✅ Comprehensive infrastructure deployment:
  - Virtual Network with subnets
  - Container Apps Environment
  - Storage Account with private endpoints
  - Azure AI Search with private endpoints
  - Cosmos DB with private endpoints
  - Private DNS zones for all services

**Strengths**:
- Advanced networking with VNet integration
- Private endpoints for all data services
- Proper security with network isolation
- Well-organized module structure

---

#### 3. Service Discovery Outputs ✅

**Category**: Infrastructure  
**Status**: ✅ **COMPLIANT**

**Findings**:
- ✅ Required azd outputs present in `main.bicep`:
  ```bicep
  output AZURE_LOCATION string
  output AZURE_TENANT_ID string
  output AZURE_RESOURCE_GROUP string
  output AZURE_CONTAINER_REGISTRY_ENDPOINT string
  output AZURE_CONTAINER_REGISTRY_NAME string
  ```
- ✅ Service-specific outputs following azd naming convention:
  ```bicep
  output SERVICE_BACKEND_NAME string
  output SERVICE_FRONTEND_NAME string
  output SERVICE_FRONTEND_URL string
  output SERVICE_BACKEND_INTERNAL_URL string
  ```

**Pattern Match**: Output naming follows `SERVICE_<SERVICE_NAME>_<PROPERTY>` pattern correctly

---

#### 4. GitHub Actions Workflow ✅

**Category**: Workflows  
**Status**: ✅ **COMPLIANT**

**Findings**:
- ✅ Workflow file present: `.github/workflows/gbb-demo.yml`
- ✅ Uses official Azure/setup-azd action (v2.1.0)
- ✅ Federated credential authentication configured:
  ```yaml
  permissions:
    id-token: write
    contents: read
  ```
- ✅ azd commands used correctly:
  - `azd provision --no-prompt` (line 135, 164)
  - `azd deploy --no-prompt` (line 192)
- ✅ Environment variables properly configured:
  - AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID from GitHub vars
  - AZURE_ENV_NAME, AZURE_LOCATION from GitHub vars
  - All infrastructure parameters from GitHub secrets
- ✅ Advanced scope detection (subscription vs resource group)
- ✅ Automatic resource group creation for subscription scope
- ✅ All required parameters passed to azd provision

**Strengths**:
- Sophisticated target scope detection
- Comprehensive secret/variable management
- Well-structured workflow with multiple environments support

---

#### 5. Documentation ✅

**Category**: Documentation  
**Status**: ✅ **COMPLIANT**

**Findings**:
- ✅ README.md includes comprehensive azd deployment section
- ✅ Prerequisites documented:
  - Azure Developer CLI installation link
  - Docker requirement
  - Azure subscription requirement
- ✅ Quick start guide with azd commands:
  - `azd init`
  - `azd up`
- ✅ Environment variable documentation in table format
- ✅ Clear explanation of what `azd up` does
- ✅ Alternative deployment options documented (PowerShell script)
- ✅ Reference to `azure/README.md` for detailed deployment options
- ✅ Best practices documentation:
  - `.github/azure-bestpractices.md` - Security guidelines
  - `.github/bicep-deployment-bestpractices.md` - IaC guidelines
  - `.github/copilot-instructions.md` - Development standards
- ✅ Prompt files for common tasks including `/checkAzdCompliance`

**Strengths**:
- Comprehensive and well-organized documentation
- Multiple deployment paths documented
- Security best practices clearly defined

---

#### 6. Environment Configuration ✅

**Category**: Configuration  
**Status**: ✅ **COMPLIANT**

**Findings**:
- ✅ Sample environment file present: `sample.env`
- ✅ All required variables documented with descriptions
- ✅ Clear structure separating backend and frontend configuration
- ✅ Comments explaining which variables are managed/optional
- ✅ Safe defaults where appropriate (e.g., API versions)

**Notes**:
- sample.env references API keys which should be removed per security best practices
- DATABASE_URL configuration uses external script (`python scripts/apply_database_url.py`)

---

#### 7. Resource Naming and Uniqueness ✅

**Category**: Infrastructure  
**Status**: ✅ **COMPLIANT**

**Findings**:
- ✅ Uses `uniqueString()` for globally unique resources:
  ```bicep
  var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
  ```
- ✅ Proper abbreviations for resource types:
  - `rg-` for resource groups
  - `acr` for container registry
  - `ca-` for container apps
  - `st` for storage account
  - `srch-` for search service
  - `cosmos-` for Cosmos DB
- ✅ Resource names include environment name for isolation
- ✅ Handles both subscription and resource group scopes

**Strength**: Excellent naming strategy preventing collisions in shared subscriptions

---

#### 8. Dockerfile Presence ✅

**Category**: Configuration  
**Status**: ✅ **COMPLIANT**

**Findings**:
- ✅ `Dockerfile.backend` exists in repository root
- ✅ `Dockerfile.frontend` exists in repository root
- ✅ Paths in azure.yaml match actual file locations
- ✅ Docker contexts properly configured in azure.yaml

---

### 🔵 RECOMMENDATIONS (Optional Improvements)

#### 1. Add .azdignore File

**Benefit**: Reduce deployment time by excluding unnecessary files from Docker context

**Recommendation**:
Create `.azdignore` file with:
```
.git/
.github/
.vscode/
__pycache__/
*.pyc
.env
.env.*
*.log
tests/
docs/
*.md
!README.md
node_modules/
dist/
build/
.pytest_cache/
.ruff_cache/
```

---

#### 2. Add azd hooks for Post-Deployment Configuration

**Benefit**: Automate post-deployment setup tasks

**Recommendation**:
Add to `azure.yaml`:
```yaml
hooks:
  postprovision:
    posix:
      shell: sh
      run: |
        echo "Running post-provision setup..."
        # Add any initialization scripts here
    windows:
      shell: pwsh
      run: |
        Write-Host "Running post-provision setup..."
        # Add any initialization scripts here
```

---

#### 3. Add Health Checks to Container Apps

**Benefit**: Improve reliability and deployment validation

**Recommendation**:
Add to `azure/containerapps.bicep`:
```bicep
probes: [
  {
    type: 'Liveness'
    httpGet: {
      path: '/health'
      port: 8000
    }
    initialDelaySeconds: 10
    periodSeconds: 10
  }
  {
    type: 'Readiness'
    httpGet: {
      path: '/ready'
      port: 8000
    }
    initialDelaySeconds: 5
    periodSeconds: 5
  }
]
```

---

#### 4. Add Application Insights Integration

**Benefit**: Comprehensive observability and monitoring

**Recommendation**:
1. Create Application Insights resource in infrastructure
2. Pass connection string to container apps
3. Configure OpenTelemetry in applications as mentioned in copilot-instructions.md

---

#### 5. Implement Automated Testing in Workflow

**Benefit**: Catch deployment issues early

**Recommendation**:
Add test job to `.github/workflows/gbb-demo.yml`:
```yaml
- name: Test Deployment
  run: |
    FRONTEND_URL=$(azd env get-values | grep SERVICE_FRONTEND_URL | cut -d'=' -f2)
    curl -f "$FRONTEND_URL/health" || exit 1
```

---

## Validation Commands

### 1. Verify azd Configuration
```bash
azd config list
```
**Expected**: Should complete without errors

### 2. Validate Bicep Syntax
```bash
cd infra
az bicep build --file main.bicep
```
**Expected**: Should compile without errors

### 3. Test Parameter Mapping
```bash
# Check all required parameters are mapped
python3 << 'EOF'
import json
with open('infra/main.parameters.json') as f:
    params = json.load(f)
required = ['environmentName', 'location']
for p in required:
    assert p in params['parameters'], f"Missing {p}"
print("✓ All required parameters present")
EOF
```

### 4. Preview Deployment (What-If)
```bash
azd provision --preview
```
**Expected**: Shows resources to be created without errors

---

## Summary & Priorities

### Must Fix (Critical) 🔴

1. **Remove API Key Parameters** - Conflicts with security best practices
2. **Implement User Assigned Managed Identity** - Required for zero-trust security
3. **Add AZURE_CLIENT_ID to Container Apps** - Required for managed identity authentication
4. **Audit Application Code** - Verify ChainedTokenCredential usage

### Should Fix (Important) ⚠️

5. **Review DATABASE_URL Security** - Consider password-less authentication
6. **Update Sample.env** - Remove API key references
7. **Update README** - Remove API key configuration instructions

### Optional Enhancements 🔵

8. Add .azdignore file
9. Add post-deployment hooks
10. Add health checks
11. Add Application Insights
12. Add automated testing

---

## Conclusion

The VIPER repository demonstrates **excellent azd project structure** with comprehensive infrastructure templates, well-configured workflows, and thorough documentation. The primary concern is the **conflict between the infrastructure implementation and the documented security best practices regarding API keys**.

**Priority Actions**:
1. Align infrastructure with zero-API-key security policy
2. Implement User Assigned Managed Identity throughout
3. Audit and update application code for proper authentication

Once these security issues are addressed, the repository will be **fully compliant** with Azure Developer CLI best practices and ready for production deployment.

---

**Report Generated**: 2026-02-06  
**Tool Version**: 1.0.0  
**Next Review**: After critical issues are resolved
