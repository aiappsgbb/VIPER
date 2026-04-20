# Azure Developer CLI (azd) Compliance Report

**Repository**: aiappsgbb/VIPER  
**Date**: 2026-02-06  
**Reviewer**: Azure Developer CLI Compliance Agent  
**Status**: ✅ COMPLIANT with minor recommendations

---

## Executive Summary

The VIPER repository demonstrates **strong compliance** with Azure Developer CLI (azd) requirements. The project is properly configured with appropriate infrastructure templates, deployment workflows, and documentation. The repository follows Azure best practices for secure authentication using managed identities and includes comprehensive documentation for deployment.

**Overall Assessment**: ✅ **COMPLIANT**

---

## Detailed Findings

### 1. Azure.yaml Configuration

**Category**: azure.yaml  
**Status**: ✅ **COMPLIANT**

#### Description
The `azure.yaml` file is present at the repository root and properly configured according to azd schema v1.0.

#### Findings
✅ **Compliant Items**:
- Valid schema reference: `https://raw.githubusercontent.com/Azure/azure-dev/main/schemas/v1.0/azure.yaml.json`
- Project name properly defined: `viper`
- Metadata includes template version: `viper@1.0.0`
- Infrastructure provider correctly specified: `bicep`
- Infrastructure path points to correct directory: `infra`
- Infrastructure module specified: `main`
- Two services defined: `backend` and `frontend`
- Both services configured for Container Apps hosting
- Docker configuration includes proper paths and context
- Hooks defined for preprovision and predeploy with both POSIX and Windows support
- Environment variable loading from `.env` file implemented in hooks

**Service Definitions**:
```yaml
backend:
  project: .
  language: python
  host: containerapp
  docker:
    path: Dockerfile.backend
    context: .

frontend:
  project: src/ui
  language: js
  host: containerapp
  docker:
    path: ../../Dockerfile.frontend
    context: ../..
```

#### Recommendation
✅ No changes needed. The azure.yaml file is well-structured and follows azd best practices.

---

### 2. Infrastructure as Code (Bicep Templates)

**Category**: infrastructure  
**Status**: ✅ **COMPLIANT** with recommendations

#### Description
Infrastructure templates exist in the `/infra` directory with proper Bicep configuration for Azure Container Apps deployment.

#### Findings

**✅ Compliant Items**:
- `infra/main.bicep` exists and is syntactically valid
- Uses subscription-level scope: `targetScope = 'subscription'`
- Comprehensive parameter definitions with descriptions and decorations
- Resource naming follows Azure naming conventions
- Tags include `azd-env-name` for environment tracking
- Includes Azure Container Registry (ACR) module
- References existing Container Apps infrastructure in `azure/containerapps.bicep`
- Parameter file `infra/main.parameters.json` properly configured
- Uses azd parameter substitution: `${AZURE_ENV_NAME}`, `${AZURE_LOCATION}`
- Secure parameters marked with `@secure()` decorator
- Auto-generation of resource names when not provided
- Proper output definitions for azd integration

**Infrastructure Components**:
- ✅ Azure Container Registry (ACR)
- ✅ Container Apps Environment
- ✅ Log Analytics Workspace
- ✅ Virtual Network with subnets
- ✅ Azure Storage Account
- ✅ Azure AI Search Service
- ✅ Azure Cosmos DB
- ✅ Backend Container App
- ✅ Frontend Container App

**Module Structure**:
```
infra/
├── main.bicep (subscription scope)
├── main.parameters.json
└── modules/
    └── acr.bicep

azure/
├── containerapps.bicep (main infrastructure)
└── modules/
```

#### Recommendations

⚠️ **Warning**: Module organization could be improved
- **Issue**: The main infrastructure logic is split between `infra/main.bicep` and `azure/containerapps.bicep`, which may cause confusion
- **Recommendation**: Consider consolidating all infrastructure modules under `infra/modules/` directory for better organization and consistency with azd conventions
- **Impact**: Low - Current structure works but could be more maintainable

⚠️ **Warning**: Limited use of infrastructure modules
- **Issue**: Only one module exists in `infra/modules/` (acr.bicep), while other infrastructure is in `azure/containerapps.bicep`
- **Recommendation**: Break down `azure/containerapps.bicep` into smaller, reusable modules in `infra/modules/` (e.g., `container-app.bicep`, `storage-account.bicep`, `search-service.bicep`, etc.)
- **Impact**: Low - Current approach works but limits reusability

✅ **Positive Note**: The infrastructure properly references both files and follows subscription-level deployment pattern

---

### 3. GitHub Actions Workflows

**Category**: workflows  
**Status**: ✅ **COMPLIANT**

#### Description
GitHub Actions workflow exists at `.github/workflows/gbb-demo.yml` with proper azd integration.

#### Findings

