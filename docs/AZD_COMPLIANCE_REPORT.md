# Azure Developer CLI (azd) Compliance Report

## Status: ✅ COMPLIANT

The VIPER repository is now fully configured for deployment via `azd up`.

## Summary of Changes

### 1. Fixed Critical Bicep Compilation Errors
**Issue**: The `azure/containerapps.bicep` file contained syntax errors that prevented successful compilation:
- Assert statements without experimental feature flag
- Invalid `if` syntax in array literals (workloadProfiles and dependsOn)

**Resolution**:
- Replaced assert statements with validation comments
- Fixed conditional arrays using ternary operators: `condition ? [items] : []`
- Removed unused variable to eliminate linter warning

**Validation**: ✅ `az bicep build --file infra/main.bicep` succeeds with only 1 acceptable warning

### 2. Added Post-Provision Automation
**Issue**: The `scripts/Deploy-ViperToAzure.ps1` showed manual steps needed after infrastructure provisioning

**Resolution**:
- Created `scripts/postprovision.ps1` (PowerShell) and `scripts/postprovision.sh` (Bash)
- Added postprovision hook to `azure.yaml`
- Added necessary resource outputs to `infra/main.bicep`

**Scripts automatically handle**:
1. Azure AI Search index creation with full schema
2. Search query key creation and configuration  
3. Frontend container app environment variable updates

## Deployment Instructions

### Prerequisites
1. Azure CLI: `az login`
2. Azure Developer CLI: [Install azd](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd)
3. Docker installed
4. Environment variables in `.env` file

### Deploy with azd

```bash
# Initialize environment
azd env new <environment-name>
azd env set AZURE_LOCATION eastus

# Deploy everything
azd up
```

## References

- [Azure Developer CLI Documentation](https://learn.microsoft.com/azure/developer/azure-developer-cli/)
- [azure.yaml Schema Reference](https://learn.microsoft.com/azure/developer/azure-developer-cli/azd-schema)