**✅ Compliant Items**:
- Workflow file properly configured for azd deployment
- Uses official Azure actions: `Azure/setup-azd@v2.1.0`
- Federated credential authentication configured
- Proper OIDC permissions: `id-token: write`, `contents: read`
- Environment-specific configuration with variables
- Bicep target scope detection (subscription vs resource group)
- Dynamic resource group creation when needed
- Two-stage provision based on target scope detection
- `azd provision --no-prompt` correctly invoked
- `azd deploy --no-prompt` correctly invoked
- All required environment variables passed as secrets
- Workflow dispatch enabled for manual deployment

**Workflow Steps**:
1. ✅ Checkout code
2. ✅ Install azd CLI
3. ✅ Azure login with federated credentials
4. ✅ azd auth login
5. ✅ Detect target scope (subscription/resourceGroup)
6. ✅ Create resource group (if needed)
7. ✅ Provision infrastructure
8. ✅ Deploy application

**Environment Variables Passed**:
- ✅ AZURE_OPENAI_GPT_VISION_API_KEY
- ✅ AZURE_OPENAI_GPT_VISION_ENDPOINT
- ✅ AZURE_SPEECH_REGION
- ✅ AZURE_STORAGE_ACCOUNT_URL
- ✅ AZURE_SEARCH_ENDPOINT
- ✅ DATABASE_URL
- ✅ All frontend configuration variables
- ✅ NEXTAUTH_SECRET

#### Recommendations

✅ No critical issues. The workflow is well-structured and follows azd deployment best practices.

⚠️ **Minor Enhancement**: Consider adding a deployment validation step
- **Recommendation**: Add a post-deployment smoke test to verify the services are running
- **Example**:
  ```yaml
  - name: Validate Deployment
    run: |
      FRONTEND_URL=$(azd env get-values | grep SERVICE_FRONTEND_URL | cut -d'=' -f2)
      curl -f $FRONTEND_URL || exit 1
  ```
- **Impact**: Low - Would improve deployment confidence

---

### 4. Environment Configuration & Secrets Management

**Category**: configuration  
**Status**: ✅ **COMPLIANT**

#### Description
Environment configuration is properly documented with sample files and follows security best practices.

#### Findings

**✅ Compliant Items**:
- `sample.env` file provides template for all required configuration
- Clear documentation of required environment variables
- Proper separation of backend and frontend configuration
- Azure service endpoints documented (not API keys)
- Managed identity usage documented: `AZURE_SPEECH_USE_MANAGED_IDENTITY="true"`
- Database URL managed via `config/database_urls.json`
- NextAuth configuration included for authentication
- Comments explain optional variables
- No sensitive values in sample file

**Configuration Structure**:
```
Backend Configuration:
- Azure OpenAI endpoint and deployment
- Azure Speech region with managed identity
- Azure Storage Account URL
- Azure AI Search endpoint
- Database URL (managed separately)

Frontend Configuration:
- OpenAI configuration
- Search endpoint and index
- NextAuth configuration
```

**Security Practices**:
- ✅ No hardcoded API keys in repository
- ✅ Managed identity preferred over API keys
- ✅ Sensitive values marked as secrets in GitHub Actions
- ✅ Environment variable loading via hooks in azure.yaml
- ✅ Secure parameters in Bicep marked with `@secure()`

#### Recommendations

✅ Excellent security posture. Configuration management follows Azure best practices.

💡 **Enhancement**: Add environment variable validation
- **Recommendation**: Create a script to validate that all required environment variables are set before deployment
- **Example**: `scripts/validate-env.sh` that checks for required variables
- **Impact**: Low - Would prevent deployment failures due to missing configuration

---

### 5. Documentation

**Category**: documentation  
**Status**: ✅ **COMPLIANT**

#### Description
Comprehensive documentation exists for azd deployment and local development.

#### Findings

**✅ Compliant Items**:
- README.md includes dedicated "Deploy to Azure with azd" section
- Prerequisites clearly listed (azd, Docker, Azure subscription)
- Quick start guide with `azd init` and `azd up` commands
- Environment variables documented in table format
- Manual deployment option documented with PowerShell script
- Best practices documentation in `.github/azure-bestpractices.md`
- Bicep deployment best practices in `.github/bicep-deployment-bestpractices.md`
- Copilot instructions reference azd compliance checking
- Sample environment file with detailed comments

**README Section Structure**:
```markdown
## Deploy to Azure with Azure Developer CLI (azd)

### Prerequisites
- Azure Developer CLI
- Docker
- Azure subscription

### Quick Start
1. Copy sample.env to .env
2. azd init
3. azd up
```

**Additional Documentation**:
- ✅ Azure Best Practices document (zero API keys policy)
- ✅ Bicep Deployment Best Practices document
- ✅ Security guidelines and authentication patterns
- ✅ RBAC configuration examples
- ✅ Container Apps best practices
- ✅ GitHub Copilot instructions for azd compliance

#### Recommendations

✅ Documentation is comprehensive and follows best practices.

💡 **Enhancement**: Add troubleshooting section
- **Recommendation**: Add common deployment issues and solutions
- **Example Topics**:
  - Docker build failures
  - Azure RBAC permission errors
  - Container startup failures
  - Environment variable configuration issues
- **Impact**: Low - Would reduce support burden

💡 **Enhancement**: Add architecture diagram
- **Recommendation**: Include a diagram showing the deployed architecture
- **Example**: Visual representation of Container Apps, Storage, Search, Cosmos DB, and networking
- **Impact**: Low - Would improve understanding of the solution

---

## Service Definition Validation

### Backend Service

**Status**: ✅ **COMPLIANT**

- Project: `.` (repository root)
- Language: `python`
- Host: `containerapp`
- Docker: `Dockerfile.backend`
- ✅ Matches repository structure (Python FastAPI application)
- ✅ Dockerfile exists and is properly configured

### Frontend Service

**Status**: ✅ **COMPLIANT**

- Project: `src/ui`
- Language: `js` (Next.js)
- Host: `containerapp`
- Docker: `../../Dockerfile.frontend` (relative to src/ui)
- ✅ Matches repository structure (Next.js UI application)
- ✅ Dockerfile exists and is properly configured

---

## Compliance Checklist Summary

### Critical Requirements
- [x] ✅ azure.yaml file present with valid schema
- [x] ✅ Infrastructure templates exist (Bicep)
- [x] ✅ Templates are syntactically correct
- [x] ✅ Deployment workflows reference azd commands correctly
- [x] ✅ Service definitions match application structure
- [x] ✅ Environment variables documented
- [x] ✅ Secrets management properly configured

### Best Practices
- [x] ✅ Subscription-level Bicep deployment
- [x] ✅ Managed identity for authentication
- [x] ✅ No API keys in repository
- [x] ✅ GitHub Actions with federated credentials
- [x] ✅ Environment variable loading via hooks
- [x] ✅ Comprehensive README with azd instructions
- [x] ✅ Security best practices documented
- [x] ✅ Proper Docker configuration
- [x] ✅ Resource naming conventions followed
- [x] ✅ Tags for environment tracking

### Nice to Have
- [ ] ⚠️ Consolidated module structure under infra/modules/
- [ ] ⚠️ Deployment validation in workflow
- [ ] ⚠️ Environment variable validation script
- [ ] ⚠️ Troubleshooting documentation
- [ ] ⚠️ Architecture diagram

---

## Risk Assessment

### High Priority Issues
**None** - All critical azd requirements are met.

### Medium Priority Issues
**None** - All standard requirements are met.

### Low Priority Issues
1. **Module Organization**: Infrastructure split between `infra/` and `azure/` directories
   - **Impact**: Maintainability could be improved
   - **Effort**: Medium
   - **Priority**: Low

2. **Deployment Validation**: No automated validation after deployment
   - **Impact**: Could miss deployment issues
   - **Effort**: Low
   - **Priority**: Low

3. **Documentation Enhancements**: Missing troubleshooting and architecture diagram
   - **Impact**: User experience
   - **Effort**: Low
   - **Priority**: Low

---

## Recommendations by Priority

### Immediate Actions (None Required)
The repository is fully compliant and ready for production use.

### Short-term Enhancements (Optional)
1. **Add deployment validation step** to GitHub Actions workflow
2. **Create environment variable validation script**
3. **Add troubleshooting section** to README.md

### Long-term Improvements (Optional)
1. **Consolidate infrastructure modules** under `infra/modules/`
2. **Break down containerapps.bicep** into smaller, reusable modules
3. **Add architecture diagram** to documentation
4. **Create automated compliance testing** in CI/CD

---

## Conclusion

The VIPER repository demonstrates **excellent compliance** with Azure Developer CLI requirements. The project is well-structured, follows security best practices, and includes comprehensive documentation. The infrastructure templates, deployment workflows, and configuration management all align with azd conventions.

### Strengths
1. ✅ Comprehensive azure.yaml configuration with hooks
2. ✅ Proper Bicep templates with subscription-level deployment
3. ✅ Secure authentication using managed identities
4. ✅ Well-documented deployment process
5. ✅ GitHub Actions workflow with federated credentials
6. ✅ Excellent security practices documentation
7. ✅ No API keys or secrets in repository

### Areas for Enhancement (Optional)
1. ⚠️ Module organization could be more consolidated
2. ⚠️ Add deployment validation and environment variable checking
3. ⚠️ Enhance documentation with troubleshooting and diagrams

**Final Verdict**: ✅ **FULLY COMPLIANT** - Ready for production deployment with azd.

---

## Additional Resources

For more information about Azure Developer CLI, refer to:
- [Azure Developer CLI Documentation](https://learn.microsoft.com/azure/developer/azure-developer-cli/)
- [Azure Developer CLI GitHub Repository](https://github.com/Azure/azure-dev)
- Repository-specific best practices:
  - `.github/azure-bestpractices.md`
  - `.github/bicep-deployment-bestpractices.md`
  - `.github/copilot-instructions.md`

---

**Report Generated**: 2026-02-06  
**Reviewed By**: Azure Developer CLI Compliance Agent  
**Status**: ✅ COMPLIANT
